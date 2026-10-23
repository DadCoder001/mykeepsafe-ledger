use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager, State};

use llama_cpp_2::{
    context::params::LlamaContextParams,
    llama_backend::LlamaBackend,
    llama_batch::LlamaBatch,
    model::params::LlamaModelParams,
    model::{AddBos, LlamaChatMessage, LlamaModel},
    sampling::LlamaSampler,
};

// ── FILE DIALOGS ──────────────────────────────────────────────

#[tauri::command]
async fn pick_save_file(suggested_name: String) -> Option<String> {
    rfd::AsyncFileDialog::new()
        .set_file_name(&suggested_name)
        .add_filter("JSON", &["json"])
        .save_file()
        .await
        .map(|h| h.path().to_string_lossy().into_owned())
}

#[tauri::command]
async fn pick_open_file() -> Option<String> {
    rfd::AsyncFileDialog::new()
        .add_filter("JSON", &["json"])
        .pick_file()
        .await
        .map(|h| h.path().to_string_lossy().into_owned())
}

#[tauri::command]
async fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

// ── LLM STATE ─────────────────────────────────────────────────
// The llama.cpp backend can only be initialised once per process, so it lives
// for the whole app. The loaded model stays in memory between questions.

static BACKEND: OnceLock<LlamaBackend> = OnceLock::new();

fn backend() -> Result<&'static LlamaBackend, String> {
    if let Some(b) = BACKEND.get() {
        return Ok(b);
    }
    let b = LlamaBackend::init().map_err(|e| e.to_string())?;
    let _ = BACKEND.set(b);
    BACKEND.get().ok_or_else(|| "llama.cpp backend unavailable".to_string())
}

const CONTEXT_TOKENS: u32 = 8192;
const BATCH_TOKENS: usize = 1024;

#[derive(Default)]
struct LlmState {
    status: String,
    model: Option<Arc<LlamaModel>>,
}

#[derive(serde::Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

// ── LLM COMMANDS ─────────────────────────────────────────────

#[tauri::command]
async fn get_llm_status(state: State<'_, Mutex<LlmState>>) -> Result<String, String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    Ok(if s.status.is_empty() { "unloaded".to_string() } else { s.status.clone() })
}

