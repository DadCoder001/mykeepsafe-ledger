# Contributing to MyKeepSafe Ledger

Thanks for helping! This project has one non-negotiable rule:

> **Users' financial data must never leave their computer.** No cloud services, no analytics, no third-party CDNs, no remote AI. If a feature needs the internet to handle user data, it doesn't belong here.

## Getting set up

```bash
npm install
npx playwright install chromium   # first time only
npm run dev                       # http://localhost:8000 (browser storage)
npm start                         # production build + data/ledger.json
```

For the AI assistant, install [Ollama](https://ollama.com) and a model (see [docs/LOCAL_MODELS.md](docs/LOCAL_MODELS.md)). The automated tests don't need one; they stub Ollama.

## Before you open a pull request

```bash
npx playwright test --reporter=line   # all tests should pass
npm run check:release                 # privacy, secrets, licenses, tests
```

CI runs both on every pull request.

## How the code is organised

Read [CLAUDE.md](CLAUDE.md). It's the codebase guide (written for AI coding assistants, and just as useful for people). The gotchas that bite most often:

1. **`window.*` exports.** Functions in `src/public/legacy/app.js` aren't global. Anything React calls via `window.foo?.()` must be added to the exports block. AI functions are exported from `src/ai/index.js`. Run `npm run audit:exports`.
2. **Overlays mount at the `<App>` root,** never inside the sidebar or other sticky or transformed parents.
3. **Model output is untrusted.** Render it with `renderAIText()`, never raw `innerHTML`.
4. **Give the model numbers; don't ask it to compute them.** New figures go in `src/ai/snapshot.js`, with a test.
5. **Network calls go to `localhost` only.** The CSP and tests enforce this.

## Testing notes

- The add-transaction form is collapsed by default. Click `.add-row-toggle` before filling `#income-amount` / `#expense-amount`.
- Income rows are deleted through the slide panel (`#tsp-delete-btn`), not `.tx-del`.
- AI tests use `page.route('http://localhost:11434/**', …)` to fake Ollama.
- To check real answer quality, use `npm run eval:models -- qwen3.5:4b` with Ollama running.

## Reporting bugs and ideas

Open a GitHub issue with:
- steps to reproduce
- what you expected
- what happened
- your OS and browser

**Never attach your real ledger file.** Make a small example instead. For security problems, follow [SECURITY.md](SECURITY.md).
