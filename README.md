# MyKeepSafe Ledger

**Be your own CFO. Your financial data never leaves your computer.**

MyKeepSafe Ledger is a free, open-source personal finance app you run on your own machine. Track income, spending, budgets, bills, debts and net worth. Ask a **private AI assistant** what changed, where your money went and what to do next. The AI runs on your computer too, so nothing is sent to the cloud.

- **No accounts. No subscriptions. No cloud. No telemetry.**
- **Your data lives in a plain JSON file** that you own and can back up.
- **An AI CFO that explains your numbers,** using a local model you choose.

---

## Quick start

You need [Node.js 20+](https://nodejs.org).

```bash
git clone https://github.com/DadCoder001/mykeepsafe-ledger.git
cd mykeepsafe-ledger
npm install
npm start
```

Open **http://localhost:8000**. Your data is saved to `data/ledger.json` in the project folder, with a daily backup kept in `data/backups/` for the last 14 days. To keep data somewhere else, set `KSL_DATA_DIR`, for example `KSL_DATA_DIR=~/Documents/ledger npm start`.

The server only accepts connections from your own computer. Other devices on your network can't reach it.

### Set up the AI assistant (2 minutes)

1. Install **[Ollama](https://ollama.com/download)**, a free app that runs AI models locally.
2. In MyKeepSafe Ledger, open **✦ AI CFO** and click **Install** on a model:
   - **Fast (Llama 3.2 3B):** quickest answers, best for older laptops or 8 GB of RAM.
   - **Recommended (Qwen3.5 4B):** most detailed answers, for most laptops.
   - **Best quality (Qwen3.5 9B):** for 16 GB+ RAM.
3. Ask a question.

Already use LM Studio or a llama.cpp server? Choose **Other local server** instead. Details are in [docs/LOCAL_MODELS.md](docs/LOCAL_MODELS.md).

---

## What it does

### Track your money
- **Month view:** income and expenses, budget, savings goal, category budgets, spending charts.
- **Overview:** trends across months, category trends, savings rate, best and worst months.
- **Fixed bills:** rent, subscriptions and insurance, applied to each month, with upcoming-bill reminders.
- **Accounts and net worth:** checking, savings, investments, debts, and how your net worth changes over time.
- **Debt planner:** avalanche vs. snowball payoff plans, and what extra payments save you.
- **Forecast:** your projected balance for the next 90 days, with what-if scenarios.
- **CSV import:** bring in statements exported from your bank. Optionally, the AI suggests categories.
- **Households:** tag transactions by person.

### Your AI CFO
- **It explains, it doesn't guess.** The app calculates every figure itself before the model sees it: totals, savings rate, category changes vs. last month and your average, budget status, unusual expenses, subscriptions, debt interest and emergency runway. The model's job is to explain what those numbers mean and what to do. It's told to quote the figures, never invent them.
- **Follow-up questions:** ask "what changed?" and then "why?". It remembers the conversation.
- **✦ Explain buttons** on insights, charts, your net worth and your forecast ask the AI about that exact thing.
- **Monthly CFO review:** a one-click write-up of what happened, what changed, what to watch, and next steps. You can save it to that month.
- **Private by design:** the assistant can only talk to a model on your computer. See [PRIVACY.md](PRIVACY.md).

> AI answers come from a small local model. They can be wrong and are not financial, tax, legal or investment advice.

---

## Other ways to run it

| Mode | Command | Data saved to |
|---|---|---|
| **Local server (recommended)** | `npm start` | `data/ledger.json` on disk |
| Development | `npm run dev` | Your browser's local storage (export backups regularly) |
| Desktop app (Windows-first) | `npm run desktop:build` | A JSON file you choose. Includes a built-in model, so no Ollama is needed. See [HOW-TO-BUILD.md](HOW-TO-BUILD.md). |

To try the app without entering anything, choose **Explore with sample data** on the welcome screen. Nothing you do in the sample is saved.

---

## Privacy

Your financial data stays on your computer. This isn't just a policy; it's enforced in code:
- **The browser blocks outside connections.** The page may only connect to itself and to `localhost` (Content Security Policy).
- **AI model servers must be on this computer.** Any other address is refused.
- **The local server only answers this computer.** It rejects requests from other sites and devices.
- **No third-party scripts, fonts or trackers.**
- **A test fails the build if the app ever calls anything outside `localhost`.**

Full details are in [PRIVACY.md](PRIVACY.md).

---

## Tech stack

| Layer | Technology |
|---|---|
| UI | React 19 + a legacy JS core (`src/public/legacy/app.js`), built with Vite |
| Charts | Chart.js (bundled) |
| Local server | Node.js, no dependencies (`server/`) |
| AI | Ollama, any OpenAI-compatible local server, or llama.cpp in the desktop app |
| Desktop | Tauri 2 + Rust |
| Tests | Playwright |

## Project layout

```
server/               npm start: serves the app + saves data/ledger.json
src/
  ai/                 AI CFO: financial snapshot, prompts, local model providers, chat
  public/legacy/      app.js — core state, rendering, business logic
  bridge.js           extends app.js for the React views
  views/, components/ React UI
src-tauri/            optional desktop app (Rust, llama.cpp)
tests/                Playwright tests (core, features, integration)
scripts/              release check, export audit, model evaluation
docs/                 LOCAL_MODELS.md
```

## Contributing

Bug reports and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues privately; see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Free to use, change and share.
