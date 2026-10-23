# Building the MyKeepSafe Ledger desktop app (optional)

Most people should run the browser version with `npm start` (see the [README](README.md)). The desktop app is optional. It adds:
- **A built-in model**, so you don't need Ollama.
- **Native file dialogs** for saving your ledger.

The desktop build is **Windows-first**. macOS and Linux builds should work with Tauri's usual setup but aren't regularly tested.

## Prerequisites (Windows)

Install these once:

| Tool | Where to get it |
|---|---|
| **Node.js 20+** | https://nodejs.org |
| **Rust (stable)** | https://rustup.rs (run `rustup-init.exe`) |
| **Visual Studio Build Tools 2022** | https://visualstudio.microsoft.com/downloads/ → "Build Tools for Visual Studio 2022". Install the **"Desktop development with C++"** workload *and* the individual component **"C++ Clang Compiler for Windows"** (llama.cpp needs it). |
| **WebView2 Runtime** | Already on Windows 11. Windows 10: https://developer.microsoft.com/en-us/microsoft-edge/webview2/ |

Open a new terminal and check:
```
rustc --version
cargo --version
```

## Build the installer

```powershell
npm install
npm run desktop:build
```

The first build takes 5–15 minutes, because Rust compiles llama.cpp. Later builds are much faster.

`desktop:build` runs `scripts/run-tauri-with-vsenv.ps1`. This loads the Visual Studio build environment first, so `cmake` and the MSVC linker can be found.

The installer is created at:
```
src-tauri\target\release\bundle\nsis\MyKeepSafe Ledger_1.0.0_x64-setup.exe
```

The installer is **not code-signed**, so Windows SmartScreen may warn you when you run it. Choose **More info → Run anyway**.

## Run in dev mode

```powershell
npm run desktop:dev
```

This opens the app with live reload. Changes in `src/` show up instantly. Changes in `src-tauri/src/lib.rs` trigger a Rust recompile.

## macOS / Linux

Install the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS, plus `cmake` and a C++ compiler. Then:
```bash
npm install
npm run desktop:build:unix   # or desktop:dev:unix
```

## Using the built-in model

1. Open **✦ AI CFO**.
2. Choose **Built-in (desktop)**.
3. Pick a model, then click **Load Model**.

The model file downloads once from Hugging Face into the app's data folder, then runs fully offline. See [docs/LOCAL_MODELS.md](docs/LOCAL_MODELS.md).

## Uninstall

Go to **Add or remove programs**, search for "MyKeepSafe Ledger", and choose Uninstall. Your data isn't deleted by the uninstaller: that's your JSON file, the app's local storage, and any downloaded model in the app data folder.

## Troubleshooting

| Problem | Fix |
|---|---|
| "vswhere.exe not found", or "`link.exe` not found" | Install VS Build Tools 2022 with the **Desktop development with C++** workload. |
| `is cmake not installed?` | Use `npm run desktop:build` (it loads the VS environment), not `tauri build` directly. |
| `Unable to find libclang` | Add **C++ Clang Compiler for Windows** in the Visual Studio Installer, or install LLVM and set `LIBCLANG_PATH` to its `bin` folder. |
| Blank window | Run `npm run build` to check that the frontend compiles, then rebuild. |
| Rust errors after pulling new code | Run `rustup update stable`. |
