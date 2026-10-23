import React from 'react'

export default function AISidePanel() {
  return (
    <aside className="ai-side-panel open" id="ai-side-panel" style={{ display: 'none' }}>
      <div className="asp-header">
        <div className="asp-title-row">
          <span className="asp-icon">✦</span>
          <div>
            <div className="asp-title">AI assistant</div>
            <div className="asp-privacy">🔒 Local · on device</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <button className="asp-settings-btn" data-action="switchView('ai')" title="AI settings">⚙</button>
          <button className="asp-toggle-btn" id="asp-toggle-btn" data-action="toggleAIPanel()" title="Collapse AI panel">◀</button>
        </div>
      </div>
      <div className="asp-body" id="asp-body">
        <div className="asp-quick" id="asp-quick"></div>
        <div className="asp-response" id="asp-response"></div>
        <div className="asp-input-row">
          <input id="asp-input" className="asp-input" type="text" placeholder="Ask about your finances…" data-keydown="if(event.key==='Enter')askAIPanel()" />
          <button className="asp-send-btn" data-action="askAIPanel()">↑</button>
        </div>
        <div style={{ fontSize: '9.5px', color: 'var(--ink3)', marginTop: '4px', lineHeight: 1.3 }}>
          Not financial, legal, tax, or investment advice.
        </div>
      </div>
      <div className="asp-collapsed-strip" id="asp-collapsed-strip">
        <button className="asp-col-btn" data-action="toggleAIPanel()" title="Expand AI">✦</button>
      </div>
    </aside>
  )
}
