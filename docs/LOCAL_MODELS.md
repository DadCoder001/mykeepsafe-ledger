# Running the AI assistant on your own computer

MyKeepSafe Ledger's AI assistant only uses a model running **on your machine**. Nothing is sent to a cloud service. This page shows how to set one up.

## Recommended: Ollama (browser version, `npm start`)

1. **Install Ollama once** from <https://ollama.com/download> (Windows, macOS, Linux). It runs quietly in the background (look for the llama icon in your system tray or menu bar).
   After installing, Ollama may open a "Run Ollama" window that suggests running a terminal command. You don't need to do that: just close the window.
2. Open MyKeepSafe Ledger → **✦ AI** settings. The app detects Ollama automatically.
3. Click **Install** on one of the three curated models. Ollama downloads it, and a progress bar shows how far along it is.
4. Select it, then ask a question.

### Which model should I pick?

| Model | Ollama tag | Download | Good for |
|---|---|---|---|
| Llama 3.2 3B — *Fast* | `llama3.2:3b` | ~2 GB | Older laptops or 8 GB of RAM; quickest answers |
| **Qwen3.5 4B — *Recommended*** | `qwen3.5:4b` | ~3.5 GB | Most laptops (8–16 GB RAM); most detailed answers |
| Qwen3.5 9B — *Best quality* | `qwen3.5:9b` | ~7 GB | 16 GB+ RAM, or a GPU |

**How these were chosen:** we asked each model the same CFO questions about sample finances and checked every dollar figure in its answers against the app's numbers (`npm run eval:models`). On a budget 4-core laptop with no GPU, both Llama 3.2 3B and Qwen3.5 4B quoted 100% of figures correctly. Llama 3.2 3B averaged about 31 seconds per answer, and follow-up questions started in about a second. Qwen3.5 4B gave more detail but averaged about 78 seconds. Faster computers are much quicker.

The app suggests a tier based on your computer's memory, where the browser reports it.

The models aren't part of this project. Ollama or the desktop app downloads them straight from their publishers under their own licenses: Qwen3.5 is Apache-2.0, and Llama 3.2 uses the [Llama 3.2 Community License](https://www.llama.com/llama3_2/license/).

**Bigger or different models also work.** Pull any model with Ollama, for example `ollama pull llama3.1:8b` or `ollama pull gemma4:12b`. It then appears under **Other models on your Ollama**.

### Speed tips
- The first answer after picking a model is slower while Ollama loads it into memory.
- The app turns the model's step-by-step "thinking" mode off for chat, which is much faster on laptops. The app calculates all the numbers itself before asking the model, so nothing is lost.

## Alternative: LM Studio or llama.cpp server

In **✦ AI** settings, open **Advanced: other local server** and enter the server's address:

| Server | Address |
|---|---|
| LM Studio | `http://localhost:1234/v1` (start the server from LM Studio's Developer tab) |
| llama.cpp `llama-server` | `http://localhost:8080/v1` |

Any server with an OpenAI-compatible API works (`/v1/models`, `/v1/chat/completions`). Click **Detect models**, pick one, then **Test connection**.

The address must be on this computer (`localhost`, `127.0.0.1` or `::1`). The app refuses any other address, so your data can't be sent elsewhere by mistake.

**CORS:** when you run the app with `npm start`, requests go through the app's own local server, so no CORS setup is needed. If you use `npm run dev` with LM Studio, enable **CORS** in LM Studio's server settings.

## Desktop app

The desktop build includes llama.cpp, so it needs no separate install:
1. Open **✦ AI** settings.
2. Pick one of the three curated models.
3. Click **Load Model**.

The model downloads once from Hugging Face into the app's data folder, then runs entirely offline.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Ollama isn't running" | Start the Ollama app, or run `ollama serve`, then click **Check again**. |
| Answers are very slow | Try the Fast model (Llama 3.2 3B) and close other heavy apps. Follow-up questions in the same conversation start much faster than the first one. |
| "Too long for this model" | Click **New conversation**. Long chats plus your financial summary can exceed a small model's memory. |
| Numbers in an answer look wrong | The app gives the model exact figures, but small models can still misquote them. Check against the Month and Overview tabs, and try a larger model. |
