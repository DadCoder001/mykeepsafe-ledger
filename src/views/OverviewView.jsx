import React, { useState, useEffect } from 'react'
import { fmt } from '../utils/format'
import ExplainButton from '../components/ExplainButton'

export default function OverviewView() {
  const [months, setMonths] = useState([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    function handler(e) {
      setMonths(e.detail.months || [])
      setTick(v => v + 1)
    }
    document.addEventListener('ks:overview-render', handler)
    return () => document.removeEventListener('ks:overview-render', handler)
  }, [])

  useEffect(() => {
    if (!months.length) return
    const id = setTimeout(() => {
      window.destroyChart?.('ovNetWorth')
      window.initOverviewCharts?.(months)
      initHeroChart(months)
    }, 0)
    return () => clearTimeout(id)
  }, [tick])

  function initHeroChart(effectiveMonths) {
    const st = window.state || {}
    const hasAccounts = (st.accounts || []).length > 0 || (st.assets || []).length > 0
    if (!hasAccounts) return
    if (typeof window.Chart === 'undefined') return
    const order = st.order || []
    if (order.length < 2) return
    const ctx = document.getElementById('ovNetWorthChart')?.getContext('2d')
    if (!ctx) return
    const { cash = 0, invested = 0, totalLiabilities = 0 } = window.calcDashStats?.() || {}
    const baseNW = cash + invested - totalLiabilities
    const data = order.map(k => (window.getRollingBalance?.(k) || 0) + baseNW)
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2d6a4f'
    const chart = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: order,
        datasets: [{ data, borderColor: accentColor, backgroundColor: 'rgba(45,106,79,0.08)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: accentColor }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.parsed.y) } } },
        scales: { y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: v => fmt(v), maxTicksLimit: 4 }, grace: '8%' }, x: { grid: { display: false } } }
      }
    })
    window.registerChart?.('ovNetWorth', chart)
  }

  const st = window.state || {}

  if (!months.length) {
    return (
      <div id="overview-view">
        <div className="view-header">
          <h1>Financial Overview</h1>
          <p id="overview-subtitle">Your complete financial picture</p>
        </div>
        <div id="ov-hero" style={{ display: 'none' }}>
          <div className="dash-hero-inner">
            <div className="dash-chart-card">
              <div className="dash-chart-label" id="ov-chart-label"></div>
              <canvas id="ovNetWorthChart"></canvas>
            </div>
            <div className="dash-stat-cards" id="ov-stat-cards"></div>
          </div>
        </div>
        <div id="overview-summary" className="summary-grid"></div>
        <div id="ov-cashflow-section" style={{ display: 'none' }}>
          <div className="dash-section-card ov-cashflow-card">
            <div className="dash-section-header">
              <span>Where Your Money Goes</span>
              <span className="ov-cashflow-period" id="ov-cashflow-period"></span>
            </div>
            <div id="ov-cashflow-bars"></div>
          </div>
        </div>
        <div className="dash-bottom-row" id="ov-bottom-row" style={{ display: 'none' }}>
          <div><div className="dash-section-card">
            <div className="dash-section-header"><span>Recent activity</span><span className="dash-view-all" data-action="switchView('month')">See all</span></div>
            <div id="ov-recent-list"></div>
          </div></div>
          <div><div className="dash-section-card dash-insight-card">
            <div className="dash-section-header"><span>Weekly Insight</span><span className="dash-insight-label" style={{ marginBottom: 0 }}>✦ AI-free</span></div>
            <div className="dash-insight-text" id="ov-insight-text"></div>
            <div className="dash-insight-sub" id="ov-insight-sub"></div>
            <div className="dash-insight-stats" id="ov-insight-stats"></div>
          </div></div>
        </div>
        <div id="overview-insights" className="insights-section">
          <div className="sec-title">📊 Period Analysis</div>
          <div id="overview-insights-list"></div>
        </div>
        <div className="charts-grid">
          <div className="chart-card"><h3>Balance Progression</h3><canvas id="ovBalanceChart"></canvas></div>
          <div className="chart-card"><h3>Income vs Expenses</h3><canvas id="ovIncExpChart"></canvas></div>
          <div className="chart-card"><h3>Category Distribution</h3><canvas id="ovCatChart"></canvas></div>
          <div className="chart-card"><h3>Savings Rate</h3><canvas id="ovSavingsChart"></canvas></div>
          <div className="chart-card chart-card-wide"><h3>Category Trends</h3><canvas id="ovCatTrendChart"></canvas></div>
        </div>
        <div className="cat-breakdown-table">
          <div className="tx-section" style={{ marginBottom: 0 }}>
            <div className="tx-table-header">Category Breakdown</div>
            <div id="cat-table-wrapper">
              <table id="cat-table">
                <thead><tr><th>Category</th><th>Total</th><th>Avg/Month</th><th>% of Total</th></tr></thead>
                <tbody id="cat-tbody"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Compute aggregates
  let totalInc = 0, totalExp = 0
  const catTotals = {}
  months.forEach(k => {
    const m = st.months?.[k]
    if (!m) return
    totalInc += (m.incomes || []).reduce((s, t) => s + t.amount, 0)
    totalExp += (m.expenses || []).reduce((s, t) => s + t.amount, 0)
    ;(m.expenses || []).forEach(e => {
      if (e.splits?.length) {
        e.splits.forEach(s => { catTotals[s.cat] = (catTotals[s.cat] || 0) + s.amount })
      } else {
        catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amount
      }
    })
  })

  const hasTxData = months.some(k => {
    const m = st.months?.[k]
    return m && ((m.incomes || []).length + (m.expenses || []).length) > 0
  })

  const avgSavings = totalInc > 0 ? ((totalInc - totalExp) / totalInc) * 100 : 0
  const totalSavingsGoal = months.reduce((s, k) => s + (st.months?.[k]?.savingsGoal || 0), 0)
  const avgSavingsGoal = months.length ? totalSavingsGoal / months.length : 0
  const dateRange = months.length ? `${months[0]} to ${months[months.length - 1]}` : 'No data'

  const insights = hasTxData ? (window.generateOverviewInsights?.(months) || []) : []
  const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1])
  // Category budgets from most recent month for reference
  const mostRecentMonth = months[months.length - 1]
  const catBudgetsRef = (mostRecentMonth && window.state?.months?.[mostRecentMonth]?.categoryBudgets) || {}

  // Hero section
  const hasAccounts = (st.accounts || []).length > 0 || (st.assets || []).length > 0
  const heroStats = hasAccounts ? (window.calcDashStats?.() || {}) : null
  const cashChange = heroStats ? (window.fmtPctChange?.(heroStats.cash, heroStats.prevCash) || { text: '—', cls: 'neu' }) : null
  const invChange = heroStats ? (window.fmtPctChange?.(heroStats.invested, heroStats.prevInvested) || { text: '—', cls: 'neu' }) : null

  // Hero chart label (computed synchronously so React owns the text)
  let heroLabelText = '', heroLabelColor = ''
  if (hasAccounts && heroStats && (st.order || []).length >= 2) {
    const { cash = 0, invested = 0, totalLiabilities = 0 } = heroStats
    const baseNW = cash + invested - totalLiabilities
    const data = (st.order || []).map(k => (window.getRollingBalance?.(k) || 0) + baseNW)
    const diff = data[data.length - 1] - data[0]
    const pct = data[0] !== 0 ? Math.abs((diff / Math.abs(data[0])) * 100).toFixed(1) : 0
    heroLabelText = `${diff >= 0 ? '+' : ''}${fmt(diff)} (${diff >= 0 ? '+' : ''}${pct}%) this period`
    heroLabelColor = diff >= 0 ? 'var(--accent)' : 'var(--red)'
  }

  // Recent activity
  let allTx = []
  ;(st.order || []).forEach(k => {
    const m = st.months?.[k]
    if (!m) return
    ;(m.incomes || []).forEach(t => allTx.push({ ...t, kind: 'inc', month: k }))
    ;(m.expenses || []).forEach(t => allTx.push({ ...t, kind: 'exp', month: k }))
  })
  allTx.sort((a, b) => new Date(b.date) - new Date(a.date))
  const recentTx = allTx.slice(0, 5)
  const now = new Date()

  // Weekly insight + stat pills
  const orderedMonths = st.order || []
  let insight2 = '', sub2 = ''
  const insightStats = []
  if (orderedMonths.length > 0) {
    const recent2 = orderedMonths.slice(-2), prior2 = orderedMonths.slice(-4, -2)
    const catNow2 = {}, catPrev2 = {}
    recent2.forEach(k => (st.months?.[k]?.expenses || []).forEach(e => { catNow2[e.cat] = (catNow2[e.cat] || 0) + e.amount }))
    prior2.forEach(k => (st.months?.[k]?.expenses || []).forEach(e => { catPrev2[e.cat] = (catPrev2[e.cat] || 0) + e.amount }))
    let bestCat2 = '', bestDelta2 = 0
    Object.keys(catPrev2).forEach(cat => {
      const prev = catPrev2[cat] || 0, curr = catNow2[cat] || 0
      if (prev > 0 && curr < prev) { const delta = (prev - curr) / prev; if (delta > bestDelta2) { bestDelta2 = delta; bestCat2 = cat } }
    })
    const lastKey2 = orderedMonths[orderedMonths.length - 1]
    const lastM = st.months?.[lastKey2]
    const lastInc = (lastM?.incomes || []).reduce((s, t) => s + t.amount, 0)
    const lastExp = (lastM?.expenses || []).reduce((s, t) => s + t.amount, 0)
    const rate2 = lastInc > 0 ? Math.round(((lastInc - lastExp) / lastInc) * 100) : 0
    if (bestCat2 && bestDelta2 > 0.1) {
      insight2 = `You're spending ${Math.round(bestDelta2 * 100)}% less on ${bestCat2} — nice work.`
      sub2 = `That's ${fmt(catPrev2[bestCat2] - (catNow2[bestCat2] || 0))} saved vs. the prior period.`
    } else if (rate2 > 0) {
      insight2 = `Your savings rate is ${rate2}% this month.`
      sub2 = rate2 >= 20 ? 'Above the recommended 20% threshold.' : 'Trim variable expenses to push this higher.'
    } else {
      const top2 = Object.entries(catNow2).sort((a, b) => b[1] - a[1])[0]
      if (top2) { insight2 = `Top spending: ${top2[0]} at ${fmt(top2[1])}.`; sub2 = 'Review this category for savings opportunities.' }
    }
    // Stat pills
    let bestMonthKey = '', bestMonthSavings = -Infinity
    orderedMonths.forEach(k => {
      const m2 = st.months?.[k]
      if (!m2) return
      const s = (m2.incomes || []).reduce((a, t) => a + t.amount, 0) - (m2.expenses || []).reduce((a, t) => a + t.amount, 0)
      if (s > bestMonthSavings) { bestMonthSavings = s; bestMonthKey = k }
    })
    const fixedMonthly = (st.fixedExpenses || []).reduce((s, fe) => {
      const f = fe.frequency || 'monthly'
      return s + (f === 'monthly' ? fe.amount : f === 'biweekly' ? fe.amount * 26 / 12 : f === 'quarterly' ? fe.amount / 3 : f === 'annual' ? fe.amount / 12 : fe.amount)
    }, 0)
    const avgInc2 = orderedMonths.length
      ? orderedMonths.reduce((s, k) => s + ((st.months?.[k]?.incomes || []).reduce((a, t) => a + t.amount, 0)), 0) / orderedMonths.length
      : 0
    const fixedRatio = avgInc2 > 0 ? Math.round((fixedMonthly / avgInc2) * 100) : null
    const half = Math.floor(orderedMonths.length / 2)
    const firstHalfInc = half > 0 ? orderedMonths.slice(0, half).reduce((s, k) => s + ((st.months?.[k]?.incomes || []).reduce((a, t) => a + t.amount, 0)), 0) / half : 0
    const secondHalfInc = half > 0 ? orderedMonths.slice(-half).reduce((s, k) => s + ((st.months?.[k]?.incomes || []).reduce((a, t) => a + t.amount, 0)), 0) / half : 0
    const incomeTrend = firstHalfInc > 0 ? Math.round(((secondHalfInc - firstHalfInc) / firstHalfInc) * 100) : null
    let goalEta = null, goalName = ''
    const activeGoals = (st.goals || []).filter(g => g.current < g.target)
    if (activeGoals.length > 0 && avgSavings > 0) {
      const g = activeGoals[0]
      const monthlyContrib = (lastInc - lastExp) > 0 ? (lastInc - lastExp) : 0
      if (monthlyContrib > 0) { goalEta = Math.ceil((g.target - (g.current || 0)) / monthlyContrib); goalName = g.name || 'Goal' }
    }
    if (bestMonthKey) insightStats.push({ label: 'Best Month', value: bestMonthKey, cls: 'positive' })
    if (fixedRatio !== null) insightStats.push({ label: 'Fixed Costs', value: `${fixedRatio}% of income`, cls: fixedRatio > 50 ? 'negative' : fixedRatio > 30 ? '' : 'positive' })
    if (incomeTrend !== null && orderedMonths.length >= 4) insightStats.push({ label: 'Income Trend', value: `${incomeTrend >= 0 ? '↑' : '↓'} ${Math.abs(incomeTrend)}%`, cls: incomeTrend >= 0 ? 'positive' : 'negative' })
    if (goalEta !== null) insightStats.push({ label: goalName, value: `${goalEta} mo to go`, cls: '' })
  }

  return (
    <div id="overview-view">
      <div className="view-header">
        <h1>Financial Overview</h1>
        <p id="overview-subtitle">{dateRange}</p>
      </div>

      <div id="ov-hero" style={{ display: hasAccounts ? 'block' : 'none' }}>
        <div className="dash-hero-inner">
          <div className="dash-chart-card">
            <div className="dash-chart-label" id="ov-chart-label" style={{ color: heroLabelColor }}>{heroLabelText}</div>
            <canvas id="ovNetWorthChart"></canvas>
          </div>
          <div className="dash-stat-cards" id="ov-stat-cards">
            {heroStats && (
              <>
                <div className="dash-stat-card">
                  <div className="dash-stat-label">Cash</div>
                  <div className="dash-stat-value">{fmt(heroStats.cash || 0)}</div>
                  <div className={`dash-stat-change ${cashChange.cls}`}>{cashChange.text}</div>
                </div>
                <div className="dash-stat-card">
                  <div className="dash-stat-label">Invested</div>
                  <div className="dash-stat-value">{fmt(heroStats.invested || 0)}</div>
                  <div className={`dash-stat-change ${invChange.cls}`}>{invChange.text}</div>
                </div>
                <div className="dash-stat-card">
                  <div className="dash-stat-label">Liabilities</div>
                  <div className="dash-stat-value">{fmt(heroStats.totalLiabilities || 0)}</div>
                  <div className="dash-stat-change neu">Net worth: {fmt((heroStats.cash || 0) + (heroStats.invested || 0) - (heroStats.totalLiabilities || 0))}</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div id="overview-summary" className="summary-grid">
        {!hasTxData ? (
          <div className="view-empty-state" style={{ gridColumn: '1/-1' }}>
            <div className="ves-icon">📊</div>
            <div className="ves-title">No data to analyse yet</div>
            <div className="ves-sub">Add transactions in the Month tab or import a CSV from Accounts. Your spending breakdown and charts will appear here.</div>
            <div className="ves-actions">
              <button className="ves-btn-primary" data-action="switchView('month')">→ Month view</button>
              <button className="ves-btn-secondary" data-action="switchView('accounts')">📥 Import / Connect</button>
            </div>
          </div>
        ) : (
          <>
            <div className="sum-card"><div className="sum-label">Total Income</div><div className="sum-val pos">{fmt(totalInc)}</div></div>
            <div className="sum-card"><div className="sum-label">Total Expenses</div><div className="sum-val neg">{fmt(totalExp)}</div></div>
            <div className="sum-card"><div className="sum-label">Net Savings</div><div className={`sum-val ${(totalInc - totalExp) >= 0 ? 'pos' : 'neg'}`}>{fmt(totalInc - totalExp)}</div></div>
            <div className="sum-card"><div className="sum-label">Avg Savings Rate</div><div className={`sum-val ${avgSavings >= 10 ? 'pos' : 'neg'}`}>{avgSavings.toFixed(1)}%</div></div>
            <div className="sum-card">
              <div className="sum-label">Avg Savings Goal</div>
              <div className="sum-val neu">{avgSavingsGoal > 0 ? fmt(avgSavingsGoal) : 'Not set'}</div>
              {avgSavingsGoal > 0 && <div className="sum-sub">{(totalInc - totalExp) >= totalSavingsGoal ? 'exceeded' : 'in progress'}</div>}
            </div>
            <div className="sum-card"><div className="sum-label">Months</div><div className="sum-val neu">{months.length}</div></div>
          </>
        )}
      </div>

      <div id="ov-cashflow-section" style={{ display: 'none' }}>
        <div className="dash-section-card ov-cashflow-card">
          <div className="dash-section-header">
            <span>Where Your Money Goes</span>
            <span className="ov-cashflow-period" id="ov-cashflow-period"></span>
          </div>
          <div id="ov-cashflow-bars"></div>
        </div>
      </div>

      <div className="dash-bottom-row" id="ov-bottom-row" style={{ display: allTx.length ? 'flex' : 'none' }}>
        <div>
          <div className="dash-section-card">
            <div className="dash-section-header">
              <span>Recent activity</span>
              <span className="dash-view-all" data-action="switchView('month')">See all</span>
            </div>
            <div id="ov-recent-list">
              {recentTx.map((t, i) => {
                const d = new Date(t.date)
                const daysAgo = Math.floor((now - d) / 86400000)
                const dateLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                const meta = t.kind === 'inc' ? `Income · ${dateLabel}` : `${t.cat || 'Expense'} · ${dateLabel}`
                const amtStr = t.kind === 'inc' ? `+${fmt(t.amount)}` : `-${fmt(t.amount)}`
                return (
                  <div key={i} className="dash-recent-row">
                    <div>
                      <div className="dash-recent-desc">{t.desc || (t.kind === 'inc' ? 'Income' : t.cat || 'Expense')}</div>
                      <div className="dash-recent-meta">{meta}</div>
                    </div>
                    <div className={`dash-recent-amt ${t.kind}`}>{amtStr}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <div>
          <div className="dash-section-card dash-insight-card">
            <div className="dash-section-header">
              <span>Weekly Insight</span>
              <span className="dash-insight-label" style={{ marginBottom: 0 }}>✦ AI-free</span>
            </div>
            <div className="dash-insight-text" id="ov-insight-text">{insight2}</div>
            <div className="dash-insight-sub" id="ov-insight-sub">{sub2}</div>
            <div className="dash-insight-stats" id="ov-insight-stats">
              {insightStats.map((s, i) => (
                <div key={i} className="dash-insight-stat">
                  <div className="dash-insight-stat-label">{s.label}</div>
                  <div className={`dash-insight-stat-value ${s.cls}`}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div id="overview-insights" className="insights-section">
        <div className="sec-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>📊 Period Analysis</span>
          <ExplainButton kind="custom" detail={{ text: 'Summarize my trends across these months: what is improving, what is getting worse, and what I should focus on.' }} label="Summarize my trends" />
        </div>
        <div id="overview-insights-list">
          {insights.map((ins, i) => (
            <div key={i} className={`insight ${ins.type}`}>
              <span>{ins.text}</span>
              <ExplainButton kind="insight" detail={{ text: ins.text }} />
            </div>
          ))}
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card"><h3>Balance Progression <ExplainButton kind="chart" detail={{ name: 'balance progression over time' }} /></h3><canvas id="ovBalanceChart"></canvas></div>
        <div className="chart-card"><h3>Income vs Expenses <ExplainButton kind="chart" detail={{ name: 'income vs expenses by month' }} /></h3><canvas id="ovIncExpChart"></canvas></div>
        <div className="chart-card"><h3>Category Distribution <ExplainButton kind="chart" detail={{ name: 'spending by category' }} /></h3><canvas id="ovCatChart"></canvas></div>
        <div className="chart-card"><h3>Savings Rate <ExplainButton kind="chart" detail={{ name: 'savings rate by month' }} /></h3><canvas id="ovSavingsChart"></canvas></div>
        <div className="chart-card chart-card-wide"><h3>Category Trends</h3><canvas id="ovCatTrendChart"></canvas></div>
      </div>

      <div className="cat-breakdown-table">
        <div className="tx-section" style={{ marginBottom: 0 }}>
          <div className="tx-table-header">Category Breakdown</div>
          <div id="cat-table-wrapper">
            <table id="cat-table">
              <thead>
                <tr><th>Category</th><th>Total</th><th>Avg/Month</th><th>% of Total</th><th>Budget/mo</th><th>Remaining</th></tr>
              </thead>
              <tbody id="cat-tbody">
                {sortedCats.length > 0 ? (
                  sortedCats.map(([cat, tot]) => {
                    const avg = months.length ? tot / months.length : 0
                    const pct = totalExp ? (tot / totalExp) * 100 : 0
                    const budget = catBudgetsRef[cat] || 0
                    const remaining = budget > 0 ? budget - avg : null
                    return (
                      <tr key={cat}>
                        <td>{cat}</td>
                        <td>{fmt(tot)}</td>
                        <td>{fmt(avg)}</td>
                        <td>{pct.toFixed(1)}%</td>
                        <td style={{ color: 'var(--ink3)' }}>{budget > 0 ? fmt(budget) : '—'}</td>
                        <td style={{ color: remaining === null ? 'var(--ink3)' : remaining >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                          {remaining === null ? '—' : remaining >= 0 ? fmt(remaining) : `-${fmt(Math.abs(remaining))}`}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--ink3)' }}>No data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
