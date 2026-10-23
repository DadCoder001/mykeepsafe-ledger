import React, { useState, useEffect, useCallback } from 'react'

const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download'
const isDesktop = () => typeof window.__TAURI__ !== 'undefined'

function ProgressBar({ pct, text }) {
  return (
    <div className="ai-progress">
      <div className="webllm-progress-bar"><div className="webllm-progress-fill" style={{ width: `${pct}%` }}></div></div>
      {text && <div className="webllm-progress-text">{text}</div>}
    </div>
  )
}

function OllamaSetup({ settings }) {
  const [status, setStatus] = useState(null) // null = checking
  const [pulls, setPulls] = useState(() => window.getOllamaPulls?.() || {})
  const models = window.CURATED_MODELS || []
  const suggested = window.suggestedModelId?.()

  const refresh = useCallback(async () => {
    setStatus(null)
    setStatus(await window.ollamaStatus?.() || { running: false, models: [] })
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    function onProgress(e) {
      const { tag, ...p } = e.detail
      setPulls(prev => ({ ...prev, [tag]: p }))
      if (p.status === 'done') {
        refresh()
        if (!window.state?.settings?.aiModel) window.aiSetModel?.(tag)
      }
    }
    document.addEventListener('ks:ollama-progress', onProgress)
    return () => document.removeEventListener('ks:ollama-progress', onProgress)
  }, [refresh])

  if (status === null) return <p className="ai-muted">Looking for Ollama on this computer…</p>

  if (!status.running) {
    return (
      <div className="ai-callout">
        <strong>Ollama isn&rsquo;t running on this computer.</strong>
        <p>Ollama is a free app that runs AI models locally. Install it once, start it, then come back here.</p>
        <div className="ai-row">
          <a className="sb-btn ai-inline-btn" href={OLLAMA_DOWNLOAD_URL} target="_blank" rel="noreferrer">Install Ollama (one-time)</a>
          <button className="sb-btn sb-btn-secondary ai-inline-btn" onClick={refresh}>Check again</button>
        </div>
      </div>
    )
  }

  const installed = new Set(status.models.map(m => m.name))
  const isInstalled = tag => installed.has(tag) || installed.has(`${tag}:latest`)
  const curatedTags = new Set(models.map(m => m.ollamaTag))
  const others = status.models.filter(m => !curatedTags.has(m.name))

  return (
    <div>
      <p className="ai-muted">✓ Ollama is running. Pick a model — it downloads once and runs on this computer.</p>
      <div className="ai-model-grid">
        {models.map(m => {
          const pull = pulls[m.ollamaTag]
          const selected = settings.aiModel === m.ollamaTag
          const pct = pull && pull.total ? Math.round((pull.completed / pull.total) * 100) : 0
          return (
            <div key={m.id} className={`ai-model-card${selected ? ' selected' : ''}`}>
              <div className="ai-model-tier">
                {m.tier}{m.id === suggested && <span className="ai-badge-small">Suggested for this computer</span>}
              </div>
              <div className="ai-model-name">{m.name} <span className="ai-muted">· {m.ollamaSize}</span></div>
              <div className="ai-muted">{m.blurb}</div>
              {pull && pull.status !== 'done' && pull.status !== 'error'
                ? <ProgressBar
                    pct={/verif|writing|success/.test(pull.status) ? 100 : pct}
                    text={/verif|writing|success/.test(pull.status) ? 'Verifying download… (this can take a minute)'
                      : pull.total ? `Downloading… ${pct}%` : 'Starting download…'} />
                : isInstalled(m.ollamaTag)
                  ? <button className={`sb-btn ai-inline-btn${selected ? '' : ' sb-btn-secondary'}`} disabled={selected} onClick={() => window.aiSetModel?.(m.ollamaTag)}>
                      {selected ? '✓ In use' : 'Use this model'}
                    </button>
                  : <button className="sb-btn ai-inline-btn" onClick={() => window.installOllamaModel?.(m.ollamaTag)}>Install</button>}
              {pull?.status === 'error' && <div className="ai-error-text">{pull.error}</div>}
            </div>
          )
        })}
      </div>
      {others.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <label className="ai-label">Other models on your Ollama</label>
          <select className="sb-input" value={curatedTags.has(settings.aiModel) ? '' : settings.aiModel || ''} onChange={e => e.target.value && window.aiSetModel?.(e.target.value)}>
            <option value="">— Choose another installed model —</option>
            {others.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
          </select>
        </div>
      )}
    </div>
  )
}

