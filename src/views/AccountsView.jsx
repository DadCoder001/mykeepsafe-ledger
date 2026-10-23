import React, { useState, useEffect } from 'react'

import { fmt } from '../utils/format'

const ACCT_ICONS = { cash: '💵', invested: '📈', retirement: '🏦', crypto: '₿' }

export default function AccountsView() {
  const [tick, setTick] = useState(0)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [showAddGoal, setShowAddGoal] = useState(false)

  useEffect(() => {
    function handler() { setTick(v => v + 1) }
    document.addEventListener('ks:accounts-render', handler)
    return () => document.removeEventListener('ks:accounts-render', handler)
  }, [])

  const st = window.state || {}

  if (!tick) {
    return (
      <div id="accounts-view">
        <div id="acv-summary" className="summary-grid"></div>
      </div>
    )
  }

  const accounts = st.accounts || []
  const goals = st.goals || []
  const hasAccounts = accounts.length > 0
  const hasGoals = goals.length > 0

  const { cash = 0, invested = 0, totalLiabilities = 0 } = window.calcDashStats?.() || {}
  const retirement = accounts.filter(a => a.type === 'retirement').reduce((s, a) => s + a.balance, 0)
  const netWorth = cash + invested - totalLiabilities

  const txCountMap = {}
  Object.values(st.months || {}).forEach(m => {
    ;(m.incomes || []).forEach(t => { if (t.accountId) txCountMap[t.accountId] = (txCountMap[t.accountId] || 0) + 1 })
    ;(m.expenses || []).forEach(t => { if (t.accountId) txCountMap[t.accountId] = (txCountMap[t.accountId] || 0) + 1 })
  })

  return (
    <div id="accounts-view">
      <div id="acv-summary" className="summary-grid">
        <div className="sum-card">
          <div className="sum-label">Cash</div>
          <div className="sum-val pos">{fmt(cash)}</div>
          <div className="sum-sub">Checking &amp; savings</div>
        </div>
        <div className="sum-card">
          <div className="sum-label">Invested</div>
          <div className="sum-val pos">{fmt(invested)}</div>
          <div className="sum-sub">Brokerage &amp; crypto</div>
        </div>
        <div className="sum-card">
          <div className="sum-label">Retirement</div>
          <div className="sum-val pos">{fmt(retirement)}</div>
          <div className="sum-sub">401k, IRA</div>
        </div>
        <div className="sum-card">
          <div className="sum-label">Net Worth</div>
          <div className={`sum-val ${netWorth >= 0 ? 'pos' : 'neg'}`}>{fmt(netWorth)}</div>
          <div className="sum-sub">Assets − liabilities</div>
        </div>
        {(() => {
          const aom = window.calcAgeOfMoney?.()
          if (aom === null) return null
          const cls = aom >= 30 ? 'pos' : aom < 7 ? 'neg' : 'warn'
          const sub = aom >= 30 ? 'solid buffer' : aom >= 7 ? 'building cushion' : 'watch your buffer'
          return (
            <div className="sum-card">
              <div className="sum-label">Age of Money</div>
              <div className={`sum-val ${cls}`}>{aom} days</div>
              <div className="sum-sub">{sub}</div>
            </div>
          )
        })()}
      </div>

      {/* Accounts */}
      <div className="dash-section-card" style={{ marginBottom: '1.5rem' }}>
        <div className="dash-section-header">
          <span>Accounts</span>
          <span className="dash-view-all" onClick={() => setShowAddAccount(v => !v)}>
            {showAddAccount ? '✕ Cancel' : '+ Add account'}
          </span>
        </div>
        {showAddAccount && (
          <div className="acv-inline-form">
            <input id="acct-name" type="text" className="sb-input" placeholder="e.g. Chase Checking" />
            <input id="acct-balance" type="number" className="sb-input" placeholder="Opening balance" min="0" />
            <input id="acct-prev-balance" type="number" className="sb-input" placeholder="Last month balance (optional)" />
            <select id="acct-type" className="sb-input">
              <option value="cash">Cash</option>
              <option value="invested">Invested</option>
              <option value="retirement">Retirement</option>
              <option value="crypto">Crypto</option>
            </select>
            <button className="sb-btn" onClick={() => { window.addAccount?.(); setShowAddAccount(false) }}>+ Add Account</button>
          </div>
        )}
        {hasAccounts ? accounts.map(a => {
          const ch = window.fmtPctChange?.(a.balance, a.prevBalance) || { cls: 'neu', text: '' }
          const txCount = txCountMap[a.id] || 0
          return (
            <div key={a.id} className="dash-account-row">
              <div className="dash-account-icon">{ACCT_ICONS[a.type] || '💳'}</div>
              <div className="dash-account-info">
                <div className="dash-account-name">{a.name}</div>
                <div className="dash-account-type">{a.type.charAt(0).toUpperCase() + a.type.slice(1)}</div>
                {txCount > 0 && <div className="dash-account-type">{txCount} transaction{txCount !== 1 ? 's' : ''}</div>}
              </div>
              <div className="dash-account-right">
                <div className="dash-account-balance">{fmt(a.balance)}</div>
                <div className={`dash-account-change ${ch.cls}`}>{ch.text}</div>
                <button className="nw-del" style={{ marginTop: '6px' }} data-action={`deleteAccount('${a.id}')`}>✕</button>
              </div>
            </div>
          )
        }) : !showAddAccount && (
          <div style={{ padding: '1rem 0', color: 'var(--ink3)', fontSize: '0.85rem' }}>
            No accounts yet — click <strong>+ Add account</strong> to get started.
          </div>
        )}
      </div>

      {/* Add Data */}
      <div className="dash-section-card acv-data-sources" style={{ marginBottom: '1.5rem' }}>
        <div className="dash-section-header">
          <span>Add Data</span>
        </div>
        <div className="acv-data-actions">
          <button className="acv-data-btn" onClick={() => document.getElementById('import-csv-file')?.click()}>
            <span>📥</span>
            <span><strong>Import CSV</strong><span>Upload a statement exported from your bank — read only on this computer</span></span>
          </button>
        </div>
      </div>

      {/* Goals */}
      <div className="dash-section-card" style={{ marginBottom: '1.5rem' }}>
        <div className="dash-section-header">
          <span>Goals</span>
          <span className="dash-view-all" onClick={() => setShowAddGoal(v => !v)}>
            {showAddGoal ? '✕ Cancel' : '+ Add goal'}
          </span>
        </div>
        {showAddGoal && (
          <div className="acv-inline-form">
            <input id="goal-name" type="text" className="sb-input" placeholder="e.g. Europe Vacation" />
            <input id="goal-target" type="number" className="sb-input" placeholder="Target amount" min="0" />
            <select id="goal-link-account" className="sb-input">
              <option value="">— Link to an account (optional) —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({fmt(a.balance)})</option>)}
            </select>
            <button className="sb-btn" onClick={() => { window.addGoal?.(); setShowAddGoal(false) }}>+ Add Goal</button>
          </div>
        )}
        {hasGoals ? goals.map(g => {
          const current = window.getGoalCurrent?.(g) || 0
          const pct = g.targetAmount > 0 ? Math.min(100, Math.round((current / g.targetAmount) * 100)) : 0
          const remaining = Math.max(0, g.targetAmount - current)
          const linkedAcct = g.linkedAccountId ? accounts.find(a => a.id === g.linkedAccountId) : null
          const proj = window.getGoalProjection?.(g)
          return (
            <div key={g.id} className="dash-goal-row">
              <div className="dash-goal-header">
                <span className="dash-goal-name">{g.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="dash-goal-pct">{pct}%</span>
                  <button className="nw-del" data-action={`deleteGoal('${g.id}')`}>✕</button>
                </div>
              </div>
              {linkedAcct
                ? <span className="goal-acct-chip">📂 {linkedAcct.name}</span>
                : <span className="goal-acct-chip unlinked">No account linked</span>}
              <div className="dash-goal-progress">
                <div className="dash-goal-fill" style={{ width: `${pct}%` }}></div>
              </div>
              <div className="dash-goal-amounts">
                {fmt(current)} of {fmt(g.targetAmount)}{' '}
                <span className="dash-goal-remaining">
                  {remaining > 0 ? `· ${fmt(remaining)} to go` : '· Complete! 🎉'}
                </span>
              </div>
              {proj && (
                <div className="goal-projection">📅 On track: ~{proj.monthsNeeded} month{proj.monthsNeeded !== 1 ? 's' : ''} ({proj.label})</div>
              )}
              {!proj && remaining > 0 && g.linkedAccountId && (
                <div className="goal-projection" style={{ color: 'var(--ink3)' }}>Set a monthly target or link months to estimate completion</div>
              )}
              {remaining > 0 && (
                <div className="goal-monthly-target">
                  <label>Monthly target: </label>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    $<input
                      type="number"
                      className="goal-target-input"
                      defaultValue={g.monthlyTarget > 0 ? g.monthlyTarget : ''}
                      placeholder="optional"
                      min="0"
                      onChange={e => window.setGoalMonthlyTarget?.(g.id, e.target.value)}
                      onClick={e => e.stopPropagation()}
                    />
                  </span>
                </div>
              )}
            </div>
          )
        }) : !showAddGoal && (
          <div style={{ padding: '1rem 0', color: 'var(--ink3)', fontSize: '0.85rem' }}>
            No goals yet — click <strong>+ Add goal</strong> to set a savings target.
          </div>
        )}
      </div>

      {(() => {
        const recurring = window.detectRecurringTransactions?.() || []
        const now = new Date()
        const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const curExpDescs = new Set((st.months?.[curKey]?.expenses || []).map(e => (e.desc || '').toLowerCase().trim()))
        const pending = recurring.filter(r => !curExpDescs.has(r.desc.toLowerCase().trim())).slice(0, 6)
        if (!pending.length) return null
        const total = pending.reduce((s, r) => s + r.amount, 0)
        return (
          <div className="dash-section-card" style={{ marginBottom: '1.5rem' }}>
            <div className="dash-section-header">
              <span>Upcoming Bills</span>
              <span className="dash-bills-total">{fmt(total)} due</span>
            </div>
            <div>
              {pending.map((r, i) => (
                <div key={i} className="dash-bills-row">
                  <div className="dash-bills-info">
                    <div className="dash-bills-desc">{r.desc}</div>
                    <div className="dash-bills-cat">{r.cat}</div>
                  </div>
                  <div className="dash-bills-amt">−{fmt(r.amount)}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
