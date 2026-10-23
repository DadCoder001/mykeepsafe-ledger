import React, { useState, useEffect } from 'react'
import { fmt } from '../utils/format'
import ExplainButton from '../components/ExplainButton'

function TxRow({ tx, monthKey }) {
  const state = window.state || {}
  const accounts = state.accounts || []
  const isInc = tx._type === 'income'
  const isTransfer = tx._type === 'transfer'
  const dot = isInc ? 'inc' : isTransfer ? 'transfer' : 'exp'
  const desc = isTransfer
    ? (tx.desc || 'Transfer')
    : isInc
      ? (tx.desc || 'Income')
      : (tx.desc || tx.cat || '')
  const splitCount = !isInc && !isTransfer && tx.splits?.length > 1 ? tx.splits.length : 0

  const acct = tx.accountId ? accounts.find(a => a.id === tx.accountId) : null
  const acctName = acct?.name || (tx.accountId ? '?' : '')
  const acctTypeClass = acct ? `type-${acct.type || 'cash'}` : ''

  const panelType = isTransfer ? 'transfer' : isInc ? 'income' : 'expense'
  const amt = isTransfer
    ? `↔ ${fmt(tx.amount)}`
    : isInc
      ? `+${fmt(tx.amount)}`
      : `-${fmt(tx.amount)}`

  const dateStr = tx.date ? new Date(tx.date).toLocaleDateString() : ''

  const delAction = isTransfer
    ? `event.stopPropagation();deleteTransfer('${monthKey}',${tx._idx})`
    : isInc
      ? `event.stopPropagation();`
      : `event.stopPropagation();deleteExpense('${monthKey}',${tx._idx})`

  return (
    <div className="tx-row" style={{ cursor: 'pointer' }}
      data-action={`openTxPanel('${monthKey}','${panelType}',${tx._idx})`}>
      <div className={`tx-dot ${dot}`}></div>
      <div className="tx-info">
        <div className="tx-desc">
          {desc}
          {splitCount > 0 && <span className="tx-split-badge">Split ×{splitCount}</span>}
          {tx.member && <span className="tx-member-badge">{tx.member}</span>}
        </div>
        <div className="tx-meta">
          {isTransfer ? (
            <>
              {dateStr}
              {' · '}
              <span className="tx-transfer-badge">
                ↔ {accounts.find(a => a.id === tx.fromAccountId)?.name || tx.fromAccountId || '?'}
                {' → '}
                {accounts.find(a => a.id === tx.toAccountId)?.name || tx.toAccountId || '?'}
              </span>
            </>
          ) : (
            <>
              {dateStr}
              {!isInc && tx.cat && ` · ${tx.cat}`}
              {acctName && (
                <> · <span className={`tx-acct-badge ${acctTypeClass}`}>{acctName}</span></>
              )}
            </>
          )}
          {tx.tags && tx.tags.length > 0 && (
            <div className="tag-chips">
              {tx.tags.map((tag, i) => <span key={i} className="tag-chip">{tag}</span>)}
            </div>
          )}
        </div>
      </div>
      <div className={`tx-amt ${dot}`}>{amt}</div>
      <button className="tx-del" data-action={delAction}>×</button>
    </div>
  )
}

