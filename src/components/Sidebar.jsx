import React, { useState, useEffect } from 'react'
import { fmt } from '../utils/format'

export default function Sidebar() {
  const [activeView, setActiveView] = useState('accounts')
  const [activeMonth, setActiveMonth] = useState(null)
  const [tick, setTick] = useState(0)
  const [notifTick, setNotifTick] = useState(0)

  useEffect(() => {
    function onSidebar(e) {
      const { activeView: av, activeMonth: am } = e.detail || {}
      if (av !== undefined) setActiveView(av)
      if (am !== undefined) setActiveMonth(am)
      setTick(v => v + 1)
    }
    function onNotifRender() { setNotifTick(v => v + 1) }
    document.addEventListener('ks:sidebar-render', onSidebar)
    document.addEventListener('ks:notifications-render', onNotifRender)
    return () => {
      document.removeEventListener('ks:sidebar-render', onSidebar)
      document.removeEventListener('ks:notifications-render', onNotifRender)
    }
  }, [])

  // DOM manipulation side effects that react to sidebar-render
  useEffect(() => {
    if (!tick) return
    const id = setTimeout(() => {
      const st = window.state || {}
      const av = window.getActiveView?.() ?? activeView
      const am = window.getActiveMonth?.() ?? activeMonth

      // Goal link account select (accounts or dashboard views)
      if (av === 'accounts' || av === 'dashboard') {
        const sel = document.getElementById('goal-link-account')
        if (sel) {
          const current = sel.value
          sel.innerHTML = '<option value="">— Link to an account (optional) —</option>' +
            (st.accounts || []).map(a => `<option value="${a.id}">${a.name} (${fmt(a.balance)})</option>`).join('')
          sel.value = current
        }
      }

      // Month-specific sidebar content
      if (av === 'month') {
        if (am) {
          const monthInput = document.getElementById('month-input')
          if (monthInput) monthInput.value = am
        }

        const monthsList = document.getElementById('months-list')
        if (monthsList) {
          monthsList.innerHTML = ''
          st.order.forEach(k => {
            const btn = document.createElement('button')
            btn.className = 'month-btn' + (k === am ? ' active' : '')
            btn.textContent = k
            btn.onclick = () => { window.setActiveMonth?.(k); window.render?.() }
            monthsList.appendChild(btn)
          })
        }

        const catList = document.getElementById('categories-list')
        if (catList) {
          catList.innerHTML = ''
          st.categories.forEach(cat => {
            const li = document.createElement('li')
            li.innerHTML = `${cat} <button onclick="deleteCategory('${cat}')">×</button>`
            catList.appendChild(li)
          })
        }

        const dl = document.getElementById('cat-list')
        if (dl) {
          dl.innerHTML = ''
          st.categories.forEach(cat => {
            const opt = document.createElement('option')
            opt.value = cat
            dl.appendChild(opt)
          })
        }

        const tagDl = document.getElementById('tag-list')
        if (tagDl) {
          tagDl.innerHTML = ''
          ;(st.knownTags || []).forEach(tag => {
            const opt = document.createElement('option')
            opt.value = tag
            tagDl.appendChild(opt)
          })
        }

        const feTotal = (st.fixedExpenses || []).reduce((s, fe) => s + fe.amount, 0)
        const feSummary = document.getElementById('fe-summary-link')
        if (feSummary) {
          feSummary.innerHTML = st.fixedExpenses?.length
            ? `<strong>${st.fixedExpenses.length}</strong> fixed expenses · <strong>${fmt(feTotal)}</strong>/mo → <u>Manage</u>`
            : 'No fixed expenses · <u>Add one</u>'
        }

        const billsDueCard = document.getElementById('bills-due-card')
        if (billsDueCard && am && st.fixedExpenses?.length) {
          const bills = window.getUpcomingBills?.(am) || []
          const notApplied = bills.filter(b => !b.applied)
          const totalRemaining = notApplied.reduce((s, b) => s + b.amount, 0)
          billsDueCard.style.display = 'block'
          billsDueCard.innerHTML = notApplied.length
            ? `📅 <strong>${notApplied.length}</strong> bill${notApplied.length !== 1 ? 's' : ''} not yet applied · <strong>${fmt(totalRemaining)}</strong>`
            : `✅ All ${bills.length} bills applied this month`
        } else if (billsDueCard) {
          billsDueCard.style.display = 'none'
        }

        if (am) {
          const budgetInput = document.getElementById('budget-input')
          if (budgetInput) budgetInput.value = st.months?.[am]?.budget || ''
          const savingsInput = document.getElementById('savings-goal-input')
          if (savingsInput) savingsInput.value = st.months?.[am]?.savingsGoal || ''

          const linkSel = document.getElementById('month-link-account')
          if (linkSel) {
            const currentLinked = st.months?.[am]?.linkedAccountId || ''
            linkSel.innerHTML = '<option value="">— All accounts —</option>' +
              (st.accounts || []).map(a => `<option value="${a.id}">${a.name}</option>`).join('')
            linkSel.value = currentLinked
            const badge = document.getElementById('month-sync-badge')
            if (badge) badge.style.display = currentLinked ? 'block' : 'none'
          }
        }

        const carryToggle = document.getElementById('carry-toggle')
        if (carryToggle) carryToggle.classList.toggle('on', !!st.settings?.budgetCarryForward)

        const tSav = document.getElementById('threshold-savings')
        const tSpike = document.getElementById('threshold-spike')
        const tLarge = document.getElementById('threshold-large')
        if (tSav) tSav.value = st.settings?.lowSavings ?? 10
        if (tSpike) tSpike.value = st.settings?.expenseSpikePct ?? 10
        if (tLarge) tLarge.value = st.settings?.largeTxPct ?? 20
      }
    }, 0)
    return () => clearTimeout(id)
  }, [tick])

  const st = window.state || {}
  const notifs = st.notifications || []
  const unread = notifs.filter(n => !n.read).length
  const userName = st.settings?.userName || ''
  const initials = userName.trim().charAt(0).toUpperCase()

  return (
    <aside className="sidebar">
      <div className="sb-logo">
        MyKeepSafe Ledger
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button className="notif-bell-btn" id="notif-bell-btn" onClick={() => window.openNotificationPanel?.()} title="Notifications" aria-label="Notifications">
            🔔
            <span className={`notif-bell-badge${unread > 0 ? ' visible' : ''}`} id="notif-bell-badge">{unread > 9 ? '9+' : unread > 0 ? String(unread) : ''}</span>
          </button>
          <button className={`sb-avatar${activeView === 'profile' ? ' active' : ''}`} id="profile-btn" data-action="switchView('profile')" title="Your Profile">{initials || '👤'}</button>
        </div>
      </div>

      <nav className="sb-tabs" aria-label="Main navigation">
        <button id="tab-accounts" className={`sb-tab${activeView === 'accounts' ? ' active' : ''}`} data-action="switchView('accounts')"><span className="sb-tab-icon">💳</span>Accounts</button>
        <button id="tab-month" className={`sb-tab${activeView === 'month' ? ' active' : ''}`} data-action="switchView('month')"><span className="sb-tab-icon">📅</span>Month</button>
        <button id="tab-overview" className={`sb-tab${activeView === 'overview' ? ' active' : ''}`} data-action="switchView('overview')"><span className="sb-tab-icon">📊</span>Overview</button>
        <button id="tab-forecast" className={`sb-tab${activeView === 'forecast' ? ' active' : ''}`} data-action="switchView('forecast')">
          <span className="sb-tab-icon">📈</span>Forecast
        </button>
        <button id="tab-networth" className={`sb-tab${activeView === 'networth' ? ' active' : ''}`} data-action="switchView('networth')"><span className="sb-tab-icon">💎</span>Net Worth</button>
        <button id="tab-fixed" className={`sb-tab${activeView === 'fixed' ? ' active' : ''}`} data-action="switchView('fixed')"><span className="sb-tab-icon">📌</span>Fixed</button>
        <button id="tab-ai" className={`sb-tab${activeView === 'ai' ? ' active' : ''}`} data-action="switchView('ai')"><span className="sb-tab-icon">✦</span>AI CFO</button>
      </nav>

      {/* MONTH VIEW SIDEBAR */}
      <div id="sb-month-nav" style={{ display: activeView === 'month' ? 'block' : 'none' }}>
        <div className="sb-section">
          <h3>Current Month</h3>
          <input id="month-input" type="month" className="sb-input" />
          <button className="sb-btn" data-action="loadMonth()">Load</button>
          <div style={{ marginTop: '8px' }}>
            <div style={{ fontSize: '11px', color: 'var(--ink3)', marginBottom: '4px' }}>
              Default account <span style={{ opacity: 0.6 }}>(for quick-add &amp; CSV import)</span>
            </div>
            <select id="month-link-account" className="sb-input" style={{ marginTop: 0 }} data-change="setMonthLinkedAccount(this.value)">
              <option value="">— All accounts —</option>
            </select>
          </div>
          <div id="month-sync-badge" className="month-sync-badge" style={{ display: 'none' }}>↻ Balance auto-synced from transactions</div>
        </div>

        <div className="sb-section">
          <h3>Months</h3>
          <div id="months-list" className="sb-list"></div>
        </div>

        <div className="sb-section">
          <h3>Categories</h3>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <input id="cat-input" type="text" className="sb-input" style={{ marginBottom: 0, flex: 1, minWidth: '120px' }} placeholder="New category" />
            <button className="sb-btn" style={{ width: 'auto', padding: '8px 12px', marginBottom: 0, flexShrink: 0 }} data-action="addCategory()">+</button>
          </div>
          <ul id="categories-list" className="sb-list" style={{ marginBottom: 0 }}></ul>
        </div>

        <div className="sb-section">
          <h3>Fixed Expenses</h3>
          <div id="fe-summary-link" style={{ fontSize: '12px', color: 'var(--ink2)', cursor: 'pointer' }} data-action="switchView('fixed')">
            Loading...
          </div>
          <div id="bills-due-card" className="bills-due-card" style={{ display: 'none' }} data-action="switchView('fixed')"></div>
        </div>

        <div className="sb-section">
          <h3>Monthly Budget</h3>
          <input id="budget-input" type="number" className="sb-input" placeholder="Budget amount" />
          <button className="sb-btn" data-action="setBudget()">Save</button>
          <div className="toggle-row" style={{ marginTop: '8px' }}>
            <span>Carry unused budget</span>
            <div id="carry-toggle" className="toggle" data-action="toggleCarryForward()"></div>
          </div>
        </div>

        <div className="sb-section">
          <h3>Savings Goal</h3>
          <input id="savings-goal-input" type="number" className="sb-input" placeholder="Monthly savings goal" />
          <button className="sb-btn" data-action="setSavingsGoal()">Save</button>
        </div>

        <div className="sb-section">
          <h3>Thresholds</h3>
          <label style={{ fontSize: '12px' }}>Low Savings %</label>
          <input id="threshold-savings" type="number" className="sb-input" defaultValue={10} />
          <label style={{ fontSize: '12px' }}>Expense Spike %</label>
          <input id="threshold-spike" type="number" className="sb-input" defaultValue={10} />
          <label style={{ fontSize: '12px' }}>Large Tx %</label>
          <input id="threshold-large" type="number" className="sb-input" defaultValue={20} />
          <button className="sb-btn" style={{ marginTop: '8px' }} data-action="saveThresholds()">Save</button>
        </div>


        <div className="sb-section">
          <h3>Export</h3>
          <div className="export-grid">
            <button data-action="exportJSON()" title="Export full data as JSON backup">JSON</button>
            <button data-action="exportCSVTx()" title="Export all transactions as CSV">CSV Tx</button>
            <button data-action="exportCSVSummary()" title="Export monthly summaries as CSV">CSV Summary</button>
            <button data-action="exportPDF()" title="Export current view as PDF">PDF Report</button>
          </div>
        </div>

        <datalist id="cat-list"></datalist>
        <datalist id="tag-list"></datalist>
      </div>

      {/* FIXED EXPENSES SIDEBAR */}
      <div id="sb-fixed-nav" style={{ display: activeView === 'fixed' ? 'block' : 'none' }}>
        <div className="sb-section">
          <h3>Add Fixed Expense</h3>
          <input id="fe-amount" type="number" className="sb-input" placeholder="Amount" />
          <input id="fe-desc" type="text" className="sb-input" placeholder="Description" />
          <input id="fe-cat" type="text" className="sb-input" placeholder="Category" />
          <select id="fe-frequency" className="sb-input">
            <option value="monthly">Monthly</option>
            <option value="biweekly">Bi-weekly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </select>
          <button className="sb-btn" data-action="addFixedExpense()">+ Add Fixed Expense</button>
        </div>
        <div className="sb-section">
          <h3>Quick List</h3>
          <ul id="fixed-list" className="sb-list"></ul>
        </div>
      </div>

      {/* OVERVIEW SIDEBAR */}
      <div id="sb-overview-nav" style={{ display: activeView === 'overview' ? 'block' : 'none' }}>
        <div className="sb-section">
          <h3>Date Range</h3>
          <label style={{ fontSize: '12px' }}>From</label>
          <input id="range-from" type="month" className="sb-input" />
          <label style={{ fontSize: '12px' }}>To</label>
          <input id="range-to" type="month" className="sb-input" />
          <button className="sb-btn" data-action="applyDateRange()">Apply</button>
          <button className="sb-btn sb-btn-secondary" data-action="resetDateRange()">All Data</button>
        </div>
      </div>

      {/* NET WORTH SIDEBAR */}
      <div id="sb-networth-nav" style={{ display: activeView === 'networth' ? 'block' : 'none' }}>
        <div className="sb-section">
          <h3>Add Asset</h3>
          <input id="asset-name" type="text" className="sb-input" placeholder="Name (e.g. Savings Account)" />
          <input id="asset-value" type="number" className="sb-input" placeholder="Value" />
          <select id="asset-category" className="sb-input">
            <option value="cash">Cash</option>
            <option value="investment">Investment</option>
            <option value="property">Property</option>
            <option value="other">Other</option>
          </select>
          <button className="sb-btn" data-action="addAsset()">+ Add Asset</button>
        </div>
        <div className="sb-section">
          <h3>Add Liability</h3>
          <input id="liability-name" type="text" className="sb-input" placeholder="Name (e.g. Car Loan)" />
          <input id="liability-value" type="number" className="sb-input" placeholder="Balance ($)" />
          <select id="liability-category" className="sb-input">
            <option value="mortgage">Mortgage</option>
            <option value="loan">Loan</option>
            <option value="credit">Credit Card</option>
            <option value="other">Other</option>
          </select>
          <input id="liability-rate" type="number" className="sb-input" placeholder="Interest rate % (optional)" min="0" max="100" step="0.01" />
          <input id="liability-minpay" type="number" className="sb-input" placeholder="Min. payment/mo (optional)" min="0" />
          <button className="sb-btn" data-action="addLiability()">+ Add Liability</button>
        </div>
      </div>

      {/* ACCOUNTS SIDEBAR */}
      <div id="sb-accounts-nav" style={{ display: activeView === 'accounts' ? 'block' : 'none' }}>
        <div className="sb-section">
          <h3>File Sync</h3>
          <div id="file-sync-status" className="file-sync-status unlinked">
            <span className="sync-dot"></span>
            <span>No file linked</span>
          </div>
          <div id="backup-reminder" className="backup-reminder" style={{ display: 'none' }}></div>
          <button className="sb-btn" id="link-file-btn" data-action="linkFile()">Link Local File</button>
          <button className="sb-btn sb-btn-secondary" id="unlink-file-btn" data-action="unlinkFile()" style={{ display: 'none' }}>Unlink</button>
          <small style={{ fontSize: '11px', color: 'var(--ink3)', display: 'block', marginTop: '4px' }}>Auto-saves to a .json file on your disk. Works across browsers.</small>
          <div style={{ marginTop: '0.75rem' }}>
            <p className="export-group-label">📥 Import</p>
            <div className="export-grid import-grid">
              <button className="import-btn" data-action="document.getElementById('import-file').click()" title="Import a MyKeepSafe Ledger JSON backup">Import JSON</button>
            </div>
          </div>
          <input id="import-file" type="file" accept=".json" style={{ display: 'none' }} data-change="importJSON(event)" />
          <input id="import-csv-file" type="file" accept=".csv" style={{ display: 'none' }} data-change="importCSV(event)" />
        </div>
      </div>

      {/* DASHBOARD SIDEBAR */}
      <div id="sb-dashboard-nav" style={{ display: activeView === 'dashboard' ? 'block' : 'none' }}>
        <div className="sb-section">
          <h3>Your Name</h3>
          <input id="dash-name-input" type="text" className="sb-input" placeholder="e.g. Alex" />
          <button className="sb-btn" data-action="saveUserName()">Save</button>
        </div>
      </div>
    </aside>
  )
}
