// Local model providers. Every endpoint must be on this computer: the app
// refuses any non-loopback address, and in server mode (`npm start`) requests
// go through the app's own /api/llm proxy, which can only reach 127.0.0.1.
//
//   ollama   — Ollama's native API (/api/chat, /api/tags, /api/pull)
//   openai   — any OpenAI-compatible local server (LM Studio, llama.cpp, …)
//   llamacpp — the desktop app's bundled llama.cpp (Tauri command)

export const OLLAMA_DEFAULT_URL = 'http://localhost:11434'
export const CUSTOM_DEFAULT_URL = 'http://localhost:1234/v1'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function parseLoopbackUrl(raw) {
  let url
  try {
    url = new URL(String(raw || '').trim())
  } catch {
    throw new Error('Enter a full address, for example http://localhost:1234/v1')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('The address must start with http:// or https://')
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('For your privacy, the model server must run on this computer (localhost or 127.0.0.1).')
  }
  return url
}

export function isLoopbackUrl(raw) {
  try { parseLoopbackUrl(raw); return true } catch { return false }
}

// Resolve base + path to the URL the browser should call.
function endpoint(base, path) {
  const url = parseLoopbackUrl(String(base).replace(/\/+$/, '') + path)
  if (window._ksServerMode) {
    const port = url.port || (url.protocol === 'https:' ? '443' : '80')
    return `/api/llm/${port}${url.pathname}${url.search}`
  }
  return url.href
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 3000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function errorFrom(res) {
  const text = await res.text().catch(() => '')
  try {
    const j = JSON.parse(text)
    return j.error?.message || j.error || j.message || text || `HTTP ${res.status}`
  } catch {
    return text || `HTTP ${res.status}`
  }
}

// Reads a streaming body line by line (NDJSON or SSE).
async function readLines(res, onLine) {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line) onLine(line)
    }
  }
  if (buffer.trim()) onLine(buffer.trim())
}

// Removes reasoning blocks some models emit even with thinking turned off.
export function stripThinking(text) {
  let t = String(text || '')
  t = t.replace(/<think>[\s\S]*?<\/think>/g, '')
  if (t.includes('</think>')) t = t.slice(t.lastIndexOf('</think>') + 8)
  if (/^\s*<think>/.test(t)) return ''
  return t.trim()
}

// ── Ollama ────────────────────────────────────────────────────

export async function ollamaStatus(base = OLLAMA_DEFAULT_URL) {
  try {
    const res = await fetchWithTimeout(endpoint(base, '/api/tags'), {}, 2500)
    if (!res.ok) return { running: false, models: [] }
    const data = await res.json()
    const models = (data.models || []).map(m => ({ name: m.name || m.model, size: m.size || 0 }))
    return { running: true, models }
  } catch {
    return { running: false, models: [] }
  }
}

// Asks Ollama to download a model. onProgress({ status, completed, total }).
export async function pullOllamaModel(base, tag, onProgress) {
  const res = await fetch(endpoint(base, '/api/pull'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: tag, stream: true }),
  })
  if (!res.ok) throw new Error(await errorFrom(res))
  let failure = null
  await readLines(res, line => {
    let evt
    try { evt = JSON.parse(line) } catch { return }
    if (evt.error) failure = evt.error
    else onProgress?.(evt)
  })
  if (failure) throw new Error(failure)
}

async function ollamaChat({ base, model, messages, maxTokens, onToken }, allowThinkFlag = true) {
  const body = {
    model,
    messages,
    stream: !!onToken,
    keep_alive: '30m', // stay in memory between questions; reloading costs seconds on laptops
    options: { temperature: 0.3, num_ctx: 8192, num_predict: maxTokens },
  }
  if (allowThinkFlag) body.think = false
  const res = await fetch(endpoint(base, '/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const msg = await errorFrom(res)
    // Older Ollama versions or models without a thinking mode reject `think`.
    if (allowThinkFlag && /think/i.test(msg)) return ollamaChat({ base, model, messages, maxTokens, onToken }, false)
    if (/not found/i.test(msg)) throw new Error(`The model "${model}" isn't installed in Ollama. Install it from ✦ AI settings.`)
    throw new Error(msg)
  }
  if (!onToken) {
    const data = await res.json()
    return data.message?.content || ''
  }
  let text = ''
  await readLines(res, line => {
    let evt
    try { evt = JSON.parse(line) } catch { return }
    if (evt.error) throw new Error(evt.error)
    const piece = evt.message?.content || ''
    if (piece) { text += piece; onToken(text) }
  })
  return text
}

// ── OpenAI-compatible local servers ───────────────────────────

export async function listOpenAIModels(base) {
  const res = await fetchWithTimeout(endpoint(base, '/models'), {}, 4000)
  if (!res.ok) throw new Error(await errorFrom(res))
  const data = await res.json()
  return (data.data || data.models || []).map(m => m.id || m.name).filter(Boolean)
}

async function openAIChat({ base, model, messages, maxTokens, onToken }) {
  const res = await fetch(endpoint(base, '/chat/completions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: maxTokens, stream: !!onToken }),
  })
  if (!res.ok) throw new Error(await errorFrom(res))
  if (!onToken) {
    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  }
  let text = ''
  await readLines(res, line => {
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (payload === '[DONE]') return
    let evt
    try { evt = JSON.parse(payload) } catch { return }
    const piece = evt.choices?.[0]?.delta?.content || ''
    if (piece) { text += piece; onToken(text) }
  })
  return text
}

// ── Desktop (bundled llama.cpp) ───────────────────────────────

async function desktopChat({ messages, maxTokens }) {
  const invoke = window.__TAURI__?.core?.invoke
  if (!invoke) throw new Error('The built-in model is only available in the desktop app.')
  return invoke('chat_llm', { messages, maxTokens })
}

// ── Public entry point ────────────────────────────────────────

export function describeProvider(settings = {}) {
  const provider = settings.aiProvider
  if (provider === 'llamacpp') return { provider, label: 'Built-in model', ready: true }
  if (provider === 'openai') return { provider, label: 'Local server', base: settings.localEndpoint || CUSTOM_DEFAULT_URL, ready: !!settings.aiModel }
  return { provider: 'ollama', label: 'Ollama', base: settings.ollamaUrl || OLLAMA_DEFAULT_URL, ready: !!settings.aiModel }
}

/**
 * Send a conversation to the configured local model and return its reply.
 * @param {object} args { settings, messages, maxTokens, onToken(textSoFar) }
 */
export async function chatComplete({ settings, messages, maxTokens = 600, onToken }) {
  const p = describeProvider(settings)
  const model = settings.aiModel
  const wrapped = onToken ? text => onToken(stripThinking(text)) : undefined
  let text
  if (p.provider === 'llamacpp') {
    text = await desktopChat({ messages, maxTokens })
  } else {
    if (!model) throw new Error('Choose a model in ✦ AI settings first.')
    try {
      text = p.provider === 'openai'
        ? await openAIChat({ base: p.base, model, messages, maxTokens, onToken: wrapped })
        : await ollamaChat({ base: p.base, model, messages, maxTokens, onToken: wrapped })
    } catch (e) {
      if (e instanceof TypeError || /Failed to fetch|NetworkError|not reachable/i.test(e.message)) {
        throw new Error(p.provider === 'openai'
          ? `Couldn't reach your local model server at ${p.base}. Is it running?`
          : "Couldn't reach Ollama. Make sure the Ollama app is running, then try again.")
      }
      throw e
    }
  }
  return stripThinking(text)
}