export default function MonthView() {
  const [monthKey, setMonthKey] = useState(null)
  const [tick, setTick] = useState(0)
  const [search, setSearch] = useState('')
  const [activeFilters, setActiveFilters] = useState(new Set())

  useEffect(() => {
    function handler(e) {
      const newKey = e.detail.monthKey
      const initialSearch = e.detail.initialSearch ?? null
      setMonthKey(prev => {
        if (prev !== newKey) {
          setSearch(initialSearch ?? '')
          setActiveFilters(new Set())
        } else if (initialSearch !== null) {
          setSearch(initialSearch)
        }
        return newKey
      })
      setTick(v => v + 1)
    }
    document.addEventListener('ks:month-render', handler)
    return () => document.removeEventListener('ks:month-render', handler)
  }, [])

  useEffect(() => {
    if (!monthKey) return
    const id = setTimeout(() => {
      window.initBalanceChart?.(monthKey)
      window.initExpenseChart?.(monthKey)
    }, 0)
    return () => clearTimeout(id)
  }, [monthKey, tick])

  const state = window.state
  const m = monthKey && state?.months?.[monthKey]

  if (!m) {
    return (
      <div id="month-view">
        <div className="view-header">
          <h1 id="month-title">Loading…</h1>
          <p id="month-subtitle">Track income and expenses for this month</p>
          <div id="member-filter-row" className="member-filter-row" style={{ display: 'none' }}></div>
        </div>
        <div className="add-row-collapsible">
          <div className="add-row-toggle" data-action="toggleAddRow()">
            <span>+ Add transaction manually</span>
            <span className="toggle-chevron">▼</span>
          </div>
          <div className="add-row-body" id="add-row-body">{addRowContent(state)}</div>
        </div>
        <div id="month-summary" className="summary-grid"></div>
        <div id="month-insights" className="insights-section">
          <div className="sec-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>💡 Insights</span>
            <button className="ai-narrative-btn" data-action="askAINarrative()" title="Ask AI to summarize this month">✦ Ask AI</button>
          </div>
          <div id="insights-list"></div>
        </div>
        <div className="charts-row">
          <div className="chart-card"><h3>Balance Trend</h3><canvas id="balanceChart"></canvas></div>
          <div className="chart-card"><h3>Expense Breakdown</h3><canvas id="expenseChart"></canvas></div>
        </div>
        <div className="tx-section">
          <div className="tx-table-header">Transactions</div>
          <div className="tx-search-bar">
            <input type="text" id="tx-search" placeholder="Search transactions…" autoComplete="off" />
            <div className="filter-chips">
              <span className="filter-chip" data-filter="income">Income Only</span>
              <span className="filter-chip" data-filter="expense">Expenses Only</span>
              <span className="filter-chip" data-filter="tagged">Tagged</span>
              <span className="filter-chip" data-filter="transfer">Transfers</span>
            </div>
          </div>
          <div id="tx-count" className="tx-count"></div>
          <div id="tx-list"></div>
        </div>
        <datalist id="tag-list"></datalist>
      </div>
    )
  }

  const income = m.incomes.reduce((s, t) => s + t.amount, 0)
  const expense = m.expenses.reduce((s, t) => s + t.amount, 0)
  const balance = income - expense
  const rolling = window.getRollingBalance?.(monthKey) ?? 0
  const effectiveBudget = window.getEffectiveBudget?.(monthKey) ?? (m.budget || 0)
  const savings = income > 0 ? (balance / income) * 100 : 0
  const carryAmt = state.settings?.budgetCarryForward ? (m.carryForward || 0) : 0
  const budgetSub = carryAmt > 0
    ? `Remaining: ${fmt(effectiveBudget - expense)} (incl. ${fmt(carryAmt)} carried)`
    : `Remaining: ${fmt((m.budget || 0) - expense)}`
  const savingsGoal = m.savingsGoal || 0
  const actualSaved = balance > 0 ? balance : 0
  const goalPct = savingsGoal > 0 ? Math.min((actualSaved / savingsGoal) * 100, 100) : 0
  const goalColor = savingsGoal > 0 && actualSaved < savingsGoal ? '#e74c3c' : 'var(--accent)'

  const insights = window.generateMonthInsights?.(monthKey) ?? []
  const aiOn = !!state.settings?.aiEnabled

  const allTx = [
    ...m.incomes.map((t, i) => ({ ...t, _type: 'income', _idx: i })),
    ...m.expenses.map((t, i) => ({ ...t, _type: 'expense', _idx: i })),
    ...(m.transfers || []).map((t, i) => ({ ...t, _type: 'transfer', _idx: i })),
  ]

  const activeMemberFilter = window.activeMemberFilter || null
  let filtered = allTx
  if (activeFilters.has('income')) filtered = filtered.filter(t => t._type === 'income')
  if (activeFilters.has('expense')) filtered = filtered.filter(t => t._type === 'expense')
  if (activeFilters.has('tagged')) filtered = filtered.filter(t => t.tags && t.tags.length > 0)
  if (activeFilters.has('transfer')) filtered = filtered.filter(t => t._type === 'transfer')
  if (activeMemberFilter) filtered = filtered.filter(t => t.member === activeMemberFilter)
  if (search) {
    const q = search.toLowerCase()
    filtered = filtered.filter(t => {
      const d = (t.desc || t.cat || '').toLowerCase()
      const c = (t.cat || '').toLowerCase()
      const tags = (t.tags || []).join(' ').toLowerCase()
      return d.includes(q) || c.includes(q) || tags.includes(q)
    })
  }

  const householdMembers = state.settings?.householdMembers || []

  function toggleFilter(f) {
    setActiveFilters(prev => {
      const next = new Set(prev)
      if (f === 'income' || f === 'expense') {
        const other = f === 'income' ? 'expense' : 'income'
        if (next.has(f)) next.delete(f)
        else { next.delete(other); next.add(f) }
      } else {
        next.has(f) ? next.delete(f) : next.add(f)
      }
      return next
    })
  }

  return (
    <div id="month-view">
      <div className="view-header">
        <h1 id="month-title">{monthKey}</h1>
        <p id="month-subtitle">Track income and expenses</p>
        <div id="member-filter-row" className="member-filter-row"
          style={{ display: householdMembers.length > 0 ? 'flex' : 'none' }}></div>
      </div>

      <div className="add-row-collapsible">
        <div className="add-row-toggle" data-action="toggleAddRow()">
          <span>+ Add transaction manually</span>
          <span className="toggle-chevron">▼</span>
        </div>
        <div className="add-row-body" id="add-row-body">
          {addRowContent(state)}
        </div>
      </div>

      <div id="month-summary" className="summary-grid">
        <div className="sum-card">
          <div className="sum-label">Balance</div>
          <div className={`sum-val ${balance >= 0 ? 'pos' : 'neg'}`}>{fmt(balance)}</div>
          <div className="sum-sub">This month</div>
        </div>
        <div className="sum-card">
          <div className="sum-label">Rolling Balance</div>
          <div className="sum-val neu">{fmt(rolling)}</div>
          <div className="sum-sub">All time</div>
        </div>
        <div className="sum-card">
          <div className="sum-label">Income</div>
          <div className="sum-val pos">{fmt(income)}</div>
        </div>
        <div className="sum-card">
          <div className="sum-label">Expenses</div>
          <div className="sum-val neg">{fmt(expense)}</div>
        </div>
        <div className="sum-card">
          <div className="sum-label">Savings Rate</div>
          <div className={`sum-val ${savings >= 10 ? 'pos' : 'neg'}`}>{savings.toFixed(1)}%</div>
        </div>
        <div className="sum-card">
          <div className="sum-label">Budget</div>
          <div className="sum-val neu">{fmt(effectiveBudget)}</div>
          <div className="sum-sub">{budgetSub}</div>
        </div>
        {savingsGoal > 0 && (
          <div className="sum-card">
            <div className="sum-label">Savings Goal</div>
            <div className={`sum-val ${actualSaved >= savingsGoal ? 'pos' : 'neg'}`}>{fmt(actualSaved)}</div>
            <div className="sum-sub">
              {actualSaved >= savingsGoal
                ? `${fmt(actualSaved)} of ${fmt(savingsGoal)} saved`
                : `${fmt(savingsGoal - actualSaved)} remaining`}
            </div>
            <div className="goal-bar">
              <div className="goal-fill" style={{ width: `${goalPct.toFixed(1)}%`, background: goalColor }}></div>
            </div>
          </div>
        )}
      </div>

      <div id="month-insights" className="insights-section">
        <div className="sec-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>💡 Insights</span>
          {aiOn && <button className="ai-narrative-btn" data-action="askAINarrative()" title="Ask your AI CFO for a review of this month">✦ Monthly CFO review</button>}
        </div>
        <div id="insights-list">
          {insights.length > 0
            ? insights.map((ins, i) => (
                <div key={i} className={`insight ${ins.type}`}>
                  <span>{ins.text}</span>
                  <ExplainButton kind="insight" detail={{ text: ins.text }} />
                </div>
              ))
            : <div className="empty-state">No insights yet</div>
          }
        </div>
        {m.cfoReview?.text && (
          <details className="cfo-review">
            <summary>Your CFO review for this month <span className="ai-muted">· saved {new Date(m.cfoReview.savedAt).toLocaleDateString()}</span></summary>
            <div className="cfo-review-body" dangerouslySetInnerHTML={{ __html: window.renderAIText?.(m.cfoReview.text) || '' }} />
          </details>
        )}
      </div>

      <div className="charts-row">
        <div className="chart-card"><h3>Balance Trend <ExplainButton kind="chart" detail={{ name: 'balance trend' }} /></h3><canvas id="balanceChart"></canvas></div>
        <div className="chart-card"><h3>Expense Breakdown <ExplainButton kind="chart" detail={{ name: 'expense breakdown by category' }} /></h3><canvas id="expenseChart"></canvas></div>
      </div>

      <CategoryBudgets monthKey={monthKey} m={m} />

      <div className="tx-section">
        <div className="tx-table-header">Transactions</div>
        <div className="tx-search-bar">
          <input type="text" id="tx-search" placeholder="Search transactions…" autoComplete="off"
            value={search} onChange={e => setSearch(e.target.value)} />
          <div className="filter-chips">
            {[
              { key: 'income', label: 'Income Only' },
              { key: 'expense', label: 'Expenses Only' },
              { key: 'tagged', label: 'Tagged' },
              { key: 'transfer', label: 'Transfers' },
            ].map(({ key, label }) => (
              <span key={key}
                className={`filter-chip${activeFilters.has(key) ? ' active' : ''}`}
                data-filter={key}
                onClick={() => toggleFilter(key)}>
                {label}
              </span>
            ))}
          </div>
        </div>
        <div id="tx-count" className="tx-count">
          {(search || activeFilters.size > 0) ? `Showing ${filtered.length} of ${allTx.length}` : ''}
        </div>
        <div id="tx-list">
          {allTx.length === 0 ? (
            <div className="view-empty-state" style={{ padding: '2.5rem 1rem' }}>
              <div className="ves-icon">📄</div>
              <div className="ves-title">No transactions yet</div>
              <div className="ves-sub">Add income or expenses using the form above, or go to the <strong>Accounts</strong> tab to import a CSV or connect a bank.</div>
              <div className="ves-actions">
                <button className="ves-btn-primary" data-action="switchView('accounts')">→ Go to Accounts</button>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">No matching transactions</div>
          ) : (
            filtered.map(t => (
              <TxRow key={`${t._type}-${t._idx}`} tx={t} monthKey={monthKey} />
            ))
          )}
        </div>
      </div>
      <datalist id="tag-list"></datalist>
    </div>
  )
}

