# MyKeepSafe Ledger — Codebase Guide

Open-source, local-only personal finance app: users act as their own CFO, with an AI assistant that explains their numbers. **Users' financial data must never leave their computer** — see gotcha #5.

## Architecture

**Stack:** React/Vite frontend · local Node server (`npm start`) · optional Tauri 2 desktop app (Rust + llama.cpp)  
**Build output:** Vite builds `src/` → `dist/`. `server/index.mjs` serves `dist/` and saves data to `data/ledger.json`. Tauri bundles `dist/` + Rust into an NSIS installer.  
**State:** `window.state` is the single source of truth, owned by `src/public/legacy/app.js`. React reads it reactively via CustomEvent dispatches — it never owns state directly.

**Two JS layers:**
- `src/public/legacy/app.js` — ~3000-line monolith. Defines all state, rendering, and business logic as regular (non-window) functions.
- `src/bridge.js` — ES module that selectively overrides and extends app.js by assigning to `window.*`. Loaded after app.js.

- `src/ai/` — ES modules for the AI CFO: `snapshot.js` (every number the model sees, computed in JS), `prompts.js` (system prompt + safe renderer), `providers.js` (Ollama / OpenAI-compatible / desktop llama.cpp, loopback-only), `chat.js` (conversation), `index.js` (window exports).

**React views** (`src/views/`, `src/components/`) — render UI reactively. They call app.js/bridge.js/src/ai functions exclusively through `window.func?.()`. They do not import from app.js directly.

**Persistence:** `saveData()` writes localStorage, then `saveToLinkedFile()` — which in server mode (`window._ksServerMode`) PUTs to `/api/data`, in Tauri writes the linked file, in Chrome/Edge writes a File System Access handle.

---

## Critical Gotchas

### 1. window.* Exposure — functions in app.js are NOT automatically global

Any function defined in `app.js` as `function foo() {}` is **not** on `window`. React components calling `window.foo?.()` will silently get `undefined` — the optional chaining swallows the failure with no error.

**Rule:** When adding a new function to app.js that any React component needs to call, add it to the window exports block near the bottom of app.js. AI functions are exported from `src/ai/index.js`:
```js
window.myNewFunction = myNewFunction;
```

**How we got burned:** Extracted `NotificationPanel` to fix a stacking context bug. `closeNotificationPanel`, `openNotificationPanel` and 20 other functions were called from React but silently no-oping because they were never exposed to window. Every modal and the notification panel close were broken.

**Audit command:**
```bash
grep -n "window\.\w*?\?\." src/components/**/*.jsx src/views/**/*.jsx | grep -v "window\.__TAURI__\|window\.state\|window\.Chart"
# Each result is a window.func call — verify the function is in the exports block
```

---

### 2. CSS Stacking Context — overlays must live at App root

`position: sticky`, `transform`, `filter`, `will-change`, and `isolation: isolate` all create a new stacking context. Any `position: fixed` child is then positioned relative to that ancestor, not the viewport — the overlay appears clipped and click events may not register outside the ancestor's bounds.

**Rule:** Panels and modals with full-viewport overlays (`position: fixed`, `z-index: 9999`) must be mounted as **direct children of `<App>`**, never inside a sidebar, header, or any element with one of the above properties.

**Current pattern in `src/App.jsx`:**
```jsx
// Correct: panels mounted at root, outside <main> and <Sidebar>
<NotificationPanel />
<TxSlidePanel />
<AISidePanel />
<ModelSetupModal />
```

**How we got burned:** `NotificationPanel` was inside `<Sidebar>` which has `position: sticky`. The panel overlay was constrained to the sidebar bounds, couldn't cover the full screen, and close button clicks didn't register.

---

### 3. data-action vs window.func — two distinct call patterns

The app has two parallel mechanisms for calling JS from UI elements:

| Pattern | How it works | Where to use |
|---|---|---|
| `data-action="func(arg)"` | Global click listener in app.js uses `new Function()` — executes in global scope, no `window.` needed | Legacy HTML strings built in app.js/bridge.js, TxSlidePanel, AISidePanel |
| `window.func?.()` in JSX | React calls `window.func` directly — **requires explicit window assignment** | React event handlers (`onClick`, `onChange`) |

Mixing them inconsistently is the primary source of silent failures. When writing new React components, prefer `window.func?.()` with an explicit window export. When writing legacy HTML strings inside app.js/bridge.js template literals, prefer `data-action`.

---

