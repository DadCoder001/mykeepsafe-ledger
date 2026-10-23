// The AI assistant conversation: one running thread shared by the side panel
// and the ✦ AI page. Each turn sends the CFO instructions plus a freshly
// computed financial snapshot, then the recent conversation.
import { buildFinancialSnapshot, monthLabel } from './snapshot.js'
import { CFO_SYSTEM_PROMPT, QUICK_PROMPTS, monthlyReviewPrompt, explainPrompt, renderAIText, escapeHtml } from './prompts.js'
import { chatComplete } from './providers.js'
import { curatedById } from './models.js'

const HISTORY_MESSAGES = 6 // last 3 exchanges; small models have small context windows

const thread = [] // { role: 'user'|'assistant', content, error?, review? }
let busy = false

function settings() {
  return window.state?.settings || {}
}

function isSmallModel(s) {
  // Models of 2B parameters or less get a shorter snapshot.
  const name = s.aiProvider === 'llamacpp' ? (curatedById(s.aiModel)?.ollamaTag || '') : (s.aiModel || '')
  return /(^|[:\-_])(0\.\d+|1|1\.5|2)b\b/i.test(name)
}

export function currentSnapshot() {
  const state = window.state
  const view = window.getActiveView?.() || 'month'
  const monthKey = window.getActiveMonth?.() || (state?.order || []).slice(-1)[0]
  let insights = []
  try {
    insights = view === 'overview'
      ? (window.generateOverviewInsights?.(state.order) || [])
      : (window.generateMonthInsights?.(monthKey) || [])
  } catch {}
  return buildFinancialSnapshot(state, {
    view: view === 'overview' ? 'overview' : 'month',
    monthKey,
    compact: isSmallModel(settings()),
    insights,
    detectRecurring: () => { try { return window.detectRecurringTransactions?.() || [] } catch { return [] } },
    goalCurrent: g => { try { return window.getGoalCurrent?.(g) ?? 0 } catch { return 0 } },
  })
}

// ── Rendering ────────────────────────────────────────────────

function messageHtml(msg, i, surface) {
  if (msg.role === 'user') {
    return `<div class="${surface === 'panel' ? 'asp-msg-q' : 'ai-msg ai-msg-user'}">${escapeHtml(msg.content)}</div>`
  }
  const cls = surface === 'panel' ? 'asp-msg-a' : 'ai-msg ai-msg-assistant'
  if (msg.pending && !msg.content) {
    return `<div class="${cls} ai-pending">Reading your numbers…<div class="ai-hint ai-muted">The model runs on this computer, so the first words can take up to a minute on some laptops.</div></div>`
  }
  if (msg.error) return `<div class="${cls} ai-error">${escapeHtml(msg.content)}${msg.hint ? `<div class="ai-hint">${msg.hint}</div>` : ''}</div>`
  const actions = msg.review && !msg.pending
    ? `<div class="ai-msg-actions"><button class="ai-chip" data-action="saveCFOReview(${i})">${msg.saved ? '✓ Saved to this month' : 'Save to this month'}</button></div>`
    : ''
  return `<div class="${cls}">${renderAIText(msg.content)}${actions}</div>`
}

export function renderThreads() {
  const surfaces = [
    { el: document.getElementById('asp-response'), surface: 'panel' },
    { el: document.getElementById('ai-response'), surface: 'page' },
  ]
  for (const { el, surface } of surfaces) {
    if (!el) continue
    if (!thread.length) {
      el.innerHTML = ''
      el.style.display = surface === 'page' ? 'none' : ''
      continue
    }
    el.style.display = 'block'
    el.className = surface === 'panel' ? 'asp-response' : 'ai-response'
    el.innerHTML = thread.map((m, i) => messageHtml(m, i, surface)).join('') +
      `<div class="ai-thread-footer"><button class="ai-link-btn" data-action="newAIConversation()">New conversation</button></div>`
    el.scrollTop = el.scrollHeight
  }
  document.querySelectorAll('#ai-ask-btn, .asp-send-btn').forEach(b => { b.disabled = busy })
}

function settingsHint() {
  return `<button class="ai-link-btn" data-action="switchView('ai')">Open ✦ AI settings</button>`
}

// ── Asking ───────────────────────────────────────────────────

async function ask(question, { review = false, maxTokens = 600 } = {}) {
  question = String(question || '').trim()
  if (!question || busy) return
  const s = settings()
  if (!s.aiEnabled) {
    thread.push({ role: 'user', content: question }, { role: 'assistant', error: true, content: 'The AI assistant is turned off.', hint: settingsHint() })
    renderThreads()
    return
  }

  const history = thread.filter(m => !m.error && !m.pending).slice(-HISTORY_MESSAGES)
    .map(m => ({ role: m.role, content: m.content }))
  const messages = [
    { role: 'system', content: `${CFO_SYSTEM_PROMPT}\n\n${currentSnapshot()}` },
    ...history,
    { role: 'user', content: question },
  ]

  const reply = { role: 'assistant', content: '', pending: true, review }
  thread.push({ role: 'user', content: question }, reply)
  busy = true
  renderThreads()

  let lastPaint = 0
  try {
    const text = await chatComplete({
      settings: s,
      messages,
      maxTokens,
      onToken: partial => {
        reply.content = partial
        const now = Date.now()
        if (now - lastPaint > 60) { lastPaint = now; renderThreads() }
      },
    })
    reply.content = text || 'The model returned an empty answer. Try asking again, or pick a larger model.'
    if (review) reply.monthKey = window.getActiveMonth?.()
  } catch (e) {
    reply.error = true
    reply.content = e.message || 'Something went wrong talking to the model.'
    reply.hint = settingsHint()
  } finally {
    reply.pending = false
    busy = false
    renderThreads()
  }
}

function openPanel() {
  if (window.getAIPanelOpen && !window.getAIPanelOpen()) window.toggleAIPanel?.()
}

export function askFromPage(promptOverride) {
  const input = document.getElementById('ai-input')
  const q = promptOverride || input?.value
  if (input && !promptOverride) input.value = ''
  return ask(q)
}

export function askFromPanel(promptOverride) {
  const input = document.getElementById('asp-input')
  const q = promptOverride || input?.value
  if (input && !promptOverride) input.value = ''
  openPanel()
  return ask(q)
}

export function explainThis(kind, detail) {
  openPanel()
  return ask(explainPrompt(kind, detail || {}))
}

export function monthlyReview() {
  const key = window.getActiveMonth?.()
  openPanel()
  return ask(monthlyReviewPrompt(monthLabel(key)), { review: true, maxTokens: 800 })
}

export function newConversation() {
  if (busy) return
  thread.length = 0
  renderThreads()
}

export function saveReview(index) {
  const msg = thread[index]
  const state = window.state
  const key = msg?.monthKey || window.getActiveMonth?.()
  if (!msg || !state?.months?.[key]) return
  state.months[key].cfoReview = { text: msg.content, savedAt: new Date().toISOString(), model: settings().aiModel || '' }
  msg.saved = true
  window.saveData?.()
  window.showToast?.(`Saved to ${monthLabel(key)}`)
  document.dispatchEvent(new CustomEvent('ks:month-render', { detail: { monthKey: key } }))
  renderThreads()
}

// One-off completion without the snapshot or thread (used by CSV categorizer).
export async function completeOnce(prompt, maxTokens = 600) {
  return chatComplete({ settings: settings(), messages: [{ role: 'user', content: prompt }], maxTokens })
}

export function quickPrompts(view) {
  return view === 'overview' ? QUICK_PROMPTS.overview : QUICK_PROMPTS.month
}
