import React, { useState, useEffect } from 'react'

export default function DashboardView() {
  const [tick, setTick] = useState(0)

  const st = tick ? (window.state || {}) : {}
  const qsSteps = {
    hasAccount: (st.accounts || []).length > 0,
    hasData: Object.values(st.months || {}).some(m => (m.incomes || []).length > 0 || (m.expenses || []).length > 0),
    hasImport: !!st.settings?.lastCsvImport,
    hasLinked: !!(st.settings?.linkedFilePath),
  }
  const completedCount = Object.values(qsSteps).filter(Boolean).length

  useEffect(() => {
    function handler() { setTick(v => v + 1) }
    document.addEventListener('ks:dashboard-render', handler)
    return () => document.removeEventListener('ks:dashboard-render', handler)
  }, [])

  useEffect(() => {
    if (!tick) return
    const id = setTimeout(() => {
      const state = window.state
      if (!state) return

      const userName = (state.settings && state.settings.userName) || ''
      const accounts = state.accounts || []
      const goals = state.goals || []
      const hasAccounts = accounts.length > 0
      const hasGoals = goals.length > 0
      const hasAssets = (state.assets || []).length > 0 || (state.liabilities || []).length > 0

      let allTx = []
      state.order.forEach(k => {
        const m = state.months[k]
        ;(m.incomes || []).forEach(t => allTx.push({ ...t, kind: 'inc', month: k }))
        ;(m.expenses || []).forEach(t => allTx.push({ ...t, kind: 'exp', month: k }))
      })
      allTx.sort((a, b) => new Date(b.date) - new Date(a.date))
      const hasTx = allTx.length > 0
      const hasData = hasAccounts || hasGoals || hasAssets || hasTx

      window.applyQuickStartState?.()

      const greetEl = document.getElementById('dash-time-greeting')
      if (greetEl) {
        const greeting = window.getTimeGreeting?.() ?? 'Good day'
        greetEl.textContent = userName ? `${greeting}, ${userName}` : greeting
      }

      const nameInput = document.getElementById('dash-name-input')
      if (nameInput && !nameInput._focused) nameInput.value = userName

      const heroEl = document.getElementById('dash-hero')
      if (heroEl) {
        if (hasAccounts || hasAssets) {
          heroEl.style.display = 'block'
          window.renderDashStats?.()
          window.initDashChart?.()
        } else {
          heroEl.style.display = 'none'
          window.destroyChart?.('dashNetWorth')
        }
      }

      const acctSection = document.getElementById('dash-accounts-section')
      if (acctSection) {
        acctSection.style.display = hasAccounts ? 'block' : 'none'
        if (hasAccounts) window.renderDashAccounts?.()
      }

      const goalsSection = document.getElementById('dash-goals-section')
      if (goalsSection) {
        goalsSection.style.display = 'block'
        if (hasGoals) {
          window.renderDashGoals?.()
        } else {
          const list = document.getElementById('dash-goals-list')
          if (list) list.innerHTML = `
            <div class="view-empty-state" style="padding:1.5rem 1rem;min-height:unset;">
              <div class="ves-icon" style="font-size:1.8rem;">◎</div>
              <div class="ves-title">No goals yet</div>
              <div class="ves-sub" style="margin-bottom:1rem;">Set a savings target — Emergency fund, Vacation, or Debt payoff.</div>
              <div class="ves-actions">
                <button class="ves-btn-primary" data-action="document.getElementById('goal-name')?.focus();switchView('dashboard')">+ Add a goal</button>
              </div>
            </div>`
        }
      }

      const recentSection = document.getElementById('dash-recent-section')
      if (recentSection) {
        recentSection.style.display = hasTx ? 'block' : 'none'
        if (hasTx) window.renderDashRecent?.(allTx.slice(0, 5))
      }

      const insightSection = document.getElementById('dash-insight-section')
      if (insightSection) {
        insightSection.style.display = hasTx ? 'block' : 'none'
        if (hasTx) window.renderDashInsight?.()
      }

      const emptyState = document.getElementById('dash-empty-state')
      if (emptyState) emptyState.style.display = hasData ? 'none' : 'block'

      // Age of Money
      const aom = window.calcAgeOfMoney?.()
      const healthRow = document.getElementById('dash-health-row')
      if (healthRow) {
        if (aom !== null && hasTx) {
          healthRow.style.display = 'block'
          const daysEl = document.getElementById('dash-aom-days')
          const subEl = document.getElementById('dash-aom-sub')
          if (daysEl) {
            daysEl.textContent = aom
            daysEl.className = 'dash-aom-days ' + (aom >= 30 ? 'aom-green' : aom >= 7 ? 'aom-yellow' : 'aom-red')
          }
          if (subEl) subEl.textContent = aom >= 30 ? 'days ahead — solid buffer' : aom >= 7 ? 'days ahead — building cushion' : 'days — watch your buffer'
        } else {
          healthRow.style.display = 'none'
        }
      }

      // Upcoming Bills
      window.renderDashBills?.()
    }, 0)
    return () => clearTimeout(id)
  }, [tick])

  return (
    <div id="dashboard-view">
      <div id="dash-quickstart">
        <div className="qs-card" id="qs-card">
          <div className="qs-card-header" data-action="toggleQuickStart()">
            <div className="qs-card-header-text">
              <p className="qs-card-title">👋 Quick Start — get set up in minutes</p>
              <p className="qs-card-sub" id="qs-card-sub">Quick Start guide — tap to expand</p>
            </div>
            <button className="qs-card-toggle" id="qs-toggle-btn" title="Toggle">▾</button>
          </div>
          <div id="qs-tiles-wrap">
            {completedCount > 0 && (
              <div className="qs-progress-bar" title={`${completedCount} of 4 steps complete`}>
                <div className="qs-progress-fill" style={{ width: `${completedCount * 25}%` }} />
              </div>
            )}
            <div className="qs-tiles">
              <div className={`qs-tile${qsSteps.hasData ? ' done' : ''}`} data-action="event.stopPropagation();switchView('month');document.getElementById('add-income-form')?.scrollIntoView({behavior:'smooth'})">
                <div className="qs-tile-icon">{qsSteps.hasData ? '✓' : '📅'}</div>
                <div className="qs-tile-label">Log a Month</div>
                <div className="qs-tile-hint">Set a budget &amp; add transactions</div>
              </div>
              <div className={`qs-tile${qsSteps.hasAccount ? ' done' : ''}`} data-action="event.stopPropagation();switchView('accounts')">
                <div className="qs-tile-icon">{qsSteps.hasAccount ? '✓' : '🏦'}</div>
                <div className="qs-tile-label">Add Account</div>
                <div className="qs-tile-hint">Track checking, savings, investments</div>
              </div>
              <div className={`qs-tile${qsSteps.hasImport ? ' done' : ''}`} data-action="event.stopPropagation();switchView('accounts')">
                <div className="qs-tile-icon">{qsSteps.hasImport ? '✓' : '📥'}</div>
                <div className="qs-tile-label">Import CSV</div>
                <div className="qs-tile-hint">Bring in a statement exported from your bank</div>
              </div>
              <div className={`qs-tile${qsSteps.hasLinked ? ' done' : ''}`} data-action="event.stopPropagation();linkFile()">
                <div className="qs-tile-icon">{qsSteps.hasLinked ? '✓' : '🔗'}</div>
                <div className="qs-tile-label">Link Data File</div>
                <div className="qs-tile-hint">Auto-save to a local JSON file</div>
              </div>
            </div>
            <div className="qs-demo-row">
              <button className="qs-demo-row-btn" data-action="event.stopPropagation();exploreSampleData()">Explore the app with sample data first</button>
            </div>
          </div>
        </div>
      </div>

      <div className="dash-header">
        <div>
          <div className="dash-greeting-sub" id="dash-time-greeting">Good morning</div>
          <h1 className="dash-greeting-name">Here&rsquo;s your money today.</h1>
        </div>
        <div className="dash-search-bar">
          <input type="text" id="dash-search" placeholder="Search transactions…" autoComplete="off" />
        </div>
      </div>

      <div id="dash-hero" style={{ display: 'none' }}>
        <div className="dash-hero-inner">
          <div className="dash-chart-card">
            <div className="dash-chart-label" id="dash-chart-label"></div>
            <canvas id="dashNetWorthChart"></canvas>
          </div>
          <div className="dash-stat-cards" id="dash-stat-cards"></div>
        </div>
      </div>

      <div id="dash-accounts-section" style={{ display: 'none' }}>
        <div className="dash-section-card">
          <div className="dash-section-header">
            <span>Accounts</span>
            <span className="dash-view-all" data-action="switchView('networth')">View all</span>
          </div>
          <div id="dash-accounts-list"></div>
        </div>
      </div>

      <div id="dash-health-row" style={{ display: 'none' }}>
        <div className="dash-section-card dash-health-card">
          <div className="dash-health-label">Age of Money</div>
          <div className="dash-aom-days aom-green" id="dash-aom-days">—</div>
          <div className="dash-health-sub" id="dash-aom-sub">days ahead</div>
        </div>
      </div>

      <div className="dash-bottom-row">
        <div id="dash-goals-section" style={{ display: 'none' }}>
          <div className="dash-section-card">
            <div className="dash-section-header">
              <span>Goals</span>
              <span style={{ fontSize: '16px', color: 'var(--ink3)' }}>◎</span>
            </div>
            <div id="dash-goals-list"></div>
          </div>
        </div>

        <div id="dash-bills-section" style={{ display: 'none' }}>
          <div className="dash-section-card">
            <div className="dash-section-header">
              <span>Upcoming Bills</span>
              <span className="dash-bills-total" id="dash-bills-total"></span>
            </div>
            <div id="dash-bills-list"></div>
          </div>
        </div>

        <div id="dash-recent-section" style={{ display: 'none' }}>
          <div className="dash-section-card">
            <div className="dash-section-header">
              <span>Recent activity</span>
              <span className="dash-view-all" data-action="switchView('month')">See all</span>
            </div>
            <div id="dash-recent-list"></div>
          </div>
        </div>

        <div id="dash-insight-section" style={{ display: 'none' }}>
          <div className="dash-section-card dash-insight-card">
            <div className="dash-insight-label">Weekly Insight</div>
            <div className="dash-insight-text" id="dash-insight-text"></div>
            <div className="dash-insight-sub" id="dash-insight-sub"></div>
          </div>
        </div>
      </div>

      <div id="dash-empty-state" style={{ display: 'none', position: 'relative', minHeight: '360px' }}>
        <div className="qs-ghost-layer" aria-hidden="true">
          <div className="summary-grid">
            {['Income', 'Expenses', 'Savings', 'Net Worth'].map(l => (
              <div key={l} className="sum-card ghost-card">
                <div className="sum-label">{l}</div>
                <div className="sum-val ghost-val">$0,000</div>
              </div>
            ))}
          </div>
          <div className="dash-section-card ghost-card" style={{ height: 100, marginBottom: '1rem' }} />
          <div className="dash-section-card ghost-card" style={{ height: 72 }} />
        </div>
        <div className="qs-onboarding-overlay">
          <div className="qs-onboarding-card">
            <div className="qs-ob-title">Welcome to MyKeepSafe Ledger 👋</div>
            <p className="qs-ob-sub">Get set up in 3 steps</p>
            <div className="qs-steps">
              <div className="qs-step" data-action="switchView('accounts')">
                <span className="qs-step-num">1</span>
                <span className="qs-step-text"><strong>Add an account</strong> — cash, investment, or retirement</span>
                <span className="qs-step-arrow">→</span>
              </div>
              <div className="qs-step" data-action="switchView('month')">
                <span className="qs-step-num">2</span>
                <span className="qs-step-text"><strong>Log your first month</strong> — income and expenses</span>
                <span className="qs-step-arrow">→</span>
              </div>
              <div className="qs-step" data-action="switchView('accounts')">
                <span className="qs-step-num">3</span>
                <span className="qs-step-text"><strong>Import a bank CSV</strong> — from Accounts tab</span>
                <span className="qs-step-arrow">→</span>
              </div>
            </div>
            <div className="qs-ob-or">or</div>
            <button className="qs-ob-demo-btn" data-action="exploreSampleData()">Explore with sample data first</button>
          </div>
        </div>
      </div>
    </div>
  )
}
