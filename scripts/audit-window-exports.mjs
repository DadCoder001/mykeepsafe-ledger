#!/usr/bin/env node
/**
 * Audits that every window.func?.() call in React components and every
 * data-action="func()" string has a matching window.* assignment in
 * app.js, bridge.js or src/ai/index.js. Prints gaps and exits with code 1 if any found.
 *
 * Usage: node scripts/audit-window-exports.mjs
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ── Collect all window.* assignments from app.js, bridge.js, src/ai/index.js ─

function collectExports(filePath) {
  const src = readFileSync(filePath, 'utf8')
  const exported = new Set()
  // matches: window.funcName = ... or window.funcName=...
  for (const m of src.matchAll(/window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g)) {
    exported.add(m[1])
  }
  return exported
}

const appJsExports = collectExports(join(ROOT, 'src/public/legacy/app.js'))
const bridgeExports = collectExports(join(ROOT, 'src/bridge.js'))
const aiExports = collectExports(join(ROOT, 'src/ai/index.js'))
const allExports = new Set([...appJsExports, ...bridgeExports, ...aiExports])

// ── Walk all .jsx files in src/components and src/views ───────────────────

function walkJsx(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) files.push(...walkJsx(full))
    else if (entry.endsWith('.jsx') || entry.endsWith('.js')) files.push(full)
  }
  return files
}

const jsxFiles = [
  ...walkJsx(join(ROOT, 'src/components')),
  ...walkJsx(join(ROOT, 'src/views')),
]

// ── Skip list: window properties that are NOT function calls ──────────────
const SKIP = new Set([
  'state', '__TAURI__', 'Chart', 'CURATED_MODELS', '_legacyInit', '_legacyInitDone',
  'location', 'open', 'close', 'history', 'alert', 'confirm', 'prompt',
  'innerWidth', 'innerHeight', 'addEventListener', 'removeEventListener',
  'dispatchEvent', 'localStorage', 'sessionStorage', 'crypto', 'fetch',
])

const gaps = [] // { file, line, func }

for (const file of jsxFiles) {
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')

  lines.forEach((line, i) => {
    // Pattern 1: window.funcName?.( or window.funcName(
    for (const m of line.matchAll(/window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\?\.\s*\(|window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g)) {
      const name = m[1] || m[2]
      if (!SKIP.has(name) && !allExports.has(name)) {
        gaps.push({ file: file.replace(ROOT, '').replace(/\\/g, '/'), line: i + 1, func: name, pattern: 'window.func?.' })
      }
    }

    // Pattern 2: data-action="funcName(..." strings
    for (const m of line.matchAll(/data-action=["'`]([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g)) {
      const name = m[1]
      if (!SKIP.has(name) && !allExports.has(name)) {
        gaps.push({ file: file.replace(ROOT, '').replace(/\\/g, '/'), line: i + 1, func: name, pattern: 'data-action' })
      }
    }
  })
}

// ── Deduplicate and report ────────────────────────────────────────────────

const seen = new Set()
const unique = gaps.filter(g => {
  const key = g.func
  if (seen.has(key)) return false
  seen.add(key)
  return true
})

if (unique.length === 0) {
  console.log('✓ All window.* calls are exported.')
  process.exit(0)
}

console.error(`\n✗ ${unique.length} function(s) called from React but not assigned to window:\n`)
for (const g of unique) {
  console.error(`  ${g.func}  (${g.pattern})  — first seen at ${g.file}:${g.line}`)
}
console.error('\nFix: add window.funcName = funcName to the exports block in app.js, bridge.js or src/ai/index.js\n')
process.exit(1)