function CustomServerSetup({ settings }) {
  const [url, setUrl] = useState(settings.localEndpoint || 'http://localhost:1234/v1')
  const [models, setModels] = useState([])
  const [message, setMessage] = useState('')

  async function detect() {
    setMessage('Looking for models…')
    try {
      window.aiSetLocalEndpoint?.(url)
      const found = await window.listLocalServerModels?.(url)
      setModels(found || [])
      setMessage(found?.length ? `Found ${found.length} model${found.length === 1 ? '' : 's'}.` : 'The server is running but reported no models. Type the model name below.')
      if (found?.length && !settings.aiModel) window.aiSetModel?.(found[0])
    } catch (e) {
      setMessage(e.message.includes('this computer') ? e.message : `Couldn't reach a server at ${url}. Is it running?`)
    }
  }

  return (
    <div>
      <p className="ai-muted">For LM Studio, a llama.cpp server, or any OpenAI-compatible server running on this computer.</p>
      <label className="ai-label">Server address</label>
      <div className="ai-row">
        <input className="sb-input" style={{ flex: 1, marginBottom: 0 }} value={url} onChange={e => setUrl(e.target.value)} placeholder="http://localhost:1234/v1" />
        <button className="sb-btn ai-inline-btn" onClick={detect}>Detect models</button>
      </div>
      <div className="ai-row ai-muted" style={{ gap: '0.75rem', margin: '0.35rem 0 0.75rem' }}>
        <button className="ai-link-btn" onClick={() => setUrl('http://localhost:1234/v1')}>LM Studio</button>
        <button className="ai-link-btn" onClick={() => setUrl('http://localhost:8080/v1')}>llama.cpp</button>
      </div>
      {message && <p className="ai-muted">{message}</p>}
      <label className="ai-label">Model</label>
      {models.length > 0
        ? <select className="sb-input" value={settings.aiModel || ''} onChange={e => window.aiSetModel?.(e.target.value)}>
            <option value="">— Choose a model —</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        : <input className="sb-input" defaultValue={settings.aiModel || ''} placeholder="Model name, e.g. qwen3.5-4b" onBlur={e => window.aiSetModel?.(e.target.value.trim())} />}
    </div>
  )
}

function DesktopSetup({ settings }) {
  const models = window.CURATED_MODELS || []
  const current = models.find(m => m.id === settings.aiModel) || models.find(m => m.recommended)
  return (
    <div>
      <p className="ai-muted">The desktop app runs the model itself with llama.cpp — no other software needed.</p>
      <div className="ai-row">
        <select className="sb-input" style={{ flex: 1, marginBottom: 0 }} value={current?.id || ''} onChange={e => window.aiSetModel?.(e.target.value)}>
          {models.map(m => <option key={m.id} value={m.id}>{m.tier} — {m.name} ({(m.sizeMb / 1000).toFixed(1)} GB)</option>)}
        </select>
        <button className="sb-btn ai-inline-btn" data-action="loadLlamaCppModel()">Load Model</button>
      </div>
      <div id="webllm-progress" className="webllm-progress" style={{ display: 'none' }}>
        <div className="webllm-progress-bar"><div id="webllm-progress-fill" className="webllm-progress-fill"></div></div>
        <div id="webllm-progress-text" className="webllm-progress-text">Loading model...</div>
      </div>
      {current && <p className="ai-muted">{current.blurb}. Downloaded once from Hugging Face, then runs offline.</p>}
    </div>
  )
}

