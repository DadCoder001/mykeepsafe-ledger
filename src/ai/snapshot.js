// Financial snapshot for the AI assistant.
//
// Every number the model sees is computed here, in JavaScript, so a small
// local model never has to do arithmetic. The model's job is to explain and
// prioritise, not to calculate. Pure functions only: pass in the app state.

const sum = arr => arr.reduce((s, x) => s + (Number(x) || 0), 0)
const round = n => Math.round(n * 100) / 100

export function money(n) {
  const v = Number(n) || 0
  const sign = v < 0 ? '-' : ''
  return sign + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pct(n) {
  if (n === null || n === undefined || !isFinite(n)) return 'n/a'
  return `${n >= 0 ? '+' : ''}${Math.round(n)}%`
}

// "up $50.00 (+16%) from $320.00" — the model should never have to subtract.
function changeVs(current, previous, label, labelFirst = false) {
  const diff = current - previous
  const ref = labelFirst ? `${label} of ${money(previous)}` : `${money(previous)} ${label}`
  if (Math.abs(diff) < 0.005) return labelFirst ? `same as ${ref}` : `same as ${label} (${money(previous)})`
  const p = previous ? ` (${pct(((current - previous) / previous) * 100)})` : ''
  return `${diff > 0 ? 'up' : 'down'} ${money(Math.abs(diff))}${p} from ${ref}`
}

function changePct(current, previous) {
  if (!previous) return null
  return ((current - previous) / previous) * 100
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export function monthLabel(key) {
  const [y, m] = String(key || '').split('-').map(Number)
  return y && m ? `${MONTH_NAMES[m - 1]} ${y}` : String(key || '')
}

function monthlyEquivalent(fe) {
  const factor = { monthly: 1, biweekly: 26 / 12, quarterly: 1 / 3, annual: 1 / 12 }[fe.frequency || 'monthly'] ?? 1
  return (Number(fe.amount) || 0) * factor
}

// Short merchant key: "AMAZON MKTPLACE #123 SEATTLE" → "amazon mktplace"
function merchantKey(desc) {
  return String(desc || 'Unknown').toLowerCase().replace(/[#*\d]+.*$/, '').replace(/[^a-z& ]+/g, ' ').trim().split(/\s+/).slice(0, 2).join(' ') || 'unknown'
}

export function monthTotals(state, key) {
  const m = state.months?.[key]
  if (!m) return null
  const income = sum((m.incomes || []).map(t => t.amount))
  const expenses = sum((m.expenses || []).map(t => t.amount))
  const byCategory = {}
  ;(m.expenses || []).forEach(e => { const c = e.cat || 'Other'; byCategory[c] = (byCategory[c] || 0) + (Number(e.amount) || 0) })
  return {
    key,
    income,
    expenses,
    net: income - expenses,
    savingsRate: income > 0 ? ((income - expenses) / income) * 100 : null,
    budget: Number(m.budget) || 0,
    savingsGoal: Number(m.savingsGoal) || 0,
    categoryBudgets: m.categoryBudgets || {},
    byCategory,
    expenseCount: (m.expenses || []).length,
    incomeCount: (m.incomes || []).length,
  }
}

function previousKeys(state, key, n) {
  const order = state.order || []
  const i = order.indexOf(key)
  if (i <= 0) return []
  return order.slice(Math.max(0, i - n), i)
}

// Per-category comparison against last month and the prior 3-month average.
export function categoryChanges(state, key) {
  const cur = monthTotals(state, key)
  if (!cur) return []
  const prevKey = previousKeys(state, key, 1)[0]
  const prev = prevKey ? monthTotals(state, prevKey) : null
  const prior = previousKeys(state, key, 3).map(k => monthTotals(state, k)).filter(Boolean)
  const cats = new Set([...Object.keys(cur.byCategory), ...(prev ? Object.keys(prev.byCategory) : [])])
  return [...cats].map(cat => {
    const amount = cur.byCategory[cat] || 0
    const last = prev ? (prev.byCategory[cat] || 0) : null
    const avg3 = prior.length ? sum(prior.map(p => p.byCategory[cat] || 0)) / prior.length : null
    const budget = Number(cur.categoryBudgets[cat]) || 0
    return {
      cat,
      amount,
      share: cur.expenses > 0 ? (amount / cur.expenses) * 100 : 0,
      lastMonth: last,
      vsLastMonthPct: last !== null ? changePct(amount, last) : null,
      avg3,
      avgMonths: prior.length,
      vsAvg3Pct: avg3 !== null ? changePct(amount, avg3) : null,
      budget,
      overBudget: budget > 0 && amount > budget ? amount - budget : 0,
    }
  }).sort((a, b) => b.amount - a.amount)
}

function largestExpenses(state, key, n) {
  const m = state.months?.[key]
  return [...(m?.expenses || [])].sort((a, b) => b.amount - a.amount).slice(0, n)
}

function topMerchants(state, key, n) {
  const m = state.months?.[key]
  const groups = {}
  ;(m?.expenses || []).forEach(e => {
    const k = merchantKey(e.desc)
    if (!groups[k]) groups[k] = { name: e.desc, total: 0, count: 0 }
    groups[k].total += Number(e.amount) || 0
    groups[k].count += 1
  })
  return Object.values(groups).filter(g => g.count > 1 || g.total > 0).sort((a, b) => b.total - a.total).slice(0, n)
}

// Expenses far above what is normal for their category in recent months.
function unusualExpenses(state, key, n) {
  const m = state.months?.[key]
  if (!m) return []
  const history = {}
  previousKeys(state, key, 6).forEach(k => {
    ;(state.months[k]?.expenses || []).forEach(e => {
      const c = e.cat || 'Other'
      ;(history[c] = history[c] || []).push(Number(e.amount) || 0)
    })
  })
  return (m.expenses || [])
    .filter(e => !e.fixedId)
    .map(e => {
      const past = history[e.cat || 'Other'] || []
      const typical = past.length >= 3 ? sum(past) / past.length : null
      return { e, ratio: typical ? e.amount / typical : null, typical }
    })
    .filter(x => x.ratio !== null && x.ratio >= 2.5 && x.e.amount >= 50)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, n)
}

function liquidCash(state) {
  const accounts = (state.accounts || []).filter(a => ['cash', 'savings'].includes(a.type)).reduce((s, a) => s + (Number(a.balance) || 0), 0)
  const assets = (state.assets || []).filter(a => a.category === 'cash').reduce((s, a) => s + (Number(a.value) || 0), 0)
  return accounts + assets
}

export function netWorth(state) {
  const accountAssets = sum((state.accounts || []).map(a => a.balance))
  const assets = sum((state.assets || []).map(a => a.value)) + accountAssets
  const liabilities = sum((state.liabilities || []).map(l => l.value ?? l.balance))
  return { assets, liabilities, netWorth: assets - liabilities }
}

function recentAverages(state, key, n = 3) {
  const keys = [...previousKeys(state, key, n - 1), key].filter(k => state.months?.[k])
  const totals = keys.map(k => monthTotals(state, k)).filter(Boolean)
  if (!totals.length) return { months: 0, income: 0, expenses: 0 }
  return { months: totals.length, income: sum(totals.map(t => t.income)) / totals.length, expenses: sum(totals.map(t => t.expenses)) / totals.length }
}

function line(label, value) { return `- ${label}: ${value}` }

function monthSection(state, key, opts) {
  const t = monthTotals(state, key)
  if (!t) return `No data recorded for ${monthLabel(key)} yet.`
  const out = [`## ${monthLabel(key)} (selected month)`]
  out.push(line('Income', money(t.income)))
  out.push(line('Spending', money(t.expenses)))
  const prevKey = previousKeys(state, key, 1)[0]
  const prev = prevKey ? monthTotals(state, prevKey) : null
  if (prev) {
    out.push(line('Spending vs last month', changeVs(t.expenses, prev.expenses, `in ${monthLabel(prevKey)}`)))
    if (t.income || prev.income) out.push(line('Income vs last month', changeVs(t.income, prev.income, `in ${monthLabel(prevKey)}`)))
  }
  const discretionary = (state.months[key].expenses || []).filter(x => !x.fixedId).reduce((s, x) => s + (Number(x.amount) || 0), 0)
  if (discretionary > 0 && discretionary < t.expenses) out.push(line('Spending outside fixed bills', money(discretionary)))
  out.push(line('Net (income minus spending)', money(t.net)))
  out.push(line('Savings rate', t.savingsRate === null ? 'n/a (no income recorded)' : `${Math.round(t.savingsRate)}%`))
  if (t.budget > 0) out.push(line('Budget', `${money(t.budget)} — ${t.expenses <= t.budget ? money(t.budget - t.expenses) + ' left' : money(t.expenses - t.budget) + ' OVER budget'}`))
  if (t.savingsGoal > 0) out.push(line('Savings goal', `${money(t.savingsGoal)} — ${t.net >= t.savingsGoal ? 'met' : 'short by ' + money(t.savingsGoal - t.net)}`))

  const fixedMonthly = sum((state.fixedExpenses || []).map(monthlyEquivalent))
  if (fixedMonthly > 0) {
    out.push(line('Fixed bills (monthly equivalent)', `${money(fixedMonthly)}${t.expenses > 0 ? ` (${Math.round((fixedMonthly / t.expenses) * 100)}% of spending)` : ''}`))
  }

  const cats = categoryChanges(state, key).slice(0, opts.compact ? 6 : 10)
  if (cats.length) {
    out.push('', '### Spending by category (compared with last month and the average of earlier months)')
    cats.forEach(c => {
      const parts = [`${money(c.amount)} (${Math.round(c.share)}% of spending)`]
      if (c.lastMonth !== null && c.amount > 0 && !c.lastMonth && !c.avg3) parts.push('new this month (nothing in earlier months)')
      else {
        if (c.lastMonth !== null) parts.push(c.lastMonth ? changeVs(c.amount, c.lastMonth, 'last month') : 'nothing last month')
        if (c.avg3 !== null && c.avgMonths > 1) parts.push(changeVs(c.amount, c.avg3, `its ${c.avgMonths}-month average`, true))
      }
      if (c.budget) parts.push(c.overBudget ? `OVER its ${money(c.budget)} budget by ${money(c.overBudget)}` : `within its ${money(c.budget)} budget`)
      out.push(line(c.cat, parts.join('; ')))
    })
  }

  const largest = largestExpenses(state, key, opts.compact ? 3 : 5)
  if (largest.length) {
    out.push('', '### Largest expenses this month')
    largest.forEach(e => out.push(line(e.desc || 'Unnamed', `${money(e.amount)} (${e.cat || 'Other'})${e.fixedId ? ', fixed bill' : ''}`)))
  }

  if (!opts.compact) {
    const merchants = topMerchants(state, key, 5).filter(g => g.count > 1)
    if (merchants.length) {
      out.push('', '### Repeat merchants this month')
      merchants.forEach(g => out.push(line(g.name, `${g.count} purchases, ${money(g.total)} total`)))
    }
  }

  const unusual = unusualExpenses(state, key, 3)
  if (unusual.length) {
    out.push('', '### Unusual expenses (much higher than normal for the category)')
    unusual.forEach(x => out.push(line(x.e.desc || 'Unnamed', `${money(x.e.amount)} in ${x.e.cat || 'Other'}, about ${x.ratio.toFixed(1)}x the usual ${money(x.typical)}`)))
  }
  return out.join('\n')
}

function trendSection(state, key, opts) {
  const keys = (state.order || []).filter(k => !key || k <= key).slice(-(opts.compact ? 4 : 6))
  const rows = keys.map(k => monthTotals(state, k)).filter(Boolean)
  if (rows.length < 2) return ''
  const out = ['## Recent months']
  rows.forEach(r => out.push(line(monthLabel(r.key), `income ${money(r.income)}, spending ${money(r.expenses)}, net ${money(r.net)}, savings rate ${r.savingsRate === null ? 'n/a' : Math.round(r.savingsRate) + '%'}`)))
  const best = [...rows].filter(r => r.savingsRate !== null).sort((a, b) => b.savingsRate - a.savingsRate)[0]
  const worst = [...rows].filter(r => r.savingsRate !== null).sort((a, b) => a.savingsRate - b.savingsRate)[0]
  if (best && worst && best.key !== worst.key) {
    out.push(line('Best month for saving', `${monthLabel(best.key)} (${Math.round(best.savingsRate)}%)`))
    out.push(line('Weakest month for saving', `${monthLabel(worst.key)} (${Math.round(worst.savingsRate)}%)`))
  }
  const avgSpend = sum(rows.map(r => r.expenses)) / rows.length
  const avgIncome = sum(rows.map(r => r.income)) / rows.length
  out.push(line(`Average over these ${rows.length} months`, `income ${money(avgIncome)}, spending ${money(avgSpend)}, net ${money(avgIncome - avgSpend)}`))
  return out.join('\n')
}

function positionSection(state, key, opts) {
  const out = ['## Overall position']
  const nw = netWorth(state)
  out.push(line('Net worth', `${money(nw.netWorth)} (assets ${money(nw.assets)}, debts ${money(nw.liabilities)})`))
  const snaps = (state.netWorthSnapshots || []).filter(s => !key || s.month <= key)
  if (snaps.length >= 2) {
    const a = snaps[snaps.length - 2], b = snaps[snaps.length - 1]
    out.push(line('Net worth change since last snapshot', `${money(b.value - a.value)} (${monthLabel(a.month)} → ${monthLabel(b.month)})`))
  }
  const cash = liquidCash(state)
  const avg = recentAverages(state, key, 3)
  if (cash > 0 && avg.expenses > 0) {
    out.push(line('Cash on hand (checking, savings, cash assets)', money(cash)))
    out.push(line('Emergency runway', `${(cash / avg.expenses).toFixed(1)} months of average spending (${money(avg.expenses)}/month)`))
  }
  const debts = (state.liabilities || []).filter(l => (l.value ?? l.balance) > 0)
  if (debts.length) {
    out.push('', '### Debts')
    debts.slice(0, opts.compact ? 3 : 6).forEach(l => {
      const rate = Number(l.interestRate) || 0
      const bal = Number(l.value ?? l.balance) || 0
      const parts = [money(bal)]
      if (rate) parts.push(`${rate}% APR, about ${money((bal * rate) / 100 / 12)}/month in interest`)
      if (l.minimumPayment) parts.push(`minimum ${money(l.minimumPayment)}/month`)
      out.push(line(l.name || 'Debt', parts.join(', ')))
    })
  }
  const goals = state.goals || []
  if (goals.length && !opts.compact) {
    out.push('', '### Goals')
    goals.slice(0, 5).forEach(g => {
      const current = typeof opts.goalCurrent === 'function' ? opts.goalCurrent(g) : (Number(g.current) || 0)
      const target = Number(g.target) || 0
      out.push(line(g.name || 'Goal', `${money(current)} of ${money(target)}${target ? ` (${Math.round((current / target) * 100)}%)` : ''}`))
    })
  }
  return out.join('\n')
}

function subscriptionsSection(state, opts) {
  const fixed = (state.fixedExpenses || []).filter(fe => /subscription/i.test(fe.cat || ''))
  const detected = typeof opts.detectRecurring === 'function' ? (opts.detectRecurring() || []) : []
  if (!fixed.length && !detected.length) return ''
  const out = ['## Subscriptions and recurring charges']
  fixed.forEach(fe => out.push(line(fe.desc || 'Subscription', `${money(monthlyEquivalent(fe))}/month (tracked as a fixed bill)`)))
  detected.slice(0, 6).forEach(d => out.push(line(d.desc, `about ${money(d.amount)} each month, seen in ${d.months?.length || 2} months (not yet tracked as a fixed bill)`)))
  const total = sum(fixed.map(monthlyEquivalent)) + sum(detected.map(d => d.amount))
  out.push(line('Total', `${money(total)}/month, ${money(total * 12)}/year`))
  return out.join('\n')
}

/**
 * Build the text the model receives as its view of the user's finances.
 * @param {object} state  the app state (window.state)
 * @param {object} opts   { view, monthKey, compact, insights, detectRecurring, goalCurrent }
 */
export function buildFinancialSnapshot(state, opts = {}) {
  if (!state || !state.months) return 'No financial data has been entered yet.'
  const key = opts.monthKey || (state.order || [])[(state.order || []).length - 1]
  const compact = !!opts.compact
  const name = state.settings?.userName
  const sections = [
    `# Financial snapshot${name ? ` for ${name}` : ''} — all figures computed by the app from the user's own records`,
    `Today: ${opts.today || new Date().toISOString().slice(0, 10)}. Months on record: ${(state.order || []).length}.`,
  ]
  if (opts.view === 'overview') {
    sections.push(trendSection(state, key, { compact }))
    sections.push(monthSection(state, key, { compact: true }))
  } else {
    sections.push(monthSection(state, key, { compact }))
    sections.push(trendSection(state, key, { compact }))
  }
  sections.push(positionSection(state, key, { compact, goalCurrent: opts.goalCurrent }))
  sections.push(subscriptionsSection(state, { detectRecurring: opts.detectRecurring }))
  const insights = (opts.insights || []).map(i => (typeof i === 'string' ? i : i.text)).filter(Boolean)
  if (insights.length) sections.push(['## Alerts the app has already flagged', ...insights.slice(0, 6).map(t => `- ${t}`)].join('\n'))
  return sections.filter(Boolean).join('\n\n')
}

export const _internals = { merchantKey, monthlyEquivalent, round }