function CategoryBudgets({ monthKey, m }) {
  const catSpend = {}
  ;(m.expenses || []).forEach(e => {
    if (e.splits?.length) {
      e.splits.forEach(s => { catSpend[s.cat] = (catSpend[s.cat] || 0) + s.amount })
    } else {
      catSpend[e.cat] = (catSpend[e.cat] || 0) + e.amount
    }
  })
  const catBudgets = m.categoryBudgets || {}
  const cats = Array.from(new Set([...Object.keys(catSpend), ...Object.keys(catBudgets)])).sort()
  if (cats.length === 0) return null

  return (
    <div className="tx-section cat-budget-section">
      <div className="tx-table-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Category Budgets <ExplainButton kind="budget" label="Explain my budget" /></span>
        <button
          style={{ fontSize: '0.78rem', padding: '0.25rem 0.65rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface2)', cursor: 'pointer', color: 'var(--ink2)' }}
          onClick={() => {
            const suggestions = window.suggestCategoryBudgets?.(monthKey)
            if (!suggestions || !Object.keys(suggestions).length) return
            for (const [cat, amt] of Object.entries(suggestions)) {
              window.setCategoryBudget?.(monthKey, cat, amt)
            }
          }}
          title="Pre-fill budgets from average of last 3 months (+10% buffer)"
        >✦ Smart Budget</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ color: 'var(--ink3)', textAlign: 'left' }}>
            <th style={{ padding: '0.4rem 0.5rem' }}>Category</th>
            <th style={{ padding: '0.4rem 0.5rem' }}>Budget</th>
            <th style={{ padding: '0.4rem 0.5rem' }}>Actual</th>
            <th style={{ padding: '0.4rem 0.5rem' }}>Remaining</th>
            <th style={{ padding: '0.4rem 0.5rem', minWidth: '80px' }}></th>
          </tr>
        </thead>
        <tbody>
          {cats.map(cat => {
            const budget = catBudgets[cat] || 0
            const actual = catSpend[cat] || 0
            const remaining = budget - actual
            const pct = budget > 0 ? Math.min((actual / budget) * 100, 100) : 0
            const over = budget > 0 && actual > budget
            return (
              <tr key={cat} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '0.45rem 0.5rem' }}>{cat}</td>
                <td style={{ padding: '0.45rem 0.5rem' }}>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={budget || ''}
                    placeholder="—"
                    style={{ width: '80px', padding: '0.25rem 0.4rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.88rem', background: 'var(--surface2)' }}
                    onBlur={e => window.setCategoryBudget?.(monthKey, cat, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                  />
                </td>
                <td style={{ padding: '0.45rem 0.5rem', color: over ? 'var(--neg)' : 'var(--ink)' }}>{fmt(actual)}</td>
                <td style={{ padding: '0.45rem 0.5rem', color: budget === 0 ? 'var(--ink3)' : over ? 'var(--neg)' : 'var(--pos)' }}>
                  {budget > 0 ? (over ? `-${fmt(Math.abs(remaining))}` : fmt(remaining)) : '—'}
                </td>
                <td style={{ padding: '0.45rem 0.5rem' }}>
                  {budget > 0 && (
                    <div className="goal-bar" style={{ margin: 0 }}>
                      <div className="goal-fill" style={{ width: `${pct.toFixed(1)}%`, background: over ? 'var(--neg)' : 'var(--accent)' }}></div>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function addRowContent(state) {
  return (
    <div className="add-row">
      <div className="add-card">
        <h3>Add Income</h3>
        <input id="income-amount" type="number" placeholder="Amount" />
        <input id="income-desc" type="text" placeholder="Description (optional)" />
        <input id="income-tags" type="text" placeholder="Tags (comma-separated)" list="tag-list" />
        <select id="income-member" className="add-card-member-sel" style={{ display: 'none' }}>
          <option value="">— All members —</option>
        </select>
        <select id="income-account" className="add-card-account-sel"></select>
        <button data-action="addIncome()">+ Add Income</button>
      </div>

      <div className="add-card">
        <h3>Add Expense</h3>
        <input id="expense-amount" type="number" placeholder="Amount" />
        <input id="expense-desc" type="text" placeholder="Description" />
        <input id="expense-cat" type="text" placeholder="Category" list="cat-list" />
        <datalist id="cat-list"></datalist>
        <input id="expense-tags" type="text" placeholder="Tags (comma-separated)" list="tag-list" />
        <select id="expense-member" className="add-card-member-sel" style={{ display: 'none' }}>
          <option value="">— All members —</option>
        </select>
        <select id="expense-account" className="add-card-account-sel"></select>
        <button data-action="addExpense()">- Add Expense</button>
      </div>

      <div className="add-card">
        <h3>↔ Transfer</h3>
        <input id="transfer-amount" type="number" placeholder="Amount" />
        <input id="transfer-desc" type="text" placeholder="Description (optional)" />
        <input id="transfer-tags" type="text" placeholder="Tags (comma-separated)" list="tag-list" />
        <select id="transfer-from" className="add-card-account-sel"></select>
        <select id="transfer-to" className="add-card-account-sel"></select>
        <button className="add-card-transfer-btn" data-action="addTransfer()">↔ Transfer</button>
      </div>
    </div>
  )
}
