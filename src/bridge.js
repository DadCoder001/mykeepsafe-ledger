/**
 * bridge.js — Phase 13+: data layer bridge
 *
 * Overrides app.js window functions with bridge implementations that operate
 * directly on window.state (= app.js's `state`, same object reference).
 * Delegates persistence/render to app.js helpers still resident there.
 *
 * Load order: app.js (non-module) defines globals first → bridge.js (module,
 * imported by main.jsx) overrides select globals before any user interaction.
 */

import { fmt, esc } from './utils/format.js'
import { CURATED_MODELS, DEFAULT_MODEL } from './ai/models.js'

// ── TRANSACTION DELETES ───────────────────────────────────────

window.deleteExpense = function (monthKey, index) {
  const m = window.state?.months?.[monthKey]
  if (!m) return
  const exp = m.expenses[index]
  if (exp?.fixedId) {
    m.fixedExpenseIds = (m.fixedExpenseIds || []).filter(id => id !== exp.fixedId)
  }
  m.expenses.splice(index, 1)
  window.recalcBalance(monthKey)
  window.syncLinkedAccountForMonth?.(monthKey)
  window.saveData()
  window.render?.()
}

window.deleteTransfer = function (monthKey, index) {
  const m = window.state?.months?.[monthKey]
  if (!m?.transfers) return
  const tx = m.transfers[index]
  const fromId = tx?.fromAccountId || ''
  const toId = tx?.toAccountId || ''
  m.transfers.splice(index, 1)
  if (fromId) window.syncLinkedAccount?.(fromId)
  if (toId) window.syncLinkedAccount?.(toId)
  window.saveData()
  window.render?.()
}

// ── FIXED EXPENSES ────────────────────────────────────────────

window.deleteFixedExpense = function (id) {
  if (!confirm("This won't affect months where this expense was already applied. Remove this fixed expense template?")) return
  window.state.fixedExpenses = (window.state.fixedExpenses || []).filter(fe => fe.id !== id)
  window.saveData()
  window.render?.()
}

window.toggleFixedForMonth = function (feId, monthKey) {
  const s = window.state
  const fe = (s.fixedExpenses || []).find(f => f.id === feId)
  if (!fe) return
  const month = s.months?.[monthKey]
  if (!month) return
  if ((month.fixedExpenseIds || []).includes(feId)) {
    month.expenses = (month.expenses || []).filter(e => e.fixedId !== feId)
    month.fixedExpenseIds = (month.fixedExpenseIds || []).filter(id => id !== feId)
  } else {
    ;(month.expenses = month.expenses || []).push({
      amount: fe.amount, desc: fe.desc, cat: fe.cat,
      date: new Date().toISOString(), fixedId: fe.id, auto: true,
    })
    ;(month.fixedExpenseIds = month.fixedExpenseIds || []).push(fe.id)
  }
  window.recalcBalance(monthKey)
  window.saveData()
  window.render?.()
}

// ── NET WORTH ─────────────────────────────────────────────────

window.deleteAsset = function (id) {
  window.state.assets = (window.state.assets || []).filter(a => a.id !== id)
  window.saveData()
  window.render?.()
}

window.deleteLiability = function (id) {
  window.state.liabilities = (window.state.liabilities || []).filter(l => l.id !== id)
  window.saveData()
  window.render?.()
}

// ── ACCOUNTS ──────────────────────────────────────────────────

window.deleteAccount = function (id) {
  window.state.accounts = (window.state.accounts || []).filter(a => a.id !== id)
  window.saveData()
  window.render?.()
}

// ── GOALS ─────────────────────────────────────────────────────

window.deleteGoal = function (id) {
  window.state.goals = (window.state.goals || []).filter(g => g.id !== id)
  window.saveData()
  window.render?.()
}

window.setGoalMonthlyTarget = function (id, value) {
  const goal = (window.state.goals || []).find(g => g.id === id)
  if (!goal) return
  goal.monthlyTarget = parseFloat(value) || 0
  window.saveData()
  window.render?.()
}

// ── NOTIFICATIONS ─────────────────────────────────────────────
// Also kept in app.js for internal callers (checkBudgetNotifications, openNotificationPanel).
// These overrides ensure external callers (tests, data-action) get the same logic
// while operating consistently on window.state.

window.pushNotification = function (type, title, body) {
  const s = window.state
  if (!s) return
  if (!s.notifications) s.notifications = []
  const now = Date.now()
  const dup = s.notifications.find(n => n.type === type && n.title === title && (now - n.createdAt) < 86400000)
  if (dup) return
  s.notifications.unshift({ id: 'notif-' + now, type, title, body, createdAt: now, read: false })
  if (s.notifications.length > 50) s.notifications.splice(50)
  window.saveData()
  document.dispatchEvent(new CustomEvent('ks:notifications-render'))
}

window.markAllNotificationsRead = function () {
  ;(window.state?.notifications || []).forEach(n => { n.read = true })
  window.saveData()
  document.dispatchEvent(new CustomEvent('ks:notifications-render'))
}

window.clearNotification = function (id) {
  const s = window.state
  if (!s?.notifications) return
  const idx = s.notifications.findIndex(n => n.id === id)
  if (idx !== -1) s.notifications.splice(idx, 1)
  window.saveData()
  document.dispatchEvent(new CustomEvent('ks:notifications-render'))
}

// ── TRANSACTION FORM HANDLERS ─────────────────────────────────

window.addIncome = function () {
  const amount = parseFloat(document.getElementById('income-amount').value)
  const desc = (document.getElementById('income-desc').value || '').trim()
  const tags = window.parseTags(document.getElementById('income-tags').value)
  const accountId = document.getElementById('income-account')?.value || ''
  const incomeMember = document.getElementById('income-member')?.value || ''
  const monthKey = window.getActiveMonth?.()
  if (!amount || !monthKey) return
  const s = window.state
  if (!accountId && (s.accounts || []).length > 0) { window.showToast?.('Select an account for this transaction.'); return }
  s.months[monthKey].incomes.push({ amount, desc, date: new Date().toISOString(), tags, ...(accountId ? { accountId } : {}), ...(incomeMember ? { member: incomeMember } : {}) })
  window.updateKnownTags(tags)
  window.recalcBalance(monthKey)
  if (accountId) window.syncLinkedAccount?.(accountId); else window.syncLinkedAccountForMonth?.(monthKey)
  window.saveData()
  document.getElementById('income-amount').value = ''
  document.getElementById('income-desc').value = ''
  document.getElementById('income-tags').value = ''
  window.render?.()
}

window.addExpense = function () {
  const amount = parseFloat(document.getElementById('expense-amount').value)
  const desc = (document.getElementById('expense-desc').value || '').trim()
  const cat = (document.getElementById('expense-cat').value || '').trim()
  const tags = window.parseTags(document.getElementById('expense-tags').value)
  const accountId = document.getElementById('expense-account')?.value || ''
  const expenseMember = document.getElementById('expense-member')?.value || ''
  const monthKey = window.getActiveMonth?.()
  if (!amount || !monthKey || !cat) return
  const s = window.state
  if (!accountId && (s.accounts || []).length > 0) { window.showToast?.('Select an account for this transaction.'); return }
  s.months[monthKey].expenses.push({ amount, desc, cat, date: new Date().toISOString(), tags, ...(accountId ? { accountId } : {}), ...(expenseMember ? { member: expenseMember } : {}) })
  window.updateKnownTags(tags)
  window.recalcBalance(monthKey)
  if (accountId) window.syncLinkedAccount?.(accountId); else window.syncLinkedAccountForMonth?.(monthKey)
  window.saveData()
  window.checkBudgetNotifications?.(monthKey)
  document.getElementById('expense-amount').value = ''
  document.getElementById('expense-desc').value = ''
  document.getElementById('expense-cat').value = ''
  document.getElementById('expense-tags').value = ''
  window.render?.()
}

