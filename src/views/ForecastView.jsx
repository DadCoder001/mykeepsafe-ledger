import React, { useState, useEffect } from 'react'
import { fmt } from '../utils/format'

export default function ForecastView() {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    function handler() { setTick(v => v + 1) }
    document.addEventListener('ks:forecast-render', handler)
    return () => document.removeEventListener('ks:forecast-render', handler)
  }, [])

  useEffect(() => {
    if (!tick) return
    const id = setTimeout(() => {
      const whatIf = window.getForecastWhatIf?.() || null
      const data = window.buildForecastData?.(whatIf) || {}
      const { labels = [], balances = [] } = data
      window.destroyChart?.('forecast')
      const ctx = document.getElementById('forecastChart')?.getContext('2d')
      if (ctx && typeof window.Chart !== 'undefined') {
        const hasNeg = balances.some(b => b < 0)
        const chart = new window.Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'Projected Balance',
              data: balances,
              borderColor: hasNeg ? '#c0392b' : '#2d6a4f',
              backgroundColor: hasNeg ? 'rgba(192,57,43,0.06)' : 'rgba(45,106,79,0.07)',
              fill: true, tension: 0.3, pointRadius: 0, pointHoverRadius: 4
            }]
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.parsed.y) } } },
            scales: {
              x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } },
              y: { ticks: { callback: v => '$' + v.toLocaleString() } }
            }
          }
        })
        window.registerChart?.('forecast', chart)
      }
    }, 0)
    return () => clearTimeout(id)
  }, [tick])

  if (!tick) {
    return (
      <div id="forecast-view">
        <div className="view-header">
          <h1>Cash Flow Forecast</h1>
          <p>Projected balance over the next 90 days based on recurring expenses and income history.</p>
        </div>
        <div id="forecast-summary" className="summary-grid"></div>
        <div className="chart-card" style={{ marginBottom: '2rem' }}>
          <h3>Projected Balance — Next 90 Days</h3>
          <canvas id="forecastChart"></canvas>
        </div>
        <div id="forecast-snapshots" className="summary-grid" style={{ marginBottom: '2rem' }}></div>
        <div id="forecast-overdraft-warning" style={{ display: 'none' }} className="insight alert"></div>
        <div className="tx-section">
          <div className="tx-table-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>What-If Scenarios</span>
            <button className="ai-narrative-btn" data-action="askAIForecast()" title="Ask your AI CFO to explain this forecast">✦ Explain my outlook</button>
          </div>
          <div id="forecast-whatif" style={{ padding: '1rem 1.25rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <button className="whatif-btn" data-action="applyWhatIf('cancel-subscriptions')">Cancel all subscriptions</button>
              <button className="whatif-btn" data-action="applyWhatIf('income-500')">+$500 extra income/mo</button>
              <button className="whatif-btn" data-action="applyWhatIf('expense-200')">Cut $200/mo in spending</button>
              <button className="whatif-btn" data-action="applyWhatIf('reset')">Reset to baseline</button>
            </div>
            <div id="whatif-result" style={{ fontSize: '13px', color: 'var(--ink2)' }}></div>
          </div>
        </div>
      </div>
    )
  }

  const whatIf = window.getForecastWhatIf?.() || null
  const data = window.buildForecastData?.(whatIf) || {}
  const { labels = [], balances = [], cashBalance = 0, avgMonthlyInc = 0 } = data

  const st = window.state || {}
  const monthlyFixed = (st.fixedExpenses || []).reduce((s, fe) => {
    const freq = fe.frequency || 'monthly'
    if (freq === 'monthly') return s + fe.amount
    if (freq === 'biweekly') return s + fe.amount * 26 / 12
    if (freq === 'quarterly') return s + fe.amount / 3
    if (freq === 'annual') return s + fe.amount / 12
    return s + fe.amount
  }, 0)
  const projectedMonthlySavings = avgMonthlyInc - monthlyFixed

  const last = balances[balances.length - 1] ?? 0
  const snap30 = balances[30] ?? last
  const snap60 = balances[60] ?? last
  const snap90 = balances[90] ?? last

  const overdraftDays = balances.filter(b => b < 0).length
  const firstOverdraftLabel = overdraftDays > 0 ? labels[balances.findIndex(b => b < 0)] : null

  const whatIfLabels = {
    'cancel-subscriptions': 'Cancelling all subscriptions',
    'income-500': '+$500/month income',
    'expense-200': '-$200/month spending'
  }

  return (
    <div id="forecast-view">
      <div className="view-header">
        <h1>Cash Flow Forecast</h1>
        <p>Projected balance over the next 90 days based on recurring expenses and income history.</p>
      </div>

      <div id="forecast-summary" className="summary-grid">
        <div className="sum-card">
          <div className="sum-label">Starting Balance</div>
          <div className="sum-val pos">{fmt(cashBalance)}</div>
          <div className="sum-sub">cash accounts</div>
        </div>
        <div className="sum-card">
          <div className="sum-label">Avg Monthly Income</div>
          <div className="sum-val pos">{fmt(avgMonthlyInc)}</div>
          <div className="sum-sub">last 3 months</div>
        </div>
        <div className="sum-card">
          <div className="sum-label">Monthly Fixed Costs</div>
          <div className="sum-val neg">{fmt(monthlyFixed)}</div>
          <div className="sum-sub">recurring expenses</div>
        </div>
        <div className="sum-card">
          <div className="sum-label">Projected Monthly Net</div>
          <div className={`sum-val ${projectedMonthlySavings >= 0 ? 'pos' : 'neg'}`}>{fmt(projectedMonthlySavings)}</div>
          <div className="sum-sub">income − fixed</div>
        </div>
      </div>

      <div className="chart-card" style={{ marginBottom: '2rem' }}>
        <h3>Projected Balance — Next 90 Days</h3>
        <canvas id="forecastChart"></canvas>
      </div>

      <div id="forecast-snapshots" className="summary-grid" style={{ marginBottom: '2rem' }}>
        <div className="sum-card">
          <div className="sum-label">Day 30</div>
          <div className={`sum-val ${snap30 >= 0 ? 'pos' : 'neg'}`}>{fmt(snap30)}</div>
        </div>
        <div className="sum-card">
          <div className="sum-label">Day 60</div>
          <div className={`sum-val ${snap60 >= 0 ? 'pos' : 'neg'}`}>{fmt(snap60)}</div>
        </div>
        <div className="sum-card">
          <div className="sum-label">Day 90</div>
          <div className={`sum-val ${snap90 >= 0 ? 'pos' : 'neg'}`}>{fmt(snap90)}</div>
        </div>
      </div>

      <div
        id="forecast-overdraft-warning"
        className="insight alert"
        style={{ display: overdraftDays > 0 ? 'block' : 'none' }}
      >
        {overdraftDays > 0 && `⚠️ Projected negative balance on ${firstOverdraftLabel} (${overdraftDays} day${overdraftDays > 1 ? 's' : ''} below $0). Review your spending or add income.`}
      </div>

      <div className="tx-section">
        <div className="tx-table-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>What-If Scenarios</span>
          <button className="ai-narrative-btn" data-action="askAIForecast()" title="Ask your AI CFO to explain this forecast">✦ Explain my outlook</button>
        </div>
        <div id="forecast-whatif" style={{ padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <button className="whatif-btn" data-action="applyWhatIf('cancel-subscriptions')">Cancel all subscriptions</button>
            <button className="whatif-btn" data-action="applyWhatIf('income-500')">+$500 extra income/mo</button>
            <button className="whatif-btn" data-action="applyWhatIf('expense-200')">Cut $200/mo in spending</button>
            <button className="whatif-btn" data-action="applyWhatIf('reset')">Reset to baseline</button>
          </div>
          <div id="whatif-result" style={{ fontSize: '13px', color: 'var(--ink2)' }}>
            {whatIf && whatIf !== 'reset'
              ? `${whatIfLabels[whatIf] || ''} → Day-90 balance: ${fmt(snap90)}`
              : ''}
          </div>
        </div>
      </div>
    </div>
  )
}
