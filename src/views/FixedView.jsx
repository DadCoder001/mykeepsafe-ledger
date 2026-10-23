import React, { useState, useEffect } from 'react'
import { fmt } from '../utils/format'

export default function FixedView() {
  const [billsMonth, setBillsMonth] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    function handler(e) {
      setBillsMonth(e.detail.billsMonth || null)
      setTick(v => v + 1)
    }
    document.addEventListener('ks:fixed-render', handler)
    return () => document.removeEventListener('ks:fixed-render', handler)
  }, [])

  const st = window.state || {}

  if (!tick) {
    return (
      <div id="fixed-view">
        <div className="view-header">
          <h1>Fixed / Recurring Expenses</h1>
          <p>Manage expenses that repeat every month. Changes propagate to all months.</p>
        </div>
        <div id="fixed-summary" className="summary-grid"></div>
        <div id="upcoming-bills-section" className="upcoming-bills-section" style={{ display: 'none' }}></div>
        <div className="tx-section">
          <div className="tx-table-header">All Fixed Expenses</div>
          <table className="fe-table" id="fe-main-table">
            <thead><tr><th>Description</th><th>Category</th><th>Amount</th><th>Frequency</th><th>Applied To</th><th>Actions</th></tr></thead>
            <tbody id="fe-tbody"></tbody>
          </table>
        </div>
        <div id="fe-detected-section" style={{ display: 'none' }}></div>
      </div>
    )
  }

  const fixedExpenses = st.fixedExpenses || []
  const count = fixedExpenses.length

  const monthlyEquiv = fixedExpenses.reduce((s, fe) => {
    const freq = fe.frequency || 'monthly'
    if (freq === 'monthly') return s + fe.amount
    if (freq === 'biweekly') return s + Math.round(fe.amount * 26 / 12 * 100) / 100
    if (freq === 'quarterly') return s + fe.amount / 3
    if (freq === 'annual') return s + fe.amount / 12
    return s + fe.amount
  }, 0)
  const allInc = (st.order || []).map(k => (st.months?.[k]?.incomes || []).reduce((s, t) => s + t.amount, 0) || 0)
  const avgInc = allInc.length ? allInc.reduce((a, b) => a + b, 0) / allInc.length : 0
  const pctOfIncome = avgInc > 0 ? (monthlyEquiv / avgInc * 100) : 0

  const bills = billsMonth ? (window.getUpcomingBills?.(billsMonth) || []) : []
  const appliedCount = bills.filter(b => b.applied).length
  const totalDue = bills.filter(b => !b.applied).reduce((s, b) => s + b.amount, 0)
  const showBills = count > 0 && billsMonth

  const detected = window.detectRecurringTransactions?.() || []

  const freqLabels = { monthly: 'Monthly', biweekly: 'Bi-weekly', quarterly: 'Quarterly', annual: 'Annual' }

  return (
    <div id="fixed-view">
      <div className="view-header">
        <h1>Fixed / Recurring Expenses</h1>
        <p>Manage expenses that repeat every month. Changes propagate to all months.</p>
      </div>

      <div id="fixed-summary" className="summary-grid">
        <div className="sum-card">
          <div className="sum-label">Monthly Fixed Cost</div>
          <div className="sum-val neg">{fmt(monthlyEquiv)}</div>
          <div className="sum-sub">monthly equivalent</div>
        </div>
        <div className="sum-card">
          <div className="sum-label">Fixed Expenses</div>
          <div className="sum-val neu">{count}</div>
          <div className="sum-sub">active templates</div>
        </div>
        <div className="sum-card">
          <div className="sum-label">% of Avg Income</div>
          <div className={`sum-val ${pctOfIncome > 50 ? 'neg' : 'neu'}`}>{pctOfIncome.toFixed(1)}%</div>
          <div className="sum-sub">fixed obligations</div>
        </div>
      </div>

      <div id="upcoming-bills-section" className="upcoming-bills-section" style={{ display: showBills ? 'block' : 'none' }}>
        {showBills && (
          <>
            <div className="upcoming-bills-header">
              <span>📅 Upcoming Bills — {billsMonth}</span>
              <span style={{ fontWeight: 400, color: 'var(--ink3)', fontSize: '12px' }}>
                {appliedCount}/{bills.length} applied{totalDue > 0 ? ` · ${fmt(totalDue)} remaining` : ''}
              </span>
            </div>
            <div className="upcoming-bills-grid">
              {bills.map(b => {
                const cls = b.applied ? 'applied' : b.isOverdue ? 'overdue' : b.isDueSoon ? 'due-soon' : ''
                return (
                  <div key={b.id} className={`ub-card ${cls}`}>
                    <div className="ub-card-name">{b.desc}</div>
                    <div className="ub-card-amount">{fmt(b.amount)}</div>
                    {b.applied
                      ? <span className="ub-badge applied">Applied</span>
                      : b.isOverdue
                        ? <span className="ub-badge overdue">Overdue</span>
                        : b.isDueSoon
                          ? <span className="ub-badge due-soon">Due in {b.daysUntil}d</span>
                          : <span className="ub-badge pending">Day {b.dueDay}</span>}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <div className="tx-section">
        <div className="tx-table-header">All Fixed Expenses</div>
        <table className="fe-table" id="fe-main-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Frequency</th>
              <th>Applied To</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="fe-tbody">
            {count === 0 ? (
              <tr><td colSpan="6">
                <div className="view-empty-state">
                  <div className="ves-icon">📌</div>
                  <div className="ves-title">No fixed expenses yet</div>
                  <div className="ves-sub">Add recurring bills like rent, subscriptions, or insurance. They'll track which months you've paid each one.</div>
                  <div className="ves-actions">
                    <button className="ves-btn-primary" data-action="document.getElementById('fe-desc')?.focus()">+ Add from sidebar</button>
                  </div>
                </div>
              </td></tr>
            ) : (
              fixedExpenses.map(fe => {
                const freq = fe.frequency || 'monthly'
                return (
                  <tr key={fe.id} id={`fe-row-${fe.id}`}>
                    <td>{fe.desc}</td>
                    <td>{fe.cat}</td>
                    <td className="num">{fmt(fe.amount)}</td>
                    <td><span className="tag-chip">{freqLabels[freq] || freq}</span></td>
                    <td>
                      <div className="fe-month-pills">
                        {(st.order || []).length > 0
                          ? (st.order || []).map(k => {
                              const active = st.months?.[k]?.fixedExpenseIds?.includes(fe.id)
                              const label = new Date(k + '-15').toLocaleString('default', { month: 'short', year: '2-digit' })
                              return (
                                <span key={k}
                                  className={`fe-month-pill${active ? ' active' : ''}`}
                                  data-action={`toggleFixedForMonth('${fe.id}','${k}')`}>
                                  {label}
                                </span>
                              )
                            })
                          : <span style={{ color: 'var(--ink3)', fontSize: '12px' }}>No months</span>}
                      </div>
                    </td>
                    <td className="fe-actions">
                      <button data-action={`editFixedExpense('${fe.id}')`}>✏️ Edit</button>
                      <button className="fe-del" data-action={`deleteFixedExpense('${fe.id}')`}>× Delete</button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div id="fe-detected-section" style={{ display: detected.length > 0 ? 'block' : 'none' }}>
        {detected.length > 0 && (
          <div className="tx-section" style={{ marginTop: '1.5rem' }}>
            <div className="tx-table-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>🔍 Detected Recurring</span>
              <span style={{ fontSize: '11px', color: 'var(--ink3)', fontWeight: 400 }}>
                Appearing in {detected[0]?.months.length || 2}+ months with consistent amounts
              </span>
            </div>
            <table className="nw-table">
              <thead>
                <tr><th>Description</th><th>Category</th><th>Amount</th><th>Seen In</th><th></th></tr>
              </thead>
              <tbody>
                {detected.map((d, i) => (
                  <tr key={i}>
                    <td>{d.desc}</td>
                    <td><span className="nw-cat">{d.cat}</span></td>
                    <td className="num">{fmt(d.amount)}</td>
                    <td style={{ color: 'var(--ink3)', fontSize: '12px' }}>{d.months.length} months</td>
                    <td>
                      <button className="fe-add-detected" data-action={`addDetectedAsFixed('${d.desc.replace(/'/g, "\\'")}', ${d.amount}, '${d.cat}')`}>
                        + Add as Fixed
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
