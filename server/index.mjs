// `npm start` entry point: serves the built app and the local data API on
// 127.0.0.1 only. Nothing is reachable from other machines on the network.
//
// Environment:
//   PORT          port to listen on (default 8000)
//   KSL_DATA_DIR  where ledger.json and backups/ live (default ./data)
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { createApi, isLocalRequest } from './api.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT) || 8000
const DATA_DIR = path.resolve(process.env.KSL_DATA_DIR || path.join(ROOT, 'data'))
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

// Same policy as the <meta> tag in src/index.html. In server mode the app only
// ever talks to this server, so connect-src can be 'self'.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('No build found in dist/. Run `npm start` (builds first) or `npm run build`.')
  process.exit(1)
}

const handleApi = createApi({ dataDir: DATA_DIR, version })

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname)
  let filePath = path.join(DIST, urlPath)
  if (filePath !== DIST && !filePath.startsWith(DIST + path.sep)) { res.writeHead(403); res.end(); return }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html')
  }
  const ext = path.extname(filePath).toLowerCase()
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  })
  fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer(async (req, res) => {
  if (!isLocalRequest(req)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' })
    res.end('Forbidden: MyKeepSafe Ledger only accepts requests from this computer.')
    return
  }
  res.setHeader('Content-Security-Policy', CSP)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  if (await handleApi(req, res)) return
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return }
  serveStatic(req, res)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  MyKeepSafe Ledger is running at  http://localhost:${PORT}`)
  console.log(`  Your data is saved to           ${path.join(DATA_DIR, 'ledger.json')}`)
  console.log('  Only this computer can connect. Press Ctrl+C to stop.\n')
})
