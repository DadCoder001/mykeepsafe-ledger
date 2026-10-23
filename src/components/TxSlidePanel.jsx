import React from 'react'

export default function TxSlidePanel() {
  return (
    <div id="tx-slide-overlay" className="tx-slide-overlay" aria-modal="true" role="dialog" aria-label="Transaction details">
      <div className="tx-slide-backdrop" id="tx-slide-backdrop" data-action="closeTxPanel()"></div>
      <div className="tx-slide-panel">
        <div className="tsp-header">
          <span className="tsp-title" id="tsp-title">Transaction</span>
          <button className="tsp-close" data-action="closeTxPanel()" aria-label="Close">✕</button>
        </div>
        <div className="tsp-body">
          <div className="tsp-field">
            <span className="tsp-label">Type</span>
            <div className="tsp-type-toggle">
              <button className="tsp-type-btn" id="tsp-type-inc" data-action="setTspType('income')">+ Income</button>
              <button className="tsp-type-btn" id="tsp-type-exp" data-action="setTspType('expense')">− Expense</button>
              <button className="tsp-type-btn" id="tsp-type-xfr" data-action="setTspType('transfer')">↔ Transfer</button>
            </div>
          </div>
          <div className="tsp-field">
            <span className="tsp-label">Description</span>
            <input id="tsp-desc" className="tsp-input" type="text" placeholder="e.g. Whole Foods" />
          </div>
          <div className="tsp-amount-row">
            <div className="tsp-field" style={{ flex: 1 }}>
              <span className="tsp-label">Amount</span>
              <input id="tsp-amount" className="tsp-input" type="number" min="0" step="0.01" placeholder="0.00" />
            </div>
            <div className="tsp-field" style={{ flex: 1 }}>
              <span className="tsp-label">Date</span>
              <input id="tsp-date" className="tsp-input" type="date" />
            </div>
          </div>
          <div className="tsp-field" id="tsp-cat-field">
            <span className="tsp-label">Category</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select id="tsp-cat" className="tsp-input" style={{ flex: 1 }}>
                <datalist id="tsp-cat-list"></datalist>
              </select>
              <button type="button" id="tsp-split-toggle" className="tsp-split-toggle-btn" title="Split this transaction" data-action="toggleTspSplit()">✂ Split</button>
            </div>
          </div>
          <div id="tsp-split-section" style={{ display: 'none' }}>
            <div className="tsp-label" style={{ marginBottom: '0.35rem' }}>Split into categories</div>
            <div id="tsp-splits-container"></div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', alignItems: 'center' }}>
              <button type="button" className="tsp-add-split-btn" data-action="addTspSplitRow()">+ Add split</button>
              <span id="tsp-split-total-hint" style={{ fontSize: '0.8rem', color: 'var(--ink3)' }}></span>
            </div>
          </div>
          <div className="tsp-field">
            <span className="tsp-label">Tags</span>
            <input id="tsp-tags" className="tsp-input" type="text" placeholder="e.g. #groceries #weekly" />
          </div>
          <div className="tsp-field" id="tsp-account-field">
            <span className="tsp-label">Account</span>
            <select id="tsp-account" className="tsp-input"></select>
          </div>
          <div className="tsp-field" id="tsp-from-field" style={{ display: 'none' }}>
            <span className="tsp-label">From Account</span>
            <select id="tsp-from-account" className="tsp-input"></select>
          </div>
          <div className="tsp-field" id="tsp-to-field" style={{ display: 'none' }}>
            <span className="tsp-label">To Account</span>
            <select id="tsp-to-account" className="tsp-input"></select>
          </div>
          <div className="tsp-field">
            <span className="tsp-label">Month</span>
            <select id="tsp-month" className="tsp-input"></select>
          </div>
        </div>
        <div className="tsp-footer">
          <button className="tsp-delete-btn" id="tsp-delete-btn" data-action="deleteTxFromPanel()">Delete</button>
          <button className="tsp-save-btn" data-action="saveTxPanel()">Save changes</button>
        </div>
      </div>
    </div>
  )
}
