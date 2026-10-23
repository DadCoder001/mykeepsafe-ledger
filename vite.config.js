import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

const projectRoot = path.resolve(import.meta.dirname, '.')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mp3':  'audio/mpeg',
}

// Serve legacy root-level files and the tests/ directory during dev.
// This lets Playwright fixture loaders (load-core.html, etc.) work
// against the Vite dev server the same way they did against the old Node server.
const serveProjectRootPlugin = {
  name: 'serve-project-root-statics',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = (req.url || '').split('?')[0]

      // Only intercept root-level HTML loaders, demo assets, and tests/
      const isRootLoader = /^\/(load-[^/]+\.html|demo-data\.json)$/.test(url)
      const isTestsPath  = url.startsWith('/tests/')
      const isDemoPath   = url.startsWith('/demo/')

      if (!isRootLoader && !isTestsPath && !isDemoPath) return next()

      const filePath = path.join(projectRoot, url)
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return next()

      const ext = path.extname(filePath).toLowerCase()
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
      res.setHeader('Cache-Control', 'no-cache')
      fs.createReadStream(filePath).pipe(res)
    })
  }
}

export default defineConfig({
  plugins: [react(), serveProjectRootPlugin],
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 8000,
    strictPort: true,
    host: 'localhost', // never expose the dev server to the network
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
})