window.addTransfer = function () {
  const amount = parseFloat(document.getElementById('transfer-amount').value)
  const desc = (document.getElementById('transfer-desc').value || '').trim()
  const tags = window.parseTags(document.getElementById('transfer-tags').value)
  const fromAccountId = document.getElementById('transfer-from')?.value || ''
  const toAccountId = document.getElementById('transfer-to')?.value || ''
  const monthKey = window.getActiveMonth?.()
  if (!amount || !monthKey) return
  if (!fromAccountId || !toAccountId) { window.showToast?.('Select both From and To accounts.'); return }
  if (fromAccountId === toAccountId) { window.showToast?.('From and To accounts must be different.'); return }
  const s = window.state
  if (!s.months[monthKey].transfers) s.months[monthKey].transfers = []
  s.months[monthKey].transfers.push({ amount, desc, date: new Date().toISOString(), tags, fromAccountId, toAccountId })
  window.updateKnownTags(tags)
  window.syncLinkedAccount?.(fromAccountId)
  window.syncLinkedAccount?.(toAccountId)
  window.saveData()
  document.getElementById('transfer-amount').value = ''
  document.getElementById('transfer-desc').value = ''
  document.getElementById('transfer-tags').value = ''
  window.render?.()
}

// ── CATEGORY MANAGEMENT ───────────────────────────────────────

window.addCategory = function () {
  const input = document.getElementById('cat-input')
  const cat = (input?.value || '').trim()
  const s = window.state
  if (!cat || (s.categories || []).includes(cat)) return
  s.categories = s.categories || []
  s.categories.push(cat)
  s.categories.sort()
  window.saveData()
  if (input) input.value = ''
  window.render?.()
}

window.deleteCategory = function (cat) {
  const s = window.state
  const used = Object.values(s.months || {}).some(m => m.expenses.find(e => e.cat === cat))
  if (used) { alert(`Category '${cat}' is used in transactions. Remove those first.`); return }
  s.categories = (s.categories || []).filter(c => c !== cat)
  window.saveData()
  window.render?.()
}

// ── FIXED EXPENSE FORM ────────────────────────────────────────

window.addFixedExpense = function () {
  const amount = parseFloat(document.getElementById('fe-amount').value)
  const desc = (document.getElementById('fe-desc').value || '').trim()
  const cat = (document.getElementById('fe-cat').value || '').trim()
  if (!amount || !desc || !cat) return
  const id = 'fixed-' + Date.now()
  const s = window.state
  s.fixedExpenses = s.fixedExpenses || []
  s.fixedExpenses.push({ id, amount, desc, cat, frequency: document.getElementById('fe-frequency').value || 'monthly' })
  s.order.forEach(k => window.applyFixedExpenses?.(k))
  window.saveData()
  document.getElementById('fe-amount').value = ''
  document.getElementById('fe-desc').value = ''
  document.getElementById('fe-cat').value = ''
  if (document.getElementById('fe-frequency')) document.getElementById('fe-frequency').value = 'monthly'
  window.render?.()
}

// ── BUDGET ────────────────────────────────────────────────────

window.setBudget = function () {
  const monthKey = window.getActiveMonth?.()
  if (!monthKey) return
  const budget = parseFloat(document.getElementById('budget-input').value) || 0
  const s = window.state
  s.months[monthKey].budget = budget
  if (s.settings.budgetCarryForward) window.recalcCarryForward?.()
  window.saveData()
  window.render?.()
}

window.setSavingsGoal = function () {
  const monthKey = window.getActiveMonth?.()
  if (!monthKey) return
  const goal = parseFloat(document.getElementById('savings-goal-input').value) || 0
  window.state.months[monthKey].savingsGoal = goal
  window.saveData()
  window.render?.()
}

// ── MONTH MANAGEMENT ──────────────────────────────────────────

window.loadMonth = function () {
  const val = document.getElementById('month-input').value
  if (!val) return
  window.createMonth?.(val)
  window.setActiveMonth?.(val)
  window.render?.()
}

// ── NET WORTH FORMS ───────────────────────────────────────────

window.addAsset = function () {
  const name = (document.getElementById('asset-name').value || '').trim()
  const value = parseFloat(document.getElementById('asset-value').value) || 0
  const category = document.getElementById('asset-category').value
  if (!name || value <= 0) return
  window.state.assets = window.state.assets || []
  window.state.assets.push({ id: 'asset-' + Date.now(), name, value, category, date: new Date().toISOString() })
  document.getElementById('asset-name').value = ''
  document.getElementById('asset-value').value = ''
  window.saveData()
  window.render?.()
}

window.addLiability = function () {
  const name = (document.getElementById('liability-name').value || '').trim()
  const value = parseFloat(document.getElementById('liability-value').value) || 0
  const category = document.getElementById('liability-category').value
  const interestRate = parseFloat(document.getElementById('liability-rate').value) || 0
  const minimumPayment = parseFloat(document.getElementById('liability-minpay').value) || 0
  if (!name || value <= 0) return
  window.state.liabilities = window.state.liabilities || []
  window.state.liabilities.push({ id: 'liability-' + Date.now(), name, value, category, interestRate, minimumPayment, date: new Date().toISOString() })
  document.getElementById('liability-name').value = ''
  document.getElementById('liability-value').value = ''
  document.getElementById('liability-rate').value = ''
  document.getElementById('liability-minpay').value = ''
  window.saveData()
  window.render?.()
}

// ── ACCOUNT FORM ──────────────────────────────────────────────

window.addAccount = function () {
  const name = (document.getElementById('acct-name').value || '').trim()
  const balance = parseFloat(document.getElementById('acct-balance').value) || 0
  const prevBalance = parseFloat(document.getElementById('acct-prev-balance').value)
  const type = document.getElementById('acct-type').value
  if (!name || balance <= 0) return
  window.state.accounts = window.state.accounts || []
  window.state.accounts.push({ id: 'acct-' + Date.now(), name, type, balance, prevBalance: isNaN(prevBalance) ? balance : prevBalance })
  document.getElementById('acct-name').value = ''
  document.getElementById('acct-balance').value = ''
  document.getElementById('acct-prev-balance').value = ''
  window.saveData()
  window.render?.()
}

// ── GOAL FORM ─────────────────────────────────────────────────

window.addGoal = function () {
  const name = (document.getElementById('goal-name').value || '').trim()
  const targetAmount = parseFloat(document.getElementById('goal-target').value) || 0
  const linkedAccountId = document.getElementById('goal-link-account').value
  if (!name || targetAmount <= 0) return
  window.state.goals = window.state.goals || []
  window.state.goals.push({ id: 'goal-' + Date.now(), name, targetAmount, currentAmount: 0, linkedAccountId, monthlyTarget: 0 })
  document.getElementById('goal-name').value = ''
  document.getElementById('goal-target').value = ''
  document.getElementById('goal-link-account').value = ''
  window.saveData()
  window.render?.()
}

// ── BALANCE RECALC ────────────────────────────────────────────

window.recalcBalance = function (monthKey) {
  const m = window.state?.months?.[monthKey]
  if (!m) return
  const income = (m.incomes || []).reduce((s, t) => s + t.amount, 0)
  const expense = (m.expenses || []).reduce((s, t) => s + t.amount, 0)
  m.balance = income - expense
}

// ── PURE UTILITIES ────────────────────────────────────────────

function parseTags(str) {
  return (str || '').split(',').map(t => t.trim()).filter(Boolean)
}
window.parseTags = parseTags

window.updateKnownTags = function (tags) {
  const s = window.state
  if (!s?.knownTags) return
  tags.forEach(t => { if (!s.knownTags.includes(t)) s.knownTags.push(t) })
  s.knownTags.sort()
}

window.recalcCarryForward = function () {
  const s = window.state
  if (!s.settings.budgetCarryForward) return
  for (let i = 0; i < s.order.length; i++) {
    const k = s.order[i]
    const m = s.months[k]
    if (i === 0) {
      m.carryForward = 0
    } else {
      const prev = s.months[s.order[i - 1]]
      const prevExpense = (prev.expenses || []).reduce((a, t) => a + t.amount, 0)
      const prevEffective = prev.budget + (prev.carryForward || 0)
      m.carryForward = Math.max(0, prevEffective - prevExpense)
    }
  }
}

// ── ACCOUNT SYNC ──────────────────────────────────────────────

window.syncLinkedAccount = function (accountId) {
  const s = window.state
  const acct = (s.accounts || []).find(a => a.id === accountId)
  if (!acct) return
  if (acct.baseBalance === undefined) acct.baseBalance = acct.balance
  let income = 0, expenses = 0, transfersOut = 0, transfersIn = 0
  Object.values(s.months || {}).forEach(m => {
    ;(m.incomes || []).forEach(t => { if (t.accountId === accountId) income += t.amount })
    ;(m.expenses || []).forEach(t => { if (t.accountId === accountId) expenses += t.amount })
    ;(m.transfers || []).forEach(t => {
      if (t.fromAccountId === accountId) transfersOut += t.amount
      if (t.toAccountId === accountId) transfersIn += t.amount
    })
  })
  acct.balance = Math.round((acct.baseBalance + income - expenses - transfersOut + transfersIn) * 100) / 100
}