export default function AIView() {
  const [tick, setTick] = useState(0)
  const [test, setTest] = useState('')

  useEffect(() => {
    function handler() { setTick(v => v + 1) }
    document.addEventListener('ks:ai-render', handler)
    return () => document.removeEventListener('ks:ai-render', handler)
  }, [])

  // The conversation is rendered outside React (shared with the side panel).
  useEffect(() => { window.renderAIThreads?.() })

  const settings = (tick && window.state?.settings) || {}
  const aiEnabled = !!settings.aiEnabled
  const provider = settings.aiProvider || (isDesktop() ? 'llamacpp' : 'ollama')
  const quickPrompts = window.getAIQuickPrompts?.('month') || []

  async function runTest() {
    setTest('Testing…')
    try {
      await window.testAIConnection?.()
      setTest('✓ The model answered. You are all set.')
    } catch (e) {
      setTest(`✗ ${e.message}`)
    }
  }

  const tabs = [
    { key: 'ollama', label: 'Ollama (recommended)' },
    { key: 'openai', label: 'Other local server' },
    ...(isDesktop() ? [{ key: 'llamacpp', label: 'Built-in (desktop)' }] : []),
  ]

  return (
    <div id="ai-view">
      <div className="view-header">
        <h1>AI CFO</h1>
        <p>Ask about your money in plain English. The model runs on this computer — your financial data never leaves it.</p>
      </div>

      <div className="tx-section" style={{ marginBottom: '2rem' }}>
        <div className="tx-table-header">Settings</div>
        <div style={{ padding: '1.25rem' }}>
          <div className="toggle-row" style={{ marginBottom: '1rem' }}>
            <span style={{ fontWeight: 500 }}>Enable AI assistant</span>
            <div id="ai-toggle" className={`toggle${aiEnabled ? ' on' : ''}`} data-action="toggleAI()"></div>
          </div>

          <label className="ai-label">Where the model runs</label>
          <div className="ai-segmented" role="tablist">
            {tabs.map(t => (
              <button key={t.key} role="tab" aria-selected={provider === t.key} className={provider === t.key ? 'active' : ''} onClick={() => window.aiSetProvider?.(t.key)}>{t.label}</button>
            ))}
          </div>

          <div style={{ marginTop: '1rem' }}>
            {!tick ? null
              : provider === 'openai' ? <CustomServerSetup settings={settings} />
              : provider === 'llamacpp' ? <DesktopSetup settings={settings} />
              : <OllamaSetup settings={settings} />}
          </div>

          <div className="ai-row" style={{ marginTop: '1rem' }}>
            <button className="sb-btn sb-btn-secondary ai-inline-btn" onClick={runTest}>Test connection</button>
            {test && <span className="ai-muted">{test}</span>}
          </div>
          <small className="ai-muted" style={{ display: 'block', marginTop: '0.75rem' }}>
            🔒 The app only talks to models on this computer (localhost). It sends the model a summary of your finances plus your question — nothing goes to the internet.
          </small>
        </div>
      </div>

      <div className="ai-section" id="ai-chat-section" style={{ display: aiEnabled ? 'block' : 'none' }}>
        <div className="ai-header">
          <span className="sec-title" style={{ marginBottom: 0 }}>Ask your CFO</span>
          <span className="ai-badge" id="ai-badge">🔒 On this computer</span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--ink3)', margin: '-0.5rem 0 0.75rem' }}>
          Answers are generated by a small local model from your own numbers. They can be wrong and are not financial, legal, tax, or investment advice.
        </div>
        <div className="ai-quick" id="ai-quick-prompts">
          {quickPrompts.map((p, i) => (
            <button key={i} className="ai-chip" onClick={() => window.askAI?.(p)}>{p}</button>
          ))}
          <button className="ai-chip" onClick={() => window.askAINarrative?.()}>Write my monthly CFO review</button>
        </div>
        <div className="ai-prompt-row">
          <input id="ai-input" type="text" placeholder="Ask about your finances…" onKeyDown={e => { if (e.key === 'Enter') window.askAI?.() }} />
          <button id="ai-ask-btn" onClick={() => window.askAI?.()}>Ask</button>
        </div>
        <div id="ai-response" className="ai-response" style={{ display: 'none' }}></div>
      </div>
    </div>
  )
}
