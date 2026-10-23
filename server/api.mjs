// Local data + model API for MyKeepSafe Ledger.
//
// Everything here runs on the user's own machine. The data file never leaves
// it, and the model proxy can only reach ports on 127.0.0.1, so nothing the
// app sends to a model can be forwarded off-device.
//
// Endpoints:
//   GET  /api/health                 → { ok, version, dataFile }
//   GET  /api/data                   → saved ledger JSON (404 if none yet)
//   PUT  /api/data                   → replace ledger JSON (atomic write + daily backup)
//   ANY  /api/llm/<port>/<path...>   → proxied to http://127.0.0.1:<port>/<path...>
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'

const MAX_BODY_BYTES = 50 * 1024 * 1024
const BACKUPS_TO_KEEP = 14

export function createApi({ dataDir, version = '0.0.0' }) {
  const dataFile = path.join(dataDir, 'ledger.json')
  const backupDir = path.join(dataDir, 'backups')

  function sendJson(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      req.on('data', chunk => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
          reject(Object.assign(new Error('Body too large'), { status: 413 }))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }

  // Before the first write of each day, copy the current file into backups/.
  function backupIfNeeded() {
    if (!fs.existsSync(dataFile)) return
    fs.mkdirSync(backupDir, { recursive: true })
    const day = new Date().toISOString().slice(0, 10)
    const target = path.join(backupDir, `ledger-${day}.json`)
    if (!fs.existsSync(target)) fs.copyFileSync(dataFile, target)
    const backups = fs.readdirSync(backupDir).filter(f => /^ledger-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
    backups.slice(0, Math.max(0, backups.length - BACKUPS_TO_KEEP))
      .forEach(f => fs.rmSync(path.join(backupDir, f), { force: true }))
  }

  function writeAtomic(text) {
    fs.mkdirSync(dataDir, { recursive: true })
    backupIfNeeded()
    const tmp = `${dataFile}.${process.pid}.tmp`
    fs.writeFileSync(tmp, text, 'utf8')
    fs.renameSync(tmp, dataFile)
  }

  function proxyToLoopback(req, res, port, rest) {
    const upstream = http.request({
      host: '127.0.0.1',
      port,
      method: req.method,
      path: '/' + rest,
      headers: {
        'content-type': req.headers['content-type'] || 'application/json',
        ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
      },
    }, up => {
      res.writeHead(up.statusCode || 502, {
        'Content-Type': up.headers['content-type'] || 'application/json',
        'Cache-Control': 'no-store',
      })
      up.pipe(res)
    })
    upstream.on('error', err => {
      if (!res.headersSent) sendJson(res, 502, { error: `Local model server not reachable on port ${port}: ${err.code || err.message}` })
      else res.end()
    })
    req.pipe(upstream)
    res.on('close', () => upstream.destroy())
  }

  // Returns true when the request was handled.
  return async function handleApi(req, res) {
    const url = new URL(req.url || '/', 'http://localhost')
    if (!url.pathname.startsWith('/api/')) return false

    try {
      if (url.pathname === '/api/health' && req.method === 'GET') {
        sendJson(res, 200, { ok: true, version, dataFile })
        return true
      }

      if (url.pathname === '/api/data') {
        if (req.method === 'GET') {
          if (!fs.existsSync(dataFile)) { sendJson(res, 404, { error: 'No data saved yet' }); return true }
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          fs.createReadStream(dataFile).pipe(res)
          return true
        }
        if (req.method === 'PUT') {
          const text = await readBody(req)
          let data
          try { data = JSON.parse(text) } catch { sendJson(res, 400, { error: 'Body is not valid JSON' }); return true }
          if (!data || typeof data.months !== 'object' || !Array.isArray(data.order)) {
            sendJson(res, 400, { error: 'Body must contain "months" and "order"' })
            return true
          }
          writeAtomic(JSON.stringify(data, null, 2))
          sendJson(res, 200, { ok: true, savedAt: new Date().toISOString() })
          return true
        }
        sendJson(res, 405, { error: 'Method not allowed' })
        return true
      }

      const llm = url.pathname.match(/^\/api\/llm\/(\d{1,5})\/(.*)$/)
      if (llm) {
        const port = Number(llm[1])
        if (port < 1 || port > 65535) { sendJson(res, 400, { error: 'Invalid port' }); return true }
        proxyToLoopback(req, res, port, llm[2] + url.search)
        return true
      }

      sendJson(res, 404, { error: 'Not found' })
      return true
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message || 'Server error' })
      return true
    }
  }
}

// Blocks DNS-rebinding and cross-site requests: the Host must be a loopback
// name, and any Origin header must match it.
export function isLocalRequest(req) {
  const host = (req.headers.host || '').toLowerCase()
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0]
  if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return false
  const origin = req.headers.origin
  if (origin && origin !== 'null') {
    try {
      if (new URL(origin).host.toLowerCase() !== host) return false
    } catch { return false }
  }
  return true
}