window.syncLinkedAccountForMonth = function (monthKey) {
  const s = window.state
  const m = s.months?.[monthKey]
  if (!m) return
  const ids = new Set()
  ;(m.incomes || []).forEach(t => { if (t.accountId) ids.add(t.accountId) })
  ;(m.expenses || []).forEach(t => { if (t.accountId) ids.add(t.accountId) })
  ;(m.transfers || []).forEach(t => {
    if (t.fromAccountId) ids.add(t.fromAccountId)
    if (t.toAccountId) ids.add(t.toAccountId)
  })
  if (m.linkedAccountId) ids.add(m.linkedAccountId)
  ids.forEach(id => window.syncLinkedAccount(id))
}

// ── MONTH CREATION ────────────────────────────────────────────

window.applyFixedExpenses = function (monthKey) {
  const s = window.state
  const month = s.months[monthKey]
  if (!month) return
  ;(s.fixedExpenses || []).forEach(fe => {
    if ((month.fixedExpenseIds || []).includes(fe.id)) return
    const freq = fe.frequency || 'monthly'
    const monthNum = parseInt(monthKey.split('-')[1], 10)
    let applies = true, amt = fe.amount
    if (freq === 'quarterly') { applies = (monthNum % 3 === 1) }
    else if (freq === 'annual') { applies = (monthNum === 1) }
    else if (freq === 'biweekly') { amt = Math.round(fe.amount * 26 / 12 * 100) / 100 }
    if (!applies) return
    ;(month.expenses = month.expenses || []).push({ amount: amt, desc: fe.desc, cat: fe.cat, date: new Date().toISOString(), fixedId: fe.id, auto: true })
    ;(month.fixedExpenseIds = month.fixedExpenseIds || []).push(fe.id)
  })
}

window.createMonth = function (key) {
  const s = window.state
  if (s.months[key]) return
  s.months[key] = { incomes: [], expenses: [], transfers: [], budget: 0, balance: 0, fixedExpenseIds: [], savingsGoal: s.settings?.defaultSavingsGoal || 0, linkedAccountId: '', categoryBudgets: {} }
  if (!s.order.includes(key)) { s.order.push(key); s.order.sort() }
  window.recordNetWorthSnapshot?.()
  window.applyFixedExpenses(key)
  window.saveData()
}

// ── SLIDE PANEL ───────────────────────────────────────────────

let tspContext = null
let _tspSplitsActive = false

function _catOptions(selected) {
  const cats = window.state?.categories || []
  return cats.map(c => `<option value="${c}"${c === selected ? ' selected' : ''}>${c}</option>`).join('')
}

function _renderTspSplits(splits) {
  const container = document.getElementById('tsp-splits-container')
  if (!container) return
  container.innerHTML = (splits || [{ amount: '', cat: '' }, { amount: '', cat: '' }]).map((s, i) => `
    <div class="tsp-split-row" data-idx="${i}" style="display:flex;gap:0.4rem;align-items:center;margin-bottom:0.3rem">
      <input type="number" min="0" step="0.01" placeholder="Amount" value="${s.amount || ''}" class="tsp-input tsp-split-amt" style="width:90px;flex-shrink:0" oninput="window._updateTspSplitHint()"/>
      <select class="tsp-input tsp-split-cat" style="flex:1">${_catOptions(s.cat)}</select>
      <button type="button" style="flex-shrink:0;padding:0.2rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface2);cursor:pointer;color:var(--ink3)" onclick="window.removeTspSplitRow(${i})">×</button>
    </div>`).join('')
  window._updateTspSplitHint()
}

function _readTspSplits() {
  const rows = document.querySelectorAll('#tsp-splits-container .tsp-split-row')
  const splits = []
  rows.forEach(row => {
    const amt = parseFloat(row.querySelector('.tsp-split-amt')?.value)
    const cat = row.querySelector('.tsp-split-cat')?.value || 'Other'
    if (amt > 0) splits.push({ amount: amt, cat })
  })
  return splits
}

window._updateTspSplitHint = function () {
  const total = _readTspSplits().reduce((s, r) => s + r.amount, 0)
  const parentAmt = parseFloat(document.getElementById('tsp-amount')?.value) || 0
  const hint = document.getElementById('tsp-split-total-hint')
  if (!hint) return
  const diff = Math.abs(total - parentAmt)
  hint.textContent = parentAmt > 0 ? `Total: $${total.toFixed(2)} of $${parentAmt.toFixed(2)}` : `Total: $${total.toFixed(2)}`
  hint.style.color = diff < 0.01 ? 'var(--pos)' : 'var(--neg)'
}

window.toggleTspSplit = function () {
  _tspSplitsActive = !_tspSplitsActive
  const section = document.getElementById('tsp-split-section')
  const catSel = document.getElementById('tsp-cat')
  if (_tspSplitsActive) {
    if (section) section.style.display = 'block'
    _renderTspSplits(null)
    if (catSel) catSel.setAttribute('disabled', 'true')
  } else {
    if (section) section.style.display = 'none'
    if (catSel) catSel.removeAttribute('disabled')
  }
}

window.addTspSplitRow = function () {
  const existing = _readTspSplits()
  _renderTspSplits([...existing, { amount: '', cat: '' }])
}

window.removeTspSplitRow = function (idx) {
  const existing = _readTspSplits()
  existing.splice(idx, 1)
  _renderTspSplits(existing.length ? existing : [{ amount: '', cat: '' }])
}

window.openTxPanel = function (monthKey, type, index) {
  const s = window.state
  const m = s.months?.[monthKey]
  if (!m) return
  const tx = type === 'income' ? m.incomes[index] : type === 'transfer' ? (m.transfers || [])[index] : m.expenses[index]
  if (!tx) return
  tspContext = { monthKey, type, index, _origAccountId: tx.accountId || '', _origFromId: tx.fromAccountId || '', _origToId: tx.toAccountId || '' }

  document.getElementById('tsp-title').textContent = type === 'income' ? 'Income' : type === 'transfer' ? 'Transfer' : 'Expense'
  document.getElementById('tsp-desc').value = tx.desc || ''
  document.getElementById('tsp-amount').value = tx.amount || ''
  document.getElementById('tsp-date').value = tx.date ? tx.date.slice(0, 10) : ''
  document.getElementById('tsp-tags').value = (tx.tags || []).join(' ')

  window.setTspType(type, false)

  const catField = document.getElementById('tsp-cat-field')
  const catSel = document.getElementById('tsp-cat')
  const splitSection = document.getElementById('tsp-split-section')
  if (type === 'expense') {
    if (catField) catField.style.display = 'flex'
    if (catSel) catSel.innerHTML = (s.categories || []).map(c => `<option value="${c}"${c === tx.cat ? ' selected' : ''}>${c}</option>`).join('')
    // Populate splits if they exist
    if (splitSection) {
      if (tx.splits?.length) {
        _tspSplitsActive = true
        splitSection.style.display = 'block'
        if (catField) catField.querySelector('select')?.setAttribute('disabled', 'true')
        _renderTspSplits(tx.splits)
      } else {
        _tspSplitsActive = false
        splitSection.style.display = 'none'
        if (catField) catField.querySelector('select')?.removeAttribute('disabled')
      }
    }
  } else {
    if (catField) catField.style.display = 'none'
    if (splitSection) splitSection.style.display = 'none'
    _tspSplitsActive = false
  }

  const monthSel = document.getElementById('tsp-month')
  if (monthSel) monthSel.innerHTML = (s.order || []).map(k => `<option value="${k}"${k === monthKey ? ' selected' : ''}>${k}</option>`).join('')

  const accounts = s.accounts || []
  const acctSel = document.getElementById('tsp-account')
  if (acctSel) acctSel.innerHTML = '<option value="">— No account —</option>' + accounts.map(a => `<option value="${a.id}"${a.id === tx.accountId ? ' selected' : ''}>${a.name}</option>`).join('')
  const fromSel = document.getElementById('tsp-from-account')
  const toSel = document.getElementById('tsp-to-account')
  if (fromSel) fromSel.innerHTML = accounts.map(a => `<option value="${a.id}"${a.id === tx.fromAccountId ? ' selected' : ''}>${a.name}</option>`).join('')
  if (toSel) toSel.innerHTML = accounts.map(a => `<option value="${a.id}"${a.id === tx.toAccountId ? ' selected' : ''}>${a.name}</option>`).join('')

  document.getElementById('tx-slide-overlay')?.classList.add('open')
  setTimeout(() => document.getElementById('tsp-desc')?.focus(), 220)
}

