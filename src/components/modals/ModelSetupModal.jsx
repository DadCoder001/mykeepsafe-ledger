import React, { useState, useEffect } from 'react'

const SETUP_DONE_KEY = 'ks_model_setup_done'

export default function ModelSetupModal() {
  const [visible, setVisible] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState({ pct: 0, text: '' })
  const [selectedModel, setSelectedModel] = useState(null)

  useEffect(() => {
    if (localStorage.getItem(SETUP_DONE_KEY)) return
    if (typeof window.__TAURI__ === 'undefined') return

    const models = window.CURATED_MODELS || []
    const suggested = window.suggestedModelId?.()
    setSelectedModel(models.find(m => m.id === suggested) || models.find(m => m.recommended) || models[0] || null)

    window.__TAURI__.core.invoke('get_llm_status').then(status => {
      if (status === 'unloaded') setVisible(true)
    }).catch(() => {})
  }, [])

  async function handleSetup() {
    if (!selectedModel) return
    setDownloading(true)
    setProgress({ pct: 0, text: `Downloading ${selectedModel.name}…` })

    const { listen } = window.__TAURI__.event
    const { appDataDir, join } = window.__TAURI__.path
    const modelPath = await join(await appDataDir(), 'models', selectedModel.filename)

    const unlisten = await listen('model-download-progress', evt => {
      const { downloaded_bytes, total_bytes } = evt.payload
      const pct = total_bytes > 0 ? Math.round((downloaded_bytes / total_bytes) * 100) : 0
      const mb = Math.round(downloaded_bytes / 1024 / 1024)
      const total = Math.round(total_bytes / 1024 / 1024)
      setProgress({ pct, text: `Downloading… ${mb} MB / ${total} MB (${pct}%)` })
    })

    try {
      await window.__TAURI__.core.invoke('download_model', { url: selectedModel.url, destPath: modelPath })
      setProgress({ pct: 100, text: 'Loading model…' })
      await window.__TAURI__.core.invoke('load_model', { modelPath })
      localStorage.setItem(SETUP_DONE_KEY, '1')
      window.aiSetProvider?.('llamacpp')
      window.aiSetModel?.(selectedModel.id)
      setVisible(false)
    } catch (e) {
      setProgress({ pct: 0, text: `Error: ${e}` })
    } finally {
      unlisten()
      setDownloading(false)
    }
  }

  function handleSkip() {
    localStorage.setItem(SETUP_DONE_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  const gguf = window.CURATED_MODELS || []

  return (
    <div className="upgrade-overlay" style={{ display: 'flex' }}>
      <div className="upgrade-modal" style={{ maxWidth: '440px' }}>
        <div className="ugm-header">
          <span className="ugm-lock">✦</span>
          <h2>Set Up On-Device AI</h2>
          <p>Your AI CFO explains your finances and answers questions — the model runs on this computer, and nothing is sent anywhere.</p>
        </div>
        <div className="ugm-body">
          {!downloading && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: '6px' }}>Choose a model</label>
              {gguf.map(m => (
                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', cursor: 'pointer' }}>
                  <input type="radio" name="model-select" value={m.id} checked={selectedModel?.id === m.id} onChange={() => setSelectedModel(m)} />
                  <span style={{ fontSize: '0.88rem' }}><strong>{m.tier}</strong> — {m.name}, {(m.sizeMb / 1000).toFixed(1)} GB download<br /><span style={{ color: 'var(--ink3)', fontSize: '0.78rem' }}>{m.blurb}</span></span>
                </label>
              ))}
            </div>
          )}
          {downloading && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                <div style={{ height: '100%', background: 'var(--accent)', width: `${progress.pct}%`, transition: 'width 0.3s' }}></div>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--ink2)' }}>{progress.text}</div>
            </div>
          )}
          <div className="ugm-actions">
            <button className="ugm-btn-primary" onClick={handleSetup} disabled={downloading || !selectedModel}>
              {downloading ? 'Setting up…' : 'Set Up AI (recommended)'}
            </button>
            <button className="ugm-btn-ghost" onClick={handleSkip} disabled={downloading}>Skip for now</button>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '0.75rem', textAlign: 'center' }}>
            Runs 100% on your device · No data leaves your computer
          </div>
        </div>
      </div>
    </div>
  )
}