### 4. Rust — always create parent directories before writing files

`tokio::fs::File::create(path)` fails silently (returns an error) if the parent directory doesn't exist. The user sees nothing.

**Rule:** Always precede `File::create` with `create_dir_all`:
```rust
if let Some(parent) = path.parent() {
    tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
}
let file = tokio::fs::File::create(&dest_path).await.map_err(|e| e.to_string())?;
```

**How we got burned:** The "Set Up AI" button silently failed on first launch because `{app_data_dir}/models/` didn't exist yet. Users had to hit "Skip for now."

---

### 5. Local-only — nothing may leave the user's computer

Users' financial data must never be sent off-device: no cloud AI, no bank-sync services, no telemetry, no third-party CDNs.

**Rule:** Never add a network call to a non-loopback host. Model endpoints go through `parseLoopbackUrl()` in `src/ai/providers.js`; in server mode they go through `/api/llm/<port>/…`, which only reaches 127.0.0.1. Bundle fonts/scripts with npm instead of loading them from a CDN. Keep the CSP in `src/index.html`, `server/index.mjs` and `src-tauri/tauri.conf.json` locked to `'self'` + localhost.

**How it is enforced:** the CSP blocks other hosts; `tests/features/feature-ai-cfo.spec.js` fails on any non-localhost request; `npm run check:release` fails on cloud endpoints, CDNs, payment or bank-sync code.

### 6. AI output is untrusted — render it escaped

Model replies can echo merchant names from imported CSVs. **Rule:** never put model text into `innerHTML` directly; use `renderAIText()` from `src/ai/prompts.js` (escapes, then applies a tiny Markdown subset).

### 7. Give the model numbers, don't ask it to compute them

Small local models get arithmetic wrong. **Rule:** add new figures to `buildFinancialSnapshot()` in `src/ai/snapshot.js` (with a test in `tests/core/core-ai-snapshot.spec.js`) rather than asking the model to calculate. Check answer quality with `npm run eval:models` (needs Ollama).

### 8. Tauri 2 command arguments are camelCase in JS

A Rust parameter `dest_path` is passed from JS as `{ destPath }`. Snake_case keys are silently missing on the Rust side.

---

## Build Commands

```bash
# Local server (production build + data file in ./data)
npm start

# Dev server (Vite only, localStorage persistence)
npm run dev

# Run Playwright tests (starts the dev server on :8000 and npm start on :8200)
npx playwright test --reporter=line

# Everything that must pass before publishing
npm run check:release

# Desktop app (Windows; loads the VS build environment first)
npm run desktop:build
# Installer lands at: src-tauri/target/release/bundle/nsis/MyKeepSafe Ledger_1.0.0_x64-setup.exe
```

---

## Testing

**Playwright tests** run against the Vite dev server (`http://localhost:8000`), not the compiled desktop app. They also run against the `npm start` server (`http://localhost:8200`, throwaway data folder). They cover React/JS/bridge/AI logic but not native Tauri commands (file dialogs, model download). AI tests stub Ollama with `page.route` — no real model needed.

**Gotcha — collapsible form:** The add-transaction form is collapsed by default. Before filling `#income-amount` or `#expense-amount` in any test:
```js
await page.click('.add-row-toggle');
await page.waitForTimeout(200);
```

**Gotcha — income deletion:** Income rows cannot be deleted via the `.tx-del` button — it's a no-op by design. Delete income via the slide panel: click the row → wait for `#tx-slide-overlay` → click `#tsp-delete-btn`.

**Expense rows render after income rows** in the transaction list. With 1 income + 1 expense, use `.tx-del.last()` or `.tx-del.nth(1)` to target the expense.

---

## Learning Loop — How to Update This File

When you hit a new bug, architectural surprise, or "I wish I'd known this sooner" moment, add it here before closing the task. Format:

```
### N. Short title

One sentence: what the rule is.

**Rule:** The actionable guidance.

**How we got burned:** What actually happened (keeps the rule from feeling arbitrary).
```

**Audit command — run after adding any new app.js function that React will call:**
```bash
npm run audit:exports
# ✓ All window.* calls are exported.  ← what you want to see
```

`scripts/audit-window-exports.mjs` greps all `window.func?.()` and `data-action="func()"` callsites across React components, cross-references against both `app.js` and `bridge.js` exports, and exits non-zero listing any gaps.

The goal: the next session starts with this context loaded, skips the debugging detour, and goes straight to the correct approach.
