import React from 'react'

export default function CommandPalette() {
  return (
    <div id="cmd-palette" className="cmd-overlay" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(e) => { if (e.target === e.currentTarget) window.closeCommandPalette?.() }}>
      <div className="cmd-box">
        <div className="cmd-search-row">
          <span className="cmd-search-icon">⌘</span>
          <input id="cmd-input" className="cmd-input" type="text" placeholder="Search views, actions, months…" autoComplete="off" />
          <span className="cmd-kbd">Esc</span>
        </div>
        <div id="cmd-results" className="cmd-results"></div>
      </div>
    </div>
  )
}