#[tauri::command]
async fn load_model(model_path: String, state: State<'_, Mutex<LlmState>>) -> Result<(), String> {
    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        s.status = "loading".to_string();
        s.model = None;
    }

    let result = tokio::task::spawn_blocking(move || {
        let backend = backend()?;
        LlamaModel::load_from_file(backend, &model_path, &LlamaModelParams::default())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?;

    let mut s = state.lock().map_err(|e| e.to_string())?;
    match result {
        Ok(model) => {
            s.status = "ready".to_string();
            s.model = Some(Arc::new(model));
            Ok(())
        }
        Err(e) => {
            s.status = format!("error:{}", e);
            Err(e)
        }
    }
}

// Formats the conversation with the model's own chat template.
fn build_prompt(model: &LlamaModel, messages: Vec<ChatMessage>) -> Result<String, String> {
    let chat = messages
        .into_iter()
        .map(|m| LlamaChatMessage::new(m.role, m.content))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let template = model.chat_template(None).map_err(|e| e.to_string())?;
    let mut prompt = model
        .apply_chat_template(&template, &chat, true)
        .map_err(|e| e.to_string())?;
    // Qwen3-family templates think step by step by default, which is slow on
    // laptops. An empty think block is how their templates switch it off; the
    // app pre-computes every number, so the model doesn't need to reason
    // through arithmetic.
    let raw = template.to_str().unwrap_or_default();
    if raw.contains("<think>") && !prompt.trim_end().ends_with("</think>") {
        prompt.push_str("<think>\n\n</think>\n\n");
    }
    Ok(prompt)
}

fn generate(model: &LlamaModel, prompt: &str, max_tokens: u32) -> Result<String, String> {
    let backend = backend()?;
    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(std::num::NonZeroU32::new(CONTEXT_TOKENS))
        .with_n_batch(BATCH_TOKENS as u32);
    let mut ctx = model.new_context(backend, ctx_params).map_err(|e| e.to_string())?;

    let tokens = model.str_to_token(prompt, AddBos::Never).map_err(|e| e.to_string())?;
    if tokens.is_empty() {
        return Err("Empty prompt".to_string());
    }
    let budget = CONTEXT_TOKENS as usize - max_tokens as usize;
    if tokens.len() > budget {
        return Err(format!(
            "The question and financial summary are too long for this model ({} tokens, limit {}). Start a new conversation.",
            tokens.len(),
            budget
        ));
    }

    // Feed the prompt in batch-sized chunks; only the final token needs logits.
    let mut batch = LlamaBatch::new(BATCH_TOKENS, 1);
    let last = tokens.len() - 1;
    for (chunk_index, chunk) in tokens.chunks(BATCH_TOKENS).enumerate() {
        batch.clear();
        for (i, token) in chunk.iter().enumerate() {
            let pos = chunk_index * BATCH_TOKENS + i;
            batch
                .add(*token, pos as i32, &[0], pos == last)
                .map_err(|e| e.to_string())?;
        }
        ctx.decode(&mut batch).map_err(|e| e.to_string())?;
    }

    let mut sampler = LlamaSampler::chain_simple([
        LlamaSampler::penalties(64, 1.1, 0.0, 0.0),
        LlamaSampler::top_p(0.9, 1),
        LlamaSampler::temp(0.3),
        LlamaSampler::dist(42),
    ]);
    let mut output: Vec<u8> = Vec::new();
    let mut n_cur = tokens.len() as i32;

    for _ in 0..max_tokens {
        let token = sampler.sample(&ctx, -1);
        sampler.accept(token);
        if model.is_eog_token(token) {
            break;
        }
        let piece = model
            .token_to_piece_bytes(token, 64, false, None)
            .map_err(|e| e.to_string())?;
        output.extend_from_slice(&piece);
        batch.clear();
        batch.add(token, n_cur, &[0], true).map_err(|e| e.to_string())?;
        n_cur += 1;
        ctx.decode(&mut batch).map_err(|e| e.to_string())?;
    }

    Ok(String::from_utf8_lossy(&output).into_owned())
}

#[tauri::command]
async fn chat_llm(
    messages: Vec<ChatMessage>,
    max_tokens: u32,
    state: State<'_, Mutex<LlmState>>,
) -> Result<String, String> {
    let model = {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.model
            .clone()
            .ok_or_else(|| "No model loaded yet. Open AI settings and click Load Model.".to_string())?
    };
    let max_tokens = max_tokens.clamp(16, 2048);
    tokio::task::spawn_blocking(move || {
        let prompt = build_prompt(&model, messages)?;
        generate(&model, &prompt, max_tokens)
    })
    .await
    .map_err(|e| e.to_string())?
}

// Only the curated model files on Hugging Face may be downloaded.
const ALLOWED_MODEL_URL_PREFIX: &str = "https://huggingface.co/";

#[tauri::command]
async fn download_model(app: AppHandle, url: String, dest_path: String) -> Result<(), String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    if !url.starts_with(ALLOWED_MODEL_URL_PREFIX) || !url.ends_with(".gguf") {
        return Err("Only .gguf model files from huggingface.co can be downloaded.".to_string());
    }

    let path = std::path::Path::new(&dest_path);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }
    let part_path = format!("{}.part", dest_path);

    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Download failed: HTTP {}", response.status()));
    }
    let total = response.content_length().unwrap_or(0);
    let mut stream = response.bytes_stream();
    let mut file = tokio::fs::File::create(&part_path).await.map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        let _ = app.emit(
            "model-download-progress",
            serde_json::json!({ "downloaded_bytes": downloaded, "total_bytes": total }),
        );
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);

    if total > 0 && downloaded != total {
        let _ = tokio::fs::remove_file(&part_path).await;
        return Err(format!("Download incomplete ({} of {} bytes). Please try again.", downloaded, total));
    }
    tokio::fs::rename(&part_path, &dest_path).await.map_err(|e| e.to_string())?;
    // The frontend checks for this marker to know the model is fully downloaded.
    let meta = serde_json::json!({ "url": url, "bytes": downloaded }).to_string();
    tokio::fs::write(format!("{}.meta", dest_path), meta)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── APP ENTRY ─────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(LlmState::default()))
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_save_file,
            pick_open_file,
            write_text_file,
            read_text_file,
            load_model,
            chat_llm,
            get_llm_status,
            download_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