window.closeTxPanel = function () {
  document.getElementById('tx-slide-overlay')?.classList.remove('open')
  tspContext = null
}

window.setTspType = function (type, updateContext = true) {
  document.getElementById('tsp-type-inc').className = 'tsp-type-btn' + (type === 'income' ? ' active-inc' : '')
  document.getElementById('tsp-type-exp').className = 'tsp-type-btn' + (type === 'expense' ? ' active-exp' : '')
  const xfrBtn = document.getElementById('tsp-type-xfr')
  if (xfrBtn) xfrBtn.className = 'tsp-type-btn' + (type === 'transfer' ? ' active-xfr' : '')
  const catField = document.getElementById('tsp-cat-field')
  if (catField) catField.style.display = type === 'expense' ? 'flex' : 'none'
  const splitSection = document.getElementById('tsp-split-section')
  if (splitSection && type !== 'expense') { splitSection.style.display = 'none'; _tspSplitsActive = false }
  const acctField = document.getElementById('tsp-account-field')
  if (acctField) acctField.style.display = type === 'transfer' ? 'none' : 'flex'
  const fromField = document.getElementById('tsp-from-field')
  const toField = document.getElementById('tsp-to-field')
  if (fromField) fromField.style.display = type === 'transfer' ? 'flex' : 'none'
  if (toField) toField.style.display = type === 'transfer' ? 'flex' : 'none'
  if (updateContext && tspContext) tspContext.type = type
}

window.saveTxPanel = function () {
  if (!tspContext) return
  const { monthKey: origMonth, type: origType, index } = tspContext
  const newMonth = document.getElementById('tsp-month').value || origMonth
  const isXfr = document.getElementById('tsp-type-xfr')?.classList.contains('active-xfr')
  const isInc = document.getElementById('tsp-type-inc').classList.contains('active-inc')
  const newType = isXfr ? 'transfer' : isInc ? 'income' : 'expense'
  const amount = parseFloat(document.getElementById('tsp-amount').value)
  const desc = (document.getElementById('tsp-desc').value || '').trim()
  const dateVal = document.getElementById('tsp-date').value
  const cat = document.getElementById('tsp-cat').value || 'Other'
  const tags = parseTags(document.getElementById('tsp-tags').value)

  if (!amount || isNaN(amount) || amount <= 0) { window.showToast?.('Please enter a valid amount.'); return }

  const newAccountId = document.getElementById('tsp-account')?.value || ''
  const oldAccountId = tspContext._origAccountId || ''
  const newFromId = document.getElementById('tsp-from-account')?.value || ''
  const newToId = document.getElementById('tsp-to-account')?.value || ''
  const oldFromId = tspContext._origFromId || ''
  const oldToId = tspContext._origToId || ''

  const s = window.state
  const origM = s.months[origMonth]
  if (origType === 'transfer') {
    origM.transfers = origM.transfers || []
    origM.transfers.splice(index, 1)
  } else {
    ;(origType === 'income' ? origM.incomes : origM.expenses).splice(index, 1)
  }

  if (!s.months[newMonth]) window.createMonth(newMonth)
  const newM = s.months[newMonth]
  const isoDate = dateVal ? new Date(dateVal).toISOString() : new Date().toISOString()
  if (newType === 'transfer') {
    if (!newFromId || !newToId || newFromId === newToId) { window.showToast?.('Select two different accounts for transfer.'); return }
    ;(newM.transfers = newM.transfers || []).push({ amount, desc, date: isoDate, tags, fromAccountId: newFromId, toAccountId: newToId })
  } else if (newType === 'income') {
    newM.incomes.push({ amount, desc, date: isoDate, tags, ...(newAccountId ? { accountId: newAccountId } : {}) })
  } else {
    const splits = _tspSplitsActive ? _readTspSplits() : null
    const effectiveCat = (splits?.length > 1) ? 'Multiple' : (splits?.length === 1 ? splits[0].cat : cat)
    const expObj = { amount, desc, cat: effectiveCat, date: isoDate, tags, ...(newAccountId ? { accountId: newAccountId } : {}) }
    if (splits?.length > 1) expObj.splits = splits
    newM.expenses.push(expObj)
  }

  window.updateKnownTags(tags)
  const monthsToRecalc = new Set()
  if (origType !== 'transfer') monthsToRecalc.add(origMonth)
  if (newType !== 'transfer') monthsToRecalc.add(newMonth)
  monthsToRecalc.forEach(mk => window.recalcBalance(mk))
  const toSync = new Set([oldAccountId, newAccountId, oldFromId, oldToId, newFromId, newToId].filter(Boolean))
  if (toSync.size > 0) toSync.forEach(id => window.syncLinkedAccount(id))
  else { window.syncLinkedAccountForMonth(origMonth); if (newMonth !== origMonth) window.syncLinkedAccountForMonth(newMonth) }
  window.saveData()
  window.render?.()
  window.closeTxPanel()
  window.showToast?.('Transaction saved')
}

window.deleteTxFromPanel = function () {
  if (!tspContext) return
  const { monthKey, type, index } = tspContext
  const m = window.state.months[monthKey]
  if (type === 'transfer') {
    const tx = (m.transfers || [])[index]
    m.transfers.splice(index, 1)
    if (tx?.fromAccountId) window.syncLinkedAccount(tx.fromAccountId)
    if (tx?.toAccountId) window.syncLinkedAccount(tx.toAccountId)
  } else {
    const arr = type === 'income' ? m.incomes : m.expenses
    const tx = arr[index]
    arr.splice(index, 1)
    window.recalcBalance(monthKey)
    if (tx?.accountId) window.syncLinkedAccount(tx.accountId); else window.syncLinkedAccountForMonth(monthKey)
  }
  window.saveData()
  window.render?.()
  window.closeTxPanel()
  window.showToast?.('Transaction deleted')
}

// ── CATEGORY BUDGETS ──────────────────────────────────────────

window.setCategoryBudget = function (monthKey, cat, amount) {
  const m = window.state?.months?.[monthKey]
  if (!m) return
  if (!m.categoryBudgets) m.categoryBudgets = {}
  m.categoryBudgets[cat] = parseFloat(amount) || 0
  window.saveData()
  window.render?.()
}

// ── BUDGET CARRY-FORWARD ──────────────────────────────────────

window.toggleCarryForward = function () {
  const s = window.state
  s.settings.budgetCarryForward = !s.settings.budgetCarryForward
  if (s.settings.budgetCarryForward) window.recalcCarryForward()
  window.saveData()
  window.render?.()
}

// ── MONTH ACCOUNT LINKING ─────────────────────────────────────

window.setMonthLinkedAccount = function (accountId) {
  const monthKey = window.getActiveMonth?.()
  if (!monthKey || !window.state.months[monthKey]) return
  const prev = window.state.months[monthKey].linkedAccountId
  window.state.months[monthKey].linkedAccountId = accountId || ''
  if (prev) window.syncLinkedAccount(prev)
  if (accountId) window.syncLinkedAccount(accountId)
  window.saveData()
  window.renderSidebar?.()
}

// ── FIXED EXPENSE EDIT UI ─────────────────────────────────────

