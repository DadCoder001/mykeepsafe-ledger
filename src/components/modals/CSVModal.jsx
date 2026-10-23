import React from 'react'

export default function CSVModal() {
  return (
    <div id="csv-modal" className="csv-modal-overlay" style={{ display: 'none' }}>
      <div className="csv-modal">
        <div className="csv-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Import CSV Transactions</h3>
            <button className="csv-ai-suggest-btn" id="csv-ai-suggest-btn" data-action="askAICategories()">✦ AI Suggest</button>
          </div>
        </div>
        <div className="csv-modal-body">
          <div className="csv-link-step" id="csv-link-step">
            <div className="csv-link-step-icon">🏦</div>
            <div className="csv-link-step-body" style={{ flex: 1, minWidth: 0 }}>
              <div className="csv-link-step-title">Which account are these transactions from?</div>
              <select id="csv-link-account" style={{ width: '100%', marginTop: '4px' }} onChange={(e) => window.handleCSVAccountChange?.(e.target.value)}></select>
              <div id="csv-new-account-form" style={{ display: 'none', marginTop: '10px', background: 'var(--paper3)', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink2)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Create New Account</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  <input id="csv-new-acct-name" className="sb-input" placeholder="Account name (e.g. Truist Checking)" style={{ fontSize: '12.5px' }} />
                  <select id="csv-new-acct-type" className="sb-input" style={{ fontSize: '12.5px' }}>
                    <option value="cash">Checking / Cash</option>
                    <option value="savings">Savings</option>
                    <option value="credit">Credit Card</option>
                    <option value="invested">Brokerage / Invested</option>
                    <option value="retirement">Retirement (401k / IRA)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input id="csv-new-acct-balance" className="sb-input" type="number" step="0.01" placeholder="Starting balance (optional)" style={{ flex: 1, fontSize: '12.5px' }} />
                  <button onClick={() => window.createAccountFromCSV?.()} style={{ padding: '6px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Create &amp; Link</button>
                  <button onClick={() => { document.getElementById('csv-new-account-form').style.display = 'none'; document.getElementById('csv-link-account').value = '' }} style={{ padding: '6px 10px', background: 'none', border: '0.5px solid var(--border)', borderRadius: '6px', fontSize: '12.5px', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
          <div className="csv-mapping" id="csv-mapping"></div>
          <div className="csv-stats" id="csv-stats"></div>
          <div style={{ overflowX: 'auto' }}><table className="csv-preview" id="csv-preview"><thead id="csv-preview-head"></thead><tbody id="csv-preview-body"></tbody></table></div>
          <div id="csv-dedup-section" style={{ display: 'none' }}></div>
        </div>
        <div className="csv-modal-footer">
          <div className="csv-actions">
            <button className="csv-cancel" onClick={() => window.closeCSVModal?.()}>Cancel</button>
            <button className="csv-confirm" id="csv-confirm-btn" onClick={() => window.confirmCSVImport?.()}>Import</button>
          </div>
        </div>
      </div>
    </div>
  )
}
