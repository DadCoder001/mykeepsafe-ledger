import React from 'react'

// Small "✦ Explain" button that asks the AI CFO about the thing next to it.
// Hidden while the assistant is turned off.
export default function ExplainButton({ kind, detail, label = 'Explain' }) {
  if (!window.state?.settings?.aiEnabled) return null
  return (
    <button
      type="button"
      className="ai-explain-btn"
      title="Ask your AI CFO to explain this"
      onClick={e => { e.stopPropagation(); window.explainThis?.(kind, detail) }}
    >
      ✦ {label}
    </button>
  )
}