window.editFixedExpense = function (id) {
  const s = window.state
  const fe = (s.fixedExpenses || []).find(f => f.id === id)
  if (!fe) return
  const row = document.getElementById('fe-row-' + id)
  if (!row) return
  const monthPills = (s.order || []).map(k => {
    const active = s.months[k]?.fixedExpenseIds?.includes(id)
    const label = new Date(k + '-15').toLocaleString('default', { month: 'short', year: '2-digit' })
    return `<span class="fe-month-pill${active ? ' active' : ''}" onclick="toggleFixedForMonth('${id}','${k}')">${label}</span>`
  }).join('')
  row.innerHTML = `
    <td><input class="fe-edit-input" id="fe-edit-desc-${id}" value="${fe.desc}" /></td>
    <td><input class="fe-edit-input" id="fe-edit-cat-${id}" value="${fe.cat}" /></td>
    <td><input class="fe-edit-input fe-edit-amount" id="fe-edit-amt-${id}" type="number" value="${fe.amount}" /></td>
    <td><select class="fe-edit-input" id="fe-edit-freq-${id}">
      <option value="monthly"${fe.frequency === 'monthly' ? ' selected' : ''}>Monthly</option>
      <option value="biweekly"${fe.frequency === 'biweekly' ? ' selected' : ''}>Bi-weekly</option>
      <option value="quarterly"${fe.frequency === 'quarterly' ? ' selected' : ''}>Quarterly</option>
      <option value="annual"${fe.frequency === 'annual' ? ' selected' : ''}>Annual</option>
    </select></td>
    <td><div class="fe-month-pills">${monthPills}</div></td>
    <td class="fe-actions">
      <button onclick="saveFixedExpense('${id}')">Save</button>
      <button onclick="render()">Cancel</button>
    </td>
  `
  document.getElementById('fe-edit-desc-' + id)?.focus()
}

window.saveFixedExpense = function (id) {
  const s = window.state
  const fe = (s.fixedExpenses || []).find(f => f.id === id)
  if (!fe) return
  const newDesc = (document.getElementById('fe-edit-desc-' + id)?.value || '').trim()
  const newCat = (document.getElementById('fe-edit-cat-' + id)?.value || '').trim()
  const newAmt = parseFloat(document.getElementById('fe-edit-amt-' + id)?.value)
  const newFreq = document.getElementById('fe-edit-freq-' + id)?.value || 'monthly'
  if (!newDesc || !newCat || !newAmt) { alert('All fields are required.'); return }
  fe.desc = newDesc; fe.cat = newCat; fe.amount = newAmt; fe.frequency = newFreq
  ;(s.order || []).forEach(k => {
    const m = s.months[k]
    if (!(m.fixedExpenseIds || []).includes(id)) return
    ;(m.expenses || []).forEach(exp => {
      if (exp.fixedId === id) { exp.amount = newAmt; exp.desc = newDesc; exp.cat = newCat }
    })
    window.recalcBalance(k)
  })
  window.saveData()
  window.render?.()
}

// ── LLAMACPP MODEL MANAGEMENT (desktop app) ──────────────────

window.loadLlamaCppModel = async function () {
  if (typeof window.__TAURI__ === 'undefined') { window.showToast?.('The built-in model is only available in the desktop app'); return }
  const modelId = window.state?.settings?.aiModel || DEFAULT_MODEL.id
  const modelDef = CURATED_MODELS.find(m => m.id === modelId) || DEFAULT_MODEL

  const progressDiv = document.getElementById('webllm-progress')
  const progressFill = document.getElementById('webllm-progress-fill')
  const progressText = document.getElementById('webllm-progress-text')
  if (progressDiv) progressDiv.style.display = 'block'
  if (progressText) progressText.textContent = 'Checking for model…'

  const { appDataDir, join } = window.__TAURI__.path
  const modelPath = await join(await appDataDir(), 'models', modelDef.filename)

  // download_model writes a .meta marker only after a complete download.
  let downloaded = true
  try { await window.tauriInvoke?.('read_text_file', { path: modelPath + '.meta' }) } catch { downloaded = false }

  if (!downloaded) {
    if (progressText) progressText.textContent = `Downloading ${modelDef.name}…`
    const { listen } = window.__TAURI__.event
    const unlisten = await listen('model-download-progress', (evt) => {
      const { downloaded_bytes, total_bytes } = evt.payload
      const pct = total_bytes > 0 ? Math.round((downloaded_bytes / total_bytes) * 100) : 0
      if (progressFill) progressFill.style.width = pct + '%'
      if (progressText) {
        const mb = Math.round(downloaded_bytes / 1024 / 1024)
        const total = Math.round(total_bytes / 1024 / 1024)
        progressText.textContent = `Downloading… ${mb} MB / ${total} MB (${pct}%)`
      }
    })
    try {
      await window.tauriInvoke?.('download_model', { url: modelDef.url, destPath: modelPath })
    } catch (e) {
      if (progressText) progressText.textContent = 'Download failed: ' + e
      return
    } finally {
      unlisten()
    }
  }

  if (progressText) progressText.textContent = 'Loading model into memory…'
  try {
    await window.tauriInvoke?.('load_model', { modelPath })
    if (progressText) progressText.textContent = `${modelDef.name} is ready`
    setTimeout(() => { if (progressDiv) progressDiv.style.display = 'none' }, 2000)
    window.showToast?.('AI model loaded')
  } catch (e) {
    if (progressText) progressText.textContent = 'Load failed: ' + e
  }
}

// ── AI SIDE PANEL ────────────────────────────────────────────

window.renderFloatingAI = function () {
  const floatEl = document.getElementById('ai-float')
  if (floatEl) floatEl.style.display = 'none'
  window.renderAIPanel?.()
}

window.renderAIPanel = function () {
  const panel = document.getElementById('ai-side-panel')
  if (!panel) return
  const s = window.state
  const show = !!(s && s.settings && s.settings.aiEnabled)
  panel.style.display = show ? 'flex' : 'none'
  const panelOpen = window.getAIPanelOpen?.() ?? true
  if (!show || !panelOpen) return
  const privacyEl = panel.querySelector('.asp-privacy')
  const p = window.describeAIProvider?.()
  if (privacyEl) privacyEl.textContent = `🔒 On this computer${p ? ' · ' + p.label : ''}`
  const av = window.getActiveView?.() ?? 'month'
  const prompts = window.getAIQuickPrompts?.(av) || []
  const quickDiv = document.getElementById('asp-quick')
  if (quickDiv) {
    quickDiv.innerHTML = '<div class="asp-quick-label">Try asking</div>' +
      prompts.slice(0, 4).map(q =>
        `<button class="asp-chip" data-action="askAIPanel('${q.replace(/'/g, "\\'")}')">${esc(q)}</button>`
      ).join('')
  }
  window.renderAIThreads?.()
}

// ── MEMBER FILTER / HOUSEHOLD ────────────────────────────────

let activeMemberFilter = null

