#!/usr/bin/env node
/**
 * Release gate for the public repository. Fails (exit 1) if anything that
 * must never ship is found. Run before publishing, and in CI on every PR.
 *
 *   1. window.* export audit (CLAUDE.md gotcha #1)
 *   2. forbidden strings: paid-tier, cloud AI, bank sync, private brand/URLs
 *   3. forbidden files: keys, certificates, .env files, user data
 *   4. secret patterns: API keys, private keys, tokens
 *   5. production dependency licenses are open-source compatible
 *   6. Playwright test suite (skip with --skip-tests)
 *
 * Usage: node scripts/check-release.mjs [--skip-tests]
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SELF = 'scripts/check-release.mjs'
const skipTests = process.argv.includes('--skip-tests')
const problems = []
const fail = (step, msg) => problems.push(`[${step}] ${msg}`)

// Files that would be published: tracked + untracked-but-not-ignored, minus
// everything .gitattributes marks export-ignore.
function publishedFiles() {
  const listed = execSync('git ls-files -co --exclude-standard', { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean).filter(f => fs.existsSync(path.join(ROOT, f)))
  const patterns = fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8').split('\n')
    .map(l => l.trim()).filter(l => l && !l.startsWith('#') && /\bexport-ignore\b/.test(l)).map(l => l.split(/\s+/)[0])
  const ignored = f => patterns.some(p => (p.endsWith('/') ? f.startsWith(p) : f === p))
  return listed.filter(f => !ignored(f))
}

const BINARY = /\.(png|jpg|jpeg|gif|ico|icns|woff2?|ttf|mp4|webm|mp3|pdf|exe|gguf)$/i
const LOCKFILES = new Set(['package-lock.json', 'src-tauri/Cargo.lock'])

// [regex, description, files allowed to contain it]
const FORBIDDEN = [
  [/stripe/i, 'payment provider (paid tier)', []],
  [/plaid/i, 'bank-sync service (sends data off-device)', ['src/ai/index.js' /* deletes the setting saved by old versions */]],
  [/bgn-e71|workers\.dev/i, 'private Cloudflare worker URL', []],
  [/keepsafeledger\.com/i, 'private product domain', []],
  [/(?<!My)KeepSafe Ledger/, 'old product name (use "MyKeepSafe Ledger")', []],
  [/The One Barter/i, 'company name from the private product', []],
  [/KEEPSAFE-BETA|MYLEDGER-BETA|\bisPro\b|validate-license/, 'paid-tier / beta-gate code', []],
  [/api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com|api\.groq\.com/i, 'cloud AI endpoint', ['tests/features/feature-ai-cfo.spec.js']],
  [/fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr|cdnjs\.cloudflare|unpkg\.com/i, 'third-party CDN (sends a request off-device)', []],
  [/\bnara\b|\bwilliam\b/i, 'name from a real-person fixture', []],
]

const SECRETS = [
  [/sk_(live|test)_[0-9a-zA-Z]{10,}/, 'Stripe secret key'],
  [/whsec_[0-9a-zA-Z]{10,}/, 'webhook signing secret'],
  [/-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, 'private key'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/\bre_[A-Za-z0-9]{20,}/, 'Resend API key'],
  [/xox[abpr]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/AIza[0-9A-Za-z_-]{35}/, 'Google API key'],
]

const FORBIDDEN_FILES = [
  [/\.(key|pfx|p12|cer|pem)$/i, 'key or certificate'],
  [/(^|\/)\.env(\.|$)/, 'environment file'],
  [/^data\//, 'user data folder'],
  [/(^|\/)ledger\.json$/, 'a ledger data file'],
]

const OK_LICENSES = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'OFL-1.1', 'BlueOak-1.0.0', 'CC0-1.0', 'Unlicense', 'Python-2.0', 'MIT-0'])

function step(name, fn) {
  process.stdout.write(`• ${name}… `)
  const before = problems.length
  fn()
  console.log(problems.length === before ? 'ok' : `${problems.length - before} problem(s)`)
}

const files = publishedFiles()

step('window.* export audit', () => {
  const r = spawnSync(process.execPath, ['scripts/audit-window-exports.mjs'], { cwd: ROOT, encoding: 'utf8' })
  if (r.status !== 0) fail('exports', (r.stderr || r.stdout).trim())
})

step(`forbidden strings in ${files.length} published files`, () => {
  for (const f of files) {
    if (f === SELF || BINARY.test(f) || LOCKFILES.has(f)) continue
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8')
    for (const [re, what, allowed] of FORBIDDEN) {
      if (allowed.includes(f)) continue
      const lines = text.split('\n')
      lines.forEach((line, i) => { if (re.test(line)) fail('strings', `${f}:${i + 1} ${what}: ${line.trim().slice(0, 100)}`) })
    }
  }
})

step('forbidden files', () => {
  for (const f of files) {
    for (const [re, what] of FORBIDDEN_FILES) if (re.test(f)) fail('files', `${f} (${what})`)
  }
})

step('secret patterns', () => {
  for (const f of files) {
    if (f === SELF || BINARY.test(f)) continue
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8')
    for (const [re, what] of SECRETS) if (re.test(text)) fail('secrets', `${f}: looks like a ${what}`)
  }
  const gitleaks = spawnSync('gitleaks', ['version'], { encoding: 'utf8' })
  if (gitleaks.status === 0) {
    const r = spawnSync('gitleaks', ['dir', ROOT, '--no-banner', '--redact'], { encoding: 'utf8' })
    if (r.status !== 0) fail('secrets', `gitleaks reported findings:\n${r.stdout}${r.stderr}`)
  } else {
    process.stdout.write('(gitleaks not installed — CI runs it) ')
  }
})

step('production dependency licenses', () => {
  let tree
  try {
    tree = JSON.parse(execSync('npm ls --omit=dev --all --json', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
  } catch (e) {
    tree = JSON.parse(e.stdout || '{}')
  }
  const seen = new Set()
  const walk = deps => {
    for (const [name, info] of Object.entries(deps || {})) {
      if (seen.has(name)) continue
      seen.add(name)
      const pkgFile = path.join(ROOT, 'node_modules', name, 'package.json')
      if (fs.existsSync(pkgFile)) {
        const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'))
        const lic = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type || (pkg.licenses || []).map(l => l.type).join(' OR ')
        const parts = String(lic || 'UNKNOWN').replace(/[()]/g, '').split(/\s+(?:OR|AND)\s+/)
        if (!parts.some(p => OK_LICENSES.has(p.trim()))) fail('licenses', `${name}@${pkg.version}: ${lic || 'no license field'}`)
      }
      walk(info.dependencies)
    }
  }
  walk(tree.dependencies)
})

if (!skipTests) {
  console.log('• Playwright test suite…')
  const r = spawnSync('npx', ['playwright', 'test', '--reporter=line'], { cwd: ROOT, stdio: 'inherit', shell: true })
  if (r.status !== 0) fail('tests', 'Playwright suite failed (see output above)')
}

if (problems.length) {
  console.error(`\n✗ Release check failed with ${problems.length} problem(s):\n`)
  problems.forEach(p => console.error('  ' + p))
  process.exit(1)
}
console.log('\n✓ Release check passed.')
