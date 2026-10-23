// What the assistant is told about its role. The snapshot built in
// snapshot.js is appended below this on every turn.
export const CFO_SYSTEM_PROMPT = `You are the user's personal CFO: a calm, plain-spoken financial analyst who helps them understand their own money and decide what to do next.

Rules:
- Use ONLY the figures in the financial snapshot below. Never invent numbers, transactions, merchants or accounts. If the snapshot doesn't contain something, say you don't have that information.
- When you use a number, quote it exactly as it appears in the snapshot. Do not recalculate totals or percentages.
- Explain what the numbers mean in plain language: what changed, why it matters, and whether it is normal or unusual for this person.
- Be honest about uncertainty, for example when there are only one or two months of data.
- Keep it short: a direct answer first, then at most 3 brief bullet points.
- Finish with "Next steps:" followed by 1 to 3 specific, practical actions.
- You provide general information only, not professional financial, tax, legal or investment advice. For major decisions, suggest speaking with a qualified professional.`

export const QUICK_PROMPTS = {
  month: [
    'What changed this month?',
    'Where did my money go?',
    'Am I on track this month?',
    'What could I cut back on?',
    'How long would my savings last?',
  ],
  overview: [
    'Summarize my trends',
    'Which month was best for saving, and why?',
    'Is my spending creeping up?',
    'What is my biggest money risk right now?',
  ],
}

export function monthlyReviewPrompt(monthName) {
  return `Write my monthly CFO review for ${monthName}. Use these four short headings:
### What happened
2–3 sentences with the key numbers (income, spending, savings rate, budget).
### What changed
The biggest changes compared with earlier months, with figures.
### Watch out for
Any risks: overspending, rising categories, debt interest, low emergency runway.
### Next steps
1–3 specific actions for next month.`
}

export function explainPrompt(kind, detail = {}) {
  switch (kind) {
    case 'insight':
      return `Explain this alert from my ledger: "${detail.text}". Why did it happen, does it matter, and what should I do about it?`
    case 'category':
      return `Explain my ${detail.cat} spending this month: how it compares with earlier months, what is driving it, and whether I should change anything.`
    case 'budget':
      return 'Explain where I stand against my budget and savings goal this month, and what I should do for the rest of the month.'
    case 'chart':
      return `Explain what my ${detail.name} chart shows: the main pattern and anything that stands out.`
    case 'forecast':
      return 'Explain my cash flow outlook: how long my cash would last, what drives it, and how I could improve it.'
    case 'networth':
      return 'Explain my net worth and debts: what they mean, and what I should prioritise.'
    default:
      return detail.text || 'Explain what I am looking at.'
  }
}

// Safe rendering of model output: escape everything, then apply a tiny
// Markdown subset (headings, bold, bullets). Model text is never inserted as
// raw HTML, because it can echo merchant names from imported CSV files.
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderAIText(text) {
  const lines = escapeHtml(text).split('\n')
  const out = []
  let inList = false
  const inline = s => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  for (const raw of lines) {
    const line = raw.trimEnd()
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/)
    if (bullet) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${inline(bullet[1])}</li>`)
      continue
    }
    if (inList) { out.push('</ul>'); inList = false }
    const heading = line.match(/^#{1,4}\s+(.*)$/)
    if (heading) out.push(`<div class="ai-h">${inline(heading[1])}</div>`)
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`)
  }
  if (inList) out.push('</ul>')
  return out.join('')
}
