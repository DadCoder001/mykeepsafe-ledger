import React, { useState, useEffect } from 'react'
import { fmt } from '../utils/format'
import ExplainButton from '../components/ExplainButton'

export default function NetWorthView() {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    function handler() { setTick(v => v + 1) }
    document.addEventListener('ks:networth-render', handler)
    return () => document.removeEventListener('ks:networth-render', handler)
  }, [])

  useEffect(() => {
    if (!tick) return
    const id = setTimeout(() => {
      const st = window.state || {}
      const debtCandidates = (st.liabilities || []).filter(l => l.interestRate > 0 && l.minimumPayment > 0)
      if (debtCandidates.length > 0) {
        window.renderDebtPlanner?.()
      }
      const snapshots = st.netWorthSnapshots || []
      if (snapshots.length >= 2) {
        window.destroyChart?.('nwTrend')
        const ctx = document.getElementById('nwTrendChart')?.getContext('2d')
        if (ctx && typeof window.Chart !== 'undefined') {
          const isUp = snapshots[snapshots.length - 1].value >= snapshots[0].value
          const chart = new window.Chart(ctx, {
            type: 'line',
            data: {
              labels: snapshots.map(s => s.month),
              datasets: [{
                label: 'Net Worth',
                data: snapshots.map(s => s.value),
                borderColor: isUp ? '#2d6a4f' : '#c0392b',
                backgroundColor: isUp ? 'rgba(45,106,79,0.07)' : 'rgba(192,57,43,0.07)',
                fill: true, tension: 0.3, pointRadius: 3
              }]
            },
            options: {
              responsive: true,
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.parsed.y) } } },
              scales: { y: { ticks: { callback: v => '$' + v.toLocaleString() } }, x: { grid: { display: false } } }
            }
          })
          window.registerChart?.('nwTrend', chart)
        }
      }
    }, 0)
    return () => clearTimeout(id)
  }, [tick])

  const st = window.state || {}

  if (!tick) {
    return (
      <div id="networth-view">
        <div className="view-header">
          <h1>Net Worth Tracker</h1>
          <p>Track your assets and liabilities over time</p>
        </div>
        <div id="networth-summary" className="summary-grid"></div>
        <div id="nw-trend-section" style={{ display: 'none', marginBottom: '2rem' }}>
          <div className="chart-card"><h3>Net Worth Over Time</h3><canvas id="nwTrendChart"></canvas></div>
        </div>
        <div className="tx-section">
          <div className="tx-table-header">Assets</div>
          <table className="nw-table" id="assets-table">
            <thead><tr><th>Name</th><th>Category</th><th>Value</th><th></th></tr></thead>
            <tbody id="assets-tbody"></tbody>
          </table>
        </div>
        <div className="tx-section">
          <div className="tx-table-header">Liabilities</div>
          <table className="nw-table" id="liabilities-table">
            <thead><tr><th>Name</th><th>Category</th><th>Balance</th><th>Rate %</th><th>Min. Pay</th><th></th></tr></thead>
            <tbody id="liabilities-tbody"></tbody>
          </table>
        </div>
        <div id="debt-planner-section" style={{ display: 'none', marginTop: '2rem' }}></div>
      </div>
    )
  }

  const { totalAssets = 0, totalLiabilities = 0, netWorth = 0 } = window.calcNetWorth?.() || {}
  const snapshots = st.netWorthSnapshots || []
  const showTrend = snapshots.length >= 2
  const debtCandidates = (st.liabilities || []).filter(l => l.interestRate > 0 && l.minimumPayment > 0)

  return (
    <div id="networth-view">
      <div className="view-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <h1>Net Worth Tracker</h1>
          <p>Track your assets and liabilities over time</p>
        </div>
        <ExplainButton kind="networth" label="Explain my net worth" />
      </div>

      <div id="networth-summary" className="summary-grid">
        <div className="sum-card">
          <div className="sum-label">Total Assets</div>
          <div className="sum-val pos">{fmt(totalAssets)}</div>
          <div className="sum-sub">{(st.assets || []).length} items</div>
        </div>
        <div className="sum-card">
          <div className="sum-label">Total Liabilities</div>
          <div className="sum-val neg">{fmt(totalLiabilities)}</div>
          <div className="sum-sub">{(st.liabilities || []).length} items</div>
        </div>
        <div className="sum-card">
          <div className="sum-label">Net Worth</div>
          <div className={`sum-val ${netWorth >= 0 ? 'pos' : 'neg'}`}>{fmt(netWorth)}</div>
        </div>
      </div>

      <div id="nw-trend-section" style={{ display: showTrend ? 'block' : 'none', marginBottom: '2rem' }}>
        <div className="chart-card">
          <h3>Net Worth Over Time</h3>
          <canvas id="nwTrendChart"></canvas>
        </div>
      </div>

      <div className="tx-section">
        <div className="tx-table-header">Assets</div>
        <table className="nw-table" id="assets-table">
          <thead><tr><th>Name</th><th>Category</th><th>Value</th><th></th></tr></thead>
          <tbody id="assets-tbody">
            {(st.assets || []).length === 0 ? (
              <tr><td colSpan="4">
                <div className="view-empty-state" style={{ padding: '2rem 1rem' }}>
                  <div className="ves-icon">🏠</div>
                  <div className="ves-title">No assets yet</div>
                  <div className="ves-sub">Add your checking, savings, investments, or property.</div>
                </div>
              </td></tr>
            ) : (
              (st.assets || []).map(a => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td><span className="nw-cat">{a.category}</span></td>
                  <td className="nw-val">{fmt(a.value)}</td>
                  <td><button className="nw-del" data-action={`deleteAsset('${a.id}')`}>×</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="tx-section">
        <div className="tx-table-header">Liabilities</div>
        <table className="nw-table" id="liabilities-table">
          <thead><tr><th>Name</th><th>Category</th><th>Balance</th><th>Rate %</th><th>Min. Pay</th><th></th></tr></thead>
          <tbody id="liabilities-tbody">
            {(st.liabilities || []).length === 0 ? (
              <tr><td colSpan="6">
                <div className="view-empty-state" style={{ padding: '2rem 1rem' }}>
                  <div className="ves-icon">💳</div>
                  <div className="ves-title">No liabilities yet</div>
                  <div className="ves-sub">Add loans, credit card balances, or other debts to track what you owe.</div>
                </div>
              </td></tr>
            ) : (
              (st.liabilities || []).map(l => (
                <tr key={l.id}>
                  <td>{l.name}</td>
                  <td><span className="nw-cat">{l.category}</span></td>
                  <td className="nw-val">{fmt(l.value)}</td>
                  <td className="nw-val">{l.interestRate > 0 ? l.interestRate.toFixed(2) + '%' : '—'}</td>
                  <td className="nw-val">{l.minimumPayment > 0 ? fmt(l.minimumPayment) : '—'}</td>
                  <td><button className="nw-del" data-action={`deleteLiability('${l.id}')`}>×</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div id="debt-planner-section" style={{ display: 'block', marginTop: '2rem' }}>
        {debtCandidates.length > 0 ? (
          <div className="tx-section">
            <div className="tx-table-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Debt Payoff Planner</span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--ink2)' }}>Extra payment/mo: $</span>
                <input
                  id="debt-extra-payment"
                  type="number"
                  className="goal-target-input"
                  defaultValue={0}
                  min="0"
                  placeholder="0"
                  onChange={() => window.renderDebtPlanner?.()}
                  onClick={e => e.stopPropagation()}
                  style={{ width: '70px' }}
                />
              </div>
            </div>
            <div style={{ padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                <button id="debt-strategy-avalanche" className="whatif-btn" data-action="setDebtStrategy('avalanche')" style={{ fontWeight: 600 }}>Avalanche (highest rate first)</button>
                <button id="debt-strategy-snowball" className="whatif-btn" data-action="setDebtStrategy('snowball')">Snowball (lowest balance first)</button>
              </div>
              <div id="debt-planner-summary" className="summary-grid" style={{ marginBottom: '1rem' }}></div>
              <div className="chart-card" style={{ marginBottom: '1rem' }}><canvas id="debtPayoffChart"></canvas></div>
              <div id="debt-payoff-table"></div>
              <div id="debt-extra-comparison"></div>
            </div>
          </div>
        ) : (
          <div className="view-empty-state debt-planner-empty">
            <div className="ves-icon">💳</div>
            <div className="ves-title">Debt Payoff Planner</div>
            <div className="ves-sub">Add interest rates and minimum payments to your liabilities above to enable the payoff planner.</div>
          </div>
        )}
      </div>
    </div>
  )
}