window.renderMemberFilter = function () {
  const row = document.getElementById('member-filter-row')
  if (!row) return
  const members = window.state?.settings?.householdMembers || []
  if (!members.length) { row.style.display = 'none'; return }
  row.style.display = 'flex'
  row.innerHTML = `
    <span class="member-filter-label">Filter by member:</span>
    <select class="member-filter-select" id="member-filter-select" onchange="setMemberFilter(this.value)">
      <option value="">All members</option>
      ${members.map(m => `<option value="${esc(m)}" ${activeMemberFilter === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
    </select>
  `
  const memberOpts = `<option value="">— All members —</option>` + members.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')
  const incSel = document.getElementById('income-member')
  const expSel = document.getElementById('expense-member')
  if (incSel) { incSel.innerHTML = memberOpts; incSel.style.display = 'block' }
  if (expSel) { expSel.innerHTML = memberOpts; expSel.style.display = 'block' }
}

window.setMemberFilter = function (member) {
  activeMemberFilter = member || null
  window.activeMemberFilter = activeMemberFilter
  const am = window.getActiveMonth?.()
  document.dispatchEvent(new CustomEvent('ks:month-render', { detail: { monthKey: am } }))
}

window.addHouseholdMember = function (name) {
  const n = (name || '').trim()
  if (!n) return
  const s = window.state
  if (!s.settings.householdMembers) s.settings.householdMembers = []
  if (!s.settings.householdMembers.includes(n)) {
    s.settings.householdMembers.push(n)
    window.saveData()
    window.renderHouseholdSection?.()
    window.renderMemberFilter()
  }
}

window.removeHouseholdMember = function (name) {
  const s = window.state
  if (!s.settings.householdMembers) return
  s.settings.householdMembers = s.settings.householdMembers.filter(m => m !== name)
  if (activeMemberFilter === name) { activeMemberFilter = null; window.activeMemberFilter = null }
  window.saveData()
  window.renderHouseholdSection?.()
  window.renderMemberFilter()
  const am = window.getActiveMonth?.()
  document.dispatchEvent(new CustomEvent('ks:month-render', { detail: { monthKey: am } }))
}

window.renderHouseholdSection = function () {
  const body = document.getElementById('household-members-body')
  if (!body) return
  const members = window.state?.settings?.householdMembers || []
  body.innerHTML = `
    <p style="font-size:12.5px;color:var(--ink2);margin-bottom:0.5rem;">Add household members to tag transactions and filter by person.</p>
    ${members.length ? `<div id="household-member-list">${members.map(m => `
      <div class="household-member-row">
        <span class="household-member-name">${esc(m)}</span>
        <button class="household-member-remove" onclick="removeHouseholdMember(${JSON.stringify(m)})" title="Remove">×</button>
      </div>
    `).join('')}</div>` : '<div style="font-size:12px;color:var(--ink3);margin-bottom:0.5rem;">No members added yet.</div>'}
    <div class="household-add-row">
      <input id="household-member-input" type="text" placeholder="Member name (e.g. Alex)" />
      <button onclick="addHouseholdMember(document.getElementById('household-member-input').value);document.getElementById('household-member-input').value=''">+ Add</button>
    </div>
    <div class="couples-callout">💡 Share your MyKeepSafe Ledger JSON file via OneDrive, Dropbox, or a shared folder to sync with your partner.</div>
  `
}

// ── DASHBOARD HELPERS ─────────────────────────────────────────

window.getTimeGreeting = function () {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

window.saveUserName = function () {
  const name = document.getElementById('dash-name-input').value.trim()
  window.state.settings.userName = name
  window.saveData()
  window.render?.()
}

function getGoalMonthlyRate (goal) {
  if (!goal.linkedAccountId) return 0
  const s = window.state
  const linkedMonths = s.order.filter(k => s.months[k]?.linkedAccountId === goal.linkedAccountId)
  const recent = linkedMonths.slice(-3)
  if (!recent.length) return 0
  const total = recent.reduce((acc, k) => {
    const m = s.months[k]
    return acc + m.incomes.reduce((a, t) => a + t.amount, 0) - m.expenses.reduce((a, t) => a + t.amount, 0)
  }, 0)
  return total / recent.length
}
window.getGoalMonthlyRate = getGoalMonthlyRate

function getGoalCurrent (goal) {
  const s = window.state
  if (!goal.linkedAccountId) return goal.currentAmount || 0
  const acct = (s.accounts || []).find(a => a.id === goal.linkedAccountId)
  if (!acct) return goal.currentAmount || 0
  const linkedGoals = (s.goals || [])
    .filter(g => g.linkedAccountId === goal.linkedAccountId)
    .sort((a, b) => a.id.localeCompare(b.id))
  let remaining = acct.balance
  for (const g of linkedGoals) {
    const allocated = Math.max(0, Math.min(g.targetAmount, remaining))
    if (g.id === goal.id) return allocated
    remaining = Math.max(0, remaining - g.targetAmount)
  }
  return 0
}
window.getGoalCurrent = getGoalCurrent

function getGoalProjection (goal) {
  const current = getGoalCurrent(goal)
  const remaining = goal.targetAmount - current
  if (remaining <= 0) return null
  const monthlyRate = goal.monthlyTarget > 0 ? goal.monthlyTarget : getGoalMonthlyRate(goal)
  if (monthlyRate <= 0) return null
  const monthsNeeded = Math.ceil(remaining / monthlyRate)
  const d = new Date()
  d.setMonth(d.getMonth() + monthsNeeded)
  return { monthsNeeded, label: d.toLocaleString('default', { month: 'short', year: 'numeric' }) }
}
window.getGoalProjection = getGoalProjection

function calcDashStats () {
  const s = window.state
  const accounts = s.accounts || []
  const cashAccts = accounts.filter(a => a.type === 'cash')
  const investedAccts = accounts.filter(a => a.type !== 'cash')
  const cash = cashAccts.reduce((a, x) => a + x.balance, 0)
    + (s.assets || []).filter(a => a.category === 'cash').reduce((a, x) => a + x.value, 0)
  const invested = investedAccts.reduce((a, x) => a + x.balance, 0)
    + (s.assets || []).filter(a => a.category !== 'cash').reduce((a, x) => a + x.value, 0)
  const totalLiabilities = (s.liabilities || []).reduce((a, l) => a + l.value, 0)
  const prevCash = cashAccts.reduce((a, x) => a + (x.prevBalance || x.balance), 0)
    + (s.assets || []).filter(a => a.category === 'cash').reduce((a, x) => a + x.value, 0)
  const prevInvested = investedAccts.reduce((a, x) => a + (x.prevBalance || x.balance), 0)
    + (s.assets || []).filter(a => a.category !== 'cash').reduce((a, x) => a + x.value, 0)
  return { cash, invested, totalLiabilities, prevCash, prevInvested }
}
window.calcDashStats = calcDashStats

function fmtPctChange (current, prev) {
  if (!prev || prev === current) return { text: '—', cls: 'neu' }
  const pct = ((current - prev) / Math.abs(prev) * 100).toFixed(1)
  const up = current >= prev
  return { text: `${up ? '↗' : '↘'} ${Math.abs(pct)}% this month`, cls: up ? 'up' : 'down' }
}
window.fmtPctChange = fmtPctChange

window.renderDashStats = function () {
  const { cash, invested, totalLiabilities, prevCash, prevInvested } = calcDashStats()
  const cashChange = fmtPctChange(cash, prevCash)
  const invChange = fmtPctChange(invested, prevInvested)
  const container = document.getElementById('dash-stat-cards')
  if (!container) return
  container.innerHTML = `
    <div class="dash-stat-card">
      <div class="dash-stat-label">Cash</div>
      <div class="dash-stat-value">${fmt(cash)}</div>
      <div class="dash-stat-change ${cashChange.cls}">${cashChange.text}</div>
    </div>
    <div class="dash-stat-card">
      <div class="dash-stat-label">Invested</div>
      <div class="dash-stat-value">${fmt(invested)}</div>
      <div class="dash-stat-change ${invChange.cls}">${invChange.text}</div>
    </div>
    <div class="dash-stat-card">
      <div class="dash-stat-label">Liabilities</div>
      <div class="dash-stat-value">${fmt(totalLiabilities)}</div>
      <div class="dash-stat-change neu">Net worth: ${fmt(cash + invested - totalLiabilities)}</div>
    </div>`
}

window.initDashChart = function () {
  window.destroyChart?.('dashNetWorth')
  if (typeof window.Chart === 'undefined') return
  const ctx = document.getElementById('dashNetWorthChart')?.getContext('2d')
  if (!ctx) return
  const s = window.state
  if (s.order.length < 2) {
    const { cash, invested, totalLiabilities } = calcDashStats()
    const lbl = document.getElementById('dash-chart-label')
    if (lbl) lbl.textContent = `Net worth: ${fmt(cash + invested - totalLiabilities)}`
    return
  }
  const { cash, invested, totalLiabilities } = calcDashStats()
  const baseNW = cash + invested - totalLiabilities
  const data = s.order.map(k => (window.getRollingBalance?.(k) ?? 0) + baseNW)
  const first = data[0], last = data[data.length - 1]
  const diff = last - first
  const pct = first !== 0 ? Math.abs((diff / Math.abs(first)) * 100).toFixed(1) : 0
  const lbl = document.getElementById('dash-chart-label')
  if (lbl) {
    lbl.textContent = `${diff >= 0 ? '+' : ''}${fmt(diff)} (${diff >= 0 ? '+' : ''}${pct}%) this period`
    lbl.style.color = diff >= 0 ? 'var(--accent)' : 'var(--red)'
  }
  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2d6a4f'
  const chart = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels: s.order,
      datasets: [{ data, borderColor: accentColor, backgroundColor: 'rgba(45,106,79,0.08)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: accentColor }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.parsed.y) } } },
      scales: { y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: v => fmt(v) } }, x: { grid: { display: false } } }
    }
  })
  window.registerChart?.('dashNetWorth', chart)
}

window.renderDashAccounts = function () {
  const container = document.getElementById('dash-accounts-list')
  if (!container) return
  const s = window.state
  const ICONS = { cash: '💵', invested: '📈', retirement: '🏦', crypto: '₿' }
  container.innerHTML = (s.accounts || []).map(a => {
    const ch = fmtPctChange(a.balance, a.prevBalance)
    const linkedGoals = (s.goals || []).filter(g => g.linkedAccountId === a.id)
    const totalTarget = linkedGoals.reduce((acc, g) => acc + g.targetAmount, 0)
    const goalsLine = totalTarget > 0
      ? `<div class="dash-account-goals">${fmt(Math.min(a.balance, totalTarget))} of ${fmt(totalTarget)} in goals (${linkedGoals.length})</div>`
      : ''
    return `<div class="dash-account-row">
      <div class="dash-account-icon">${ICONS[a.type] || '💳'}</div>
      <div class="dash-account-info">
        <div class="dash-account-name">${a.name}</div>
        <div class="dash-account-type">${a.type.charAt(0).toUpperCase() + a.type.slice(1)}</div>
        ${goalsLine}
      </div>
      <div class="dash-account-right">
        <div class="dash-account-balance">${fmt(a.balance)}</div>
        <div class="dash-account-change ${ch.cls}">${ch.text}</div>
      </div>
    </div>`
  }).join('')
}

window.renderDashGoals = function () {
  const container = document.getElementById('dash-goals-list')
  if (!container) return
  const s = window.state
  container.innerHTML = (s.goals || []).map(g => {
    const current = getGoalCurrent(g)
    const pct = g.targetAmount > 0 ? Math.min(100, Math.round((current / g.targetAmount) * 100)) : 0
    const remaining = Math.max(0, g.targetAmount - current)
    const linkedAcct = g.linkedAccountId ? (s.accounts || []).find(a => a.id === g.linkedAccountId) : null
    const acctChip = linkedAcct
      ? `<span class="goal-acct-chip">📂 ${linkedAcct.name}</span>`
      : `<span class="goal-acct-chip unlinked">No account linked</span>`
    const proj = getGoalProjection(g)
    const projLine = proj
      ? `<div class="goal-projection">📅 On track: ~${proj.monthsNeeded} month${proj.monthsNeeded !== 1 ? 's' : ''} (${proj.label})</div>`
      : (remaining > 0 && g.linkedAccountId ? `<div class="goal-projection" style="color:var(--ink3);">Set a monthly target or link months to estimate completion</div>` : '')
    const targetInput = `<div class="goal-monthly-target"><label>Monthly target: </label><span style="display:inline-flex;align-items:center;gap:4px;">$<input type="number" class="goal-target-input" value="${g.monthlyTarget > 0 ? g.monthlyTarget : ''}" placeholder="optional" min="0" onchange="setGoalMonthlyTarget('${esc(g.id)}', this.value)" onclick="event.stopPropagation()"></span></div>`
    return `<div class="dash-goal-row">
      <div class="dash-goal-header">
        <span class="dash-goal-name">${esc(g.name)}</span>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <span class="dash-goal-pct">${pct}%</span>
          <button class="nw-del" data-action="deleteGoal('${esc(g.id)}')">✕</button>
        </div>
      </div>
      ${acctChip}
      <div class="dash-goal-progress"><div class="dash-goal-fill" style="width:${pct}%"></div></div>
      <div class="dash-goal-amounts">${fmt(current)} of ${fmt(g.targetAmount)} <span class="dash-goal-remaining">${remaining > 0 ? '· ' + fmt(remaining) + ' to go' : '· Complete! 🎉'}</span></div>
      ${projLine}
      ${remaining > 0 ? targetInput : ''}
    </div>`
  }).join('')
}

window.renderDashRecent = function (txList) {
  const container = document.getElementById('dash-recent-list')
  if (!container) return
  const now = new Date()
  container.innerHTML = txList.map(t => {
    const d = new Date(t.date)
    const daysAgo = Math.floor((now - d) / 86400000)
    const dateLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const meta = t.kind === 'inc' ? `Income · ${dateLabel}` : `${t.cat || 'Expense'} · ${dateLabel}`
    const amtStr = t.kind === 'inc' ? `+${fmt(t.amount)}` : `-${fmt(t.amount)}`
    return `<div class="dash-recent-row">
      <div>
        <div class="dash-recent-desc">${t.desc || (t.kind === 'inc' ? 'Income' : t.cat || 'Expense')}</div>
        <div class="dash-recent-meta">${meta}</div>
      </div>
      <div class="dash-recent-amt ${t.kind}">${amtStr}</div>
    </div>`
  }).join('')
}

window.renderDashInsight = function () {
  const textEl = document.getElementById('dash-insight-text')
  const subEl = document.getElementById('dash-insight-sub')
  if (!textEl) return
  const s = window.state
  const months = s.order
  if (!months.length) return
  const recent = months.slice(-2)
  const prior = months.slice(-4, -2)
  const catNow = {}, catPrev = {}
  recent.forEach(k => s.months[k]?.expenses.forEach(e => { catNow[e.cat] = (catNow[e.cat] || 0) + e.amount }))
  prior.forEach(k => s.months[k]?.expenses.forEach(e => { catPrev[e.cat] = (catPrev[e.cat] || 0) + e.amount }))
  let bestCat = '', bestDelta = 0
  Object.keys(catPrev).forEach(cat => {
    const prev = catPrev[cat] || 0
    const curr = catNow[cat] || 0
    if (prev > 0 && curr < prev) {
      const delta = (prev - curr) / prev
      if (delta > bestDelta) { bestDelta = delta; bestCat = cat }
    }
  })
  const lastKey = months[months.length - 1]
  const m = s.months[lastKey]
  const inc = m.incomes.reduce((a, t) => a + t.amount, 0)
  const exp = m.expenses.reduce((a, t) => a + t.amount, 0)
  const rate = inc > 0 ? Math.round(((inc - exp) / inc) * 100) : 0
  let insight = '', sub = ''
  if (bestCat && bestDelta > 0.1) {
    const pctDown = Math.round(bestDelta * 100)
    insight = `You're spending ${pctDown}% less on ${bestCat} — nice work.`
    sub = `That's ${fmt(catPrev[bestCat] - (catNow[bestCat] || 0))} saved compared to the prior period.`
  } else if (rate > 0) {
    insight = `Your savings rate is ${rate}% this month.`
    sub = rate >= 20 ? "You're above the recommended 20% threshold." : 'Trim variable expenses to push this higher.'
  } else {
    const top = Object.entries(catNow).sort((a, b) => b[1] - a[1])[0]
    if (top) { insight = `Top spending: ${top[0]} at ${fmt(top[1])}.`; sub = 'Review this category for savings opportunities.' }
  }
  if (insight) {
    textEl.textContent = insight
    if (subEl) subEl.textContent = sub
  } else {
    const sec = document.getElementById('dash-insight-section')
    if (sec) sec.style.display = 'none'
  }
}

