import React from 'react'

export default function FileSetupModal() {
  return (
    <div id="file-setup-modal" className="modal-overlay" style={{ display: 'none' }}>
      <div className="file-setup-modal">
        <div className="fsm-icon">💾</div>
        <h3>Save Your Data to a File</h3>
        <p className="fsm-desc">MyKeepSafe Ledger keeps your data in your browser by default, but we recommend linking a JSON file on your computer so your data is always backed up and portable.</p>
        <div className="fsm-steps">
          <div className="fsm-step"><span className="fsm-step-num">1</span>Click <strong>Choose File Location</strong></div>
          <div className="fsm-step"><span className="fsm-step-num">2</span>Pick a folder and give the file a name (e.g. <code>mykeepsafe-ledger.json</code>)</div>
          <div className="fsm-step"><span className="fsm-step-num">3</span>Every change you make is saved there automatically</div>
        </div>
        <div className="fsm-actions">
          <button className="fsm-btn-primary" data-action="linkFileFromSetup()">📂 Choose File Location</button>
          <button className="fsm-btn-skip" data-action="closeFileSetupModal()">Skip for now (browser storage only)</button>
        </div>
      </div>
    </div>
  )
}
