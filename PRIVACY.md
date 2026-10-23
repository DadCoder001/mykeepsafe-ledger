# Privacy

**Your financial data never leaves your computer.** MyKeepSafe Ledger has no accounts, no cloud service, no analytics and no telemetry. There is no server operated by anyone else for it to send data to.

## Where your data lives

| How you run it | Where data is saved |
|---|---|
| `npm start` (recommended) | `data/ledger.json` in the project folder, or the folder set in `KSL_DATA_DIR`. Daily backups are kept in `data/backups/` (last 14 days). |
| `npm run dev` / opening the built files in a browser | The browser's local storage on this computer. Use **Export Backup** regularly. |
| Desktop app | A JSON file you choose on your disk, plus the app's local storage. |

## The AI assistant

The assistant only works with a model running **on your own computer**:
- **Ollama:** the recommended option for the browser version.
- **LM Studio, or a llama.cpp server:** advanced users can connect these instead.
- **The desktop app's built-in model:** the desktop build can download and run one itself.

The app sends your financial summary and your questions to that local model and nowhere else. There are no cloud AI providers.

## How the app enforces this

These aren't just promises. The app is built so it *can't* send your data elsewhere:

- **The browser blocks outside connections.** A Content Security Policy allows the page to connect only to itself and to `localhost` / `127.0.0.1`, so any request to the internet is refused.
- **Model connections are loopback-only.** The model server address must be `localhost`, `127.0.0.1` or `::1`, and the app rejects anything else. The local server's model proxy can only forward to ports on `127.0.0.1`.
- **The local server only accepts this computer.** `npm start` listens on `127.0.0.1` only. It also rejects requests whose `Host` or `Origin` isn't local, which stops other websites from reading or changing your data.
- **No third-party scripts, fonts or images.** Everything the page loads is bundled with the app.
- **Automated tests watch for leaks.** A test fails the build if the app makes any request to a host other than `localhost`.

## The only network downloads

You start these yourself, and nothing about you or your finances is sent:
- `npm install`: downloads the app's code dependencies.
- Installing a model: Ollama, or the desktop app's downloader, fetches the model file from Hugging Face.
- Links you click, such as "Open an issue on GitHub", which open in your normal browser.