// ── SUBSCRIPTION DETECTION ────────────────────────────────────

window.addDetectedAsFixed = function (desc, amount, cat) {
  const id = 'fixed-detected-' + Date.now()
  window.state.fixedExpenses = window.state.fixedExpenses || []
  window.state.fixedExpenses.push({ id, desc, amount, cat, frequency: 'monthly' })
  window.saveData()
  window.render?.()
}

// ── AUTO-CATEGORIZATION ───────────────────────────────────────
// Override addExpense to auto-suggest category when field is left empty

const _MERCHANT_RULES = [
  { patterns: ['starbucks', 'dunkin', 'coffee', 'cafe', 'espresso', 'boba'], cat: 'Dining Out' },
  { patterns: ['mcdonald', 'burger king', 'wendy', 'chipotle', 'subway', 'taco bell', 'chick-fil', 'popeyes', 'five guys', 'panera', 'pizza', 'dominos', 'doordash', 'ubereats', 'grubhub', 'instacart', 'restaurant', 'dining', 'kitchen', 'grill', 'sushi', 'ramen'], cat: 'Dining Out' },
  { patterns: ['whole foods', 'trader joe', 'safeway', 'kroger', 'walmart', 'target', 'costco', 'aldi', 'publix', 'sprouts', 'grocery', 'market', 'supermarket'], cat: 'Groceries' },
  { patterns: ['uber', 'lyft', 'taxi', 'transit', 'metro', 'bart', 'mta', 'parking', 'shell', 'exxon', 'chevron', 'bp ', 'marathon', 'mobil', 'sunoco', 'gas station', 'fuel'], cat: 'Transportation' },
  { patterns: ['netflix', 'hulu', 'disney+', 'spotify', 'apple music', 'youtube premium', 'hbo', 'peacock', 'paramount', 'prime video', 'twitch', 'crunchyroll'], cat: 'Entertainment' },
  { patterns: ['amazon', 'ebay', 'etsy', 'shopify', 'wayfair', 'ikea', 'best buy', 'apple store', 'target.com', 'walmart.com'], cat: 'Shopping' },
  { patterns: ['cvs', 'walgreens', 'rite aid', 'pharmacy', 'doctor', 'dental', 'vision', 'hospital', 'clinic', 'urgent care', 'health', 'medical'], cat: 'Health' },
  { patterns: ['gym', 'planet fitness', 'equinox', 'la fitness', 'ymca', 'peloton', 'crossfit', 'fitness'], cat: 'Health' },
  { patterns: ['electric', 'water bill', 'gas bill', 'internet', 'comcast', 'xfinity', 'at&t', 'verizon', 't-mobile', 'spectrum', 'utility', 'utilities', 'pge', 'con ed'], cat: 'Utilities' },
  { patterns: ['rent', 'mortgage', 'hoa', 'landlord', 'property'], cat: 'Rent/Mortgage' },
  { patterns: ['insurance', 'geico', 'state farm', 'allstate', 'progressive', 'nationwide', 'aetna', 'cigna', 'united health'], cat: 'Insurance' },
  { patterns: ['tuition', 'student loan', 'coursera', 'udemy', 'skillshare', 'school', 'college', 'university', 'textbook'], cat: 'Education' },
  { patterns: ['hotel', 'airbnb', 'marriott', 'hilton', 'hyatt', 'expedia', 'booking.com', 'flight', 'airline', 'delta', 'united airlines', 'american airlines', 'southwest'], cat: 'Travel' },
  { patterns: ['venmo', 'paypal', 'zelle', 'cashapp', 'cash app', 'wire transfer'], cat: 'Other' },
]

