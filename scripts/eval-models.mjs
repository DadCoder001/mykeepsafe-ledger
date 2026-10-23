#!/usr/bin/env node
/**
 * Evaluates local Ollama models as the AI CFO, using the test fixtures as
 * the user's finances. For each model and question it checks:
 *   - accuracy: every dollar figure in the answer appears in the snapshot
 *     (small models sometimes invent or mangle numbers)
 *   - format: the answer ends with "Next steps"
 *   - speed: seconds per answer
 *
 * Usage:
 *   node scripts/eval-models.mjs                       # curated models that are installed
 *   node scripts/eval-models.mjs qwen3.5:4b llama3.1:8b
 *   node scripts/eval-models.mjs --min-accuracy 0.8 qwen3.5:4b   # exit 1 below threshold
 *
 * Requires Ollama running on http://localhost:11434 (OLLAMA_URL to override).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFinancialSnapshot } from '../src/ai/snapshot.js'
import { CFO_SYSTEM_PROMPT } from '../src/ai/prompts.js'
import { CURATED_MODELS } from '../src/ai/models.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434'

const args = process.argv.slice(2)
let minAccuracy = null
let showMisses = false
let limit = Infinity
const requested = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--min-accuracy') minAccuracy = Number(args[++i])
  else if (args[i] === '--show-misses') showMisses = true
  else if (args[i] === '--limit') limit = Number(args[++i])
  else requested.push(args[i])
}

const FIXTURES = ['tests/fixtures/core-test-data.json', 'tests/fixtures/feature-validation-data.json']
const QUESTIONS = [
  'What changed this month?',
  'Where did my money go?',
  'Am I on track this month?',
  'What could I cut back on?',
  'How long would my savings last?',
  'Which debt should I pay off first?',
  'Is my spending creeping up?',
  'How much do I spend on subscriptions?',
  'Summarize my finances in two sentences.',
  'Should I be worried about anything?',
]

const amounts = text => (String(text).match(/\$\s?[\d,]+(?:\.\d+)?/g) || []).map(s => Number(s.replace(/[$,\s]/g, '')))

function cited(answer, snapshot) {
  const known = amounts(snapshot)
  const used = amounts(answer)
  if (!used.length) return { used: 0, ok: 0 }
  // Rounded quotes ($2,222 for $2,221.99) count as correct.
  const ok = used.filter(v => known.some(k => Math.abs(k - v) <= Math.max(1, Math.abs(k) * 0.005))).length
  const misses = used.filter(v => !known.some(k => Math.abs(k - v) <= Math.max(1, Math.abs(k) * 0.005)))
  return { used: used.length, ok, misses }
}

async function ollama(pathname, body) {
  const res = await fetch(OLLAMA + pathname, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
  if (!res.ok) {
    const text = await res.text()
    // Models without a thinking mode may reject `think` — retry without it, like the app does.
    if (body && 'think' in body && /think/i.test(text)) {
      const { think, ...rest } = body
      return ollama(pathname, rest)
    }
    throw new Error(`${pathname}: HTTP ${res.status} ${text}`)
  }
  return res.json()
}

async function main() {
  let installed
  try {
    installed = (await ollama('/api/tags')).models.map(m => m.name)
  } catch {
    console.error(`Ollama is not reachable at ${OLLAMA}. Start it and try again.`)
    process.exit(2)
  }
  const models = requested.length ? requested : CURATED_MODELS.map(m => m.ollamaTag).filter(t => installed.includes(t))
  if (!models.length) {
    console.error('No models to evaluate. Install one (e.g. `ollama pull qwen3.5:4b`) or pass model names.')
    process.exit(2)
  }

  const snapshots = FIXTURES.map(f => buildFinancialSnapshot(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')), { today: '2026-06-01' }))
  const results = []
  for (const model of models) {
    let used = 0, ok = 0, nextSteps = 0, seconds = 0, runs = 0, failures = 0, promptSec = 0, genTokens = 0, genSec = 0
    process.stdout.write(`\n${model} `)
    for (const snapshot of snapshots) {
      for (const q of QUESTIONS.slice(0, limit)) {
        const started = Date.now()
        try {
          const data = await ollama('/api/chat', {
            model,
            stream: false,
            think: false,
            options: { temperature: 0.3, num_ctx: 8192, num_predict: 500 },
            messages: [{ role: 'system', content: `${CFO_SYSTEM_PROMPT}\n\n${snapshot}` }, { role: 'user', content: q }],
          })
          const answer = String(data.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '')
          promptSec += (data.prompt_eval_duration || 0) / 1e9 + (data.load_duration || 0) / 1e9
          genTokens += data.eval_count || 0
          genSec += (data.eval_duration || 0) / 1e9
          const c = cited(answer, snapshot)
          used += c.used; ok += c.ok
          if (showMisses && c.misses.length) {
            console.log(`\n  Q: ${q}\n  not in snapshot: ${c.misses.map(v => '$' + v).join(', ')}\n  answer: ${answer.replace(/\s+/g, ' ').slice(0, 700)}`)
          }
          if (/next steps/i.test(answer)) nextSteps++
          process.stdout.write('.')
        } catch (e) {
          failures++
          process.stdout.write('x')
        }
        seconds += (Date.now() - started) / 1000
        runs++
      }
    }
    results.push({
      model,
      accuracy: used ? ok / used : 1,
      figuresQuoted: used,
      nextSteps: nextSteps / runs,
      secondsPerAnswer: seconds / runs,
      secondsBeforeFirstWord: promptSec / runs,
      wordsPerSecond: genSec ? (genTokens / genSec) * 0.75 : 0,
      failures,
    })
  }

  console.log('\n')
  console.table(results.map(r => ({
    model: r.model,
    'numbers correct': `${Math.round(r.accuracy * 100)}% of ${r.figuresQuoted}`,
    'has next steps': `${Math.round(r.nextSteps * 100)}%`,
    'sec/answer': r.secondsPerAnswer.toFixed(1),
    'sec to first word': r.secondsBeforeFirstWord.toFixed(1),
    'words/sec': r.wordsPerSecond.toFixed(1),
    failures: r.failures,
  })))

  if (minAccuracy !== null) {
    const below = results.filter(r => r.accuracy < minAccuracy || r.failures > 0)
    if (below.length) {
      console.error(`Below ${Math.round(minAccuracy * 100)}% accuracy (or with failures): ${below.map(r => r.model).join(', ')}`)
      process.exit(1)
    }
  }
}

main()