;(function patchAddExpense() {
  const _orig = window.addExpense
  window.addExpense = function () {
    const catInput = document.getElementById('expense-cat')
    const descInput = document.getElementById('expense-desc')
    if (catInput && !catInput.value.trim() && descInput?.value.trim()) {
      const suggested = window.suggestCategory?.(descInput.value.trim())
      if (suggested) catInput.value = suggested
    }
    return _orig?.()
  }
})()

window.suggestCategory = function (desc) {
  if (!desc) return null
  const lc = desc.toLowerCase()
  for (const rule of _MERCHANT_RULES) {
    if (rule.patterns.some(p => lc.includes(p))) return rule.cat
  }
  // Fallback: try mapBankCategory from app.js
  const mapped = window.mapBankCategory?.(desc)
  if (mapped && mapped !== 'Other') return mapped
  return null
}

// ── ADAPTIVE BUDGETS ──────────────────────────────────────────

window.suggestCategoryBudgets = function (monthKey, lookbackMonths = 3) {
  const s = window.state
  if (!s?.order?.length) return {}
  const idx = s.order.indexOf(monthKey)
  const lookback = idx > 0 ? s.order.slice(Math.max(0, idx - lookbackMonths), idx) : s.order.slice(0, Math.max(0, s.order.length - 1))
  if (!lookback.length) return {}

  const catSums = {}
  const catCounts = {}
  lookback.forEach(k => {
    const m = s.months[k]
    if (!m) return
    ;(m.expenses || []).forEach(e => {
      if (e.splits?.length) {
        e.splits.forEach(sp => {
          catSums[sp.cat] = (catSums[sp.cat] || 0) + sp.amount
          catCounts[sp.cat] = (catCounts[sp.cat] || 0) + 1
        })
      } else {
        catSums[e.cat] = (catSums[e.cat] || 0) + e.amount
        catCounts[e.cat] = (catCounts[e.cat] || 0) + 1
      }
    })
  })

  const suggestions = {}
  for (const cat of Object.keys(catSums)) {
    const avg = catSums[cat] / lookback.length
    const withBuffer = avg * 1.10
    suggestions[cat] = Math.ceil(withBuffer / 5) * 5
  }
  return suggestions
}

// ── AGE OF MONEY ───────────────────────────────────────────────

window.calcAgeOfMoney = function () {
  const st = window.state
  if (!st?.order?.length) return null
  const balance = window.getRollingBalance?.(st.order[st.order.length - 1]) || 0
  if (balance <= 0) return 0
  const lookback = Math.min(st.order.length, 3)
  const recentMonths = st.order.slice(-lookback)
  const avgMonthlyExp = recentMonths.reduce((s, k) => {
    return s + (st.months[k]?.expenses || []).reduce((e, t) => e + t.amount, 0)
  }, 0) / lookback
  if (avgMonthlyExp <= 0) return null
  return Math.round((balance / avgMonthlyExp) * 30)
}

// ── UPCOMING BILLS ─────────────────────────────────────────────

window.renderDashBills = function () {
  const section = document.getElementById('dash-bills-section')
  if (!section) return
  const st = window.state
  if (!st?.order?.length) { section.style.display = 'none'; return }

  const recurring = window.detectRecurringTransactions?.() || []
  if (!recurring.length) { section.style.display = 'none'; return }

  // Current month key (YYYY-MM)
  const now = new Date()
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const curMonthExpDescs = new Set(
    (st.months?.[curKey]?.expenses || []).map(e => (e.desc || '').toLowerCase().trim())
  )

  // Bills not yet seen this month
  const pending = recurring.filter(r => !curMonthExpDescs.has(r.desc.toLowerCase().trim()))
  if (!pending.length) { section.style.display = 'none'; return }

  section.style.display = 'block'
  const totalEl = document.getElementById('dash-bills-total')
  const listEl = document.getElementById('dash-bills-list')
  if (!listEl) return

  const total = pending.reduce((s, r) => s + r.amount, 0)
  if (totalEl) totalEl.textContent = fmt(total)

  listEl.innerHTML = pending.slice(0, 5).map(r => `
    <div class="dash-bills-row">
      <div class="dash-bills-info">
        <div class="dash-bills-desc">${r.desc}</div>
        <div class="dash-bills-cat">${r.cat}</div>
      </div>
      <div class="dash-bills-amt">−${fmt(r.amount)}</div>
    </div>`).join('')
}

// ── CONFETTI ──────────────────────────────────────────────────

function launchConfetti() {
  const colors = ['#6c63ff', '#ff6584', '#43b89c', '#ffc260', '#4facfe']
  const container = document.createElement('div')
  container.className = 'confetti-container'
  for (let i = 0; i < 40; i++) {
    const bit = document.createElement('div')
    bit.className = 'confetti-bit'
    bit.style.setProperty('--x', `${Math.random() * 100}vw`)
    bit.style.setProperty('--delay', `${Math.random() * 0.6}s`)
    bit.style.setProperty('--color', colors[Math.floor(Math.random() * colors.length)])
    bit.style.setProperty('--rot', `${Math.random() * 360}deg`)
    container.appendChild(bit)
  }
  document.body.appendChild(container)
  setTimeout(() => container.remove(), 3200)
}
window.launchConfetti = launchConfetti

// ── MILESTONE CELEBRATIONS ────────────────────────────────────

function checkAndFireMilestones() {
  const state = window.state
  if (!state) return
  if (!state.seenMilestones) state.seenMilestones = {}
  const seen = state.seenMilestones

  function fire(id, msg, withConfetti = false) {
    if (seen[id]) return
    seen[id] = true
    window.saveData?.()
    window.showToast?.(msg, 4000, withConfetti ? 'celebration' : 'success')
    if (withConfetti) launchConfetti()
  }

  const months = Object.values(state.months || {})

  const hasTx = months.some(m => (m.incomes || []).length > 0 || (m.expenses || []).length > 0)
  if (hasTx) fire('first_transaction', 'First transaction logged! 🎉')

  const hasComplete = months.some(m => (m.incomes || []).length > 0 && (m.expenses || []).length > 0)
  if (hasComplete) fire('first_month_complete', 'First full month tracked — nice work! 🙌', true)

  if ((state.goals || []).length >= 1) fire('first_goal', 'First goal set! 🎯')

  const { netWorth } = window.calcDashStats?.() || {}
  if (netWorth > 0) fire('net_worth_positive', 'Positive net worth achieved! 🚀', true)

  const now = new Date()
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const curMonth = state.months?.[curKey]
  if (curMonth) {
    const inc = (curMonth.incomes || []).reduce((s, t) => s + (t.amount || 0), 0)
    const exp = (curMonth.expenses || []).reduce((s, t) => s + (t.amount || 0), 0)
    if (inc > 0 && (inc - exp) / inc >= 0.2) {
      fire(`savings_rate_20_${curKey}`, '20% savings rate this month — crushing it! 🔥', true)
    }
  }
}
window.checkAndFireMilestones = checkAndFireMilestones
