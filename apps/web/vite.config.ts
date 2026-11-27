/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Mock API for development (decision #37).
 * Runs the MSW handlers in src/mocks INSIDE the Vite dev server (no service worker),
 * so it works in every browser, including a real phone on the same Wi-Fi.
 * Requests that are not mocked go to the /api proxy (real backend, apps/api).
 *
 * VITE_API_MOCKS in apps/web/.env.local:
 *   (not set) or "all"   → mock every area
 *   "off"                → no mocks, everything from the real backend
 *   "friends,home"       → mock only these areas; the rest from the real backend
 * Areas: see MOCK_AREAS. Never part of a production build (apply: 'serve').
 */
const MOCK_AREAS = ['auth', 'me', 'profiles', 'friends', 'gangs', 'meetups', 'home', 'notifications', 'rooms'] as const
type MockArea = (typeof MOCK_AREAS)[number]

/** Which area an /api path belongs to (order matters: specific paths first). */
function areaOf(path: string): MockArea | null {
  if (path.startsWith('/api/auth/')) return 'auth'
  if (path === '/api/me' || path.startsWith('/api/me/') || path.startsWith('/api/users/me/')) return 'me'
  if (
    path.startsWith('/api/users/search') ||
    path.startsWith('/api/friends') ||
    path.startsWith('/api/friend-links/') ||
    path.startsWith('/api/blocks')
  ) {
    return 'friends'
  }
  if (path.startsWith('/api/users/')) return 'profiles'
  if (path === '/api/gangs' || path.startsWith('/api/gangs/')) return 'gangs'
  if (path === '/api/meetups' || path.startsWith('/api/meetups/')) return 'meetups'
  if (path === '/api/home' || path === '/api/feed') return 'home'
  if (path === '/api/notifications' || path.startsWith('/api/notifications/')) return 'notifications'
  if (path === '/api/rooms' || path.startsWith('/api/rooms/')) return 'rooms'
  return null
}

function mockedAreas(setting: string | undefined): Set<MockArea> {
  const value = (setting ?? 'all').trim()
  if (value === 'off') return new Set()
  if (value === 'all' || value === 'on' || value === '') return new Set(MOCK_AREAS)
  return new Set(
    value.split(',').map((raw) => {
      const area = raw.trim() as MockArea
      if (!MOCK_AREAS.includes(area)) throw new Error(`VITE_API_MOCKS: unknown area "${raw}". Use: ${MOCK_AREAS.join(', ')}`)
      return area
    }),
  )
}

function mockApi(): Plugin {
  return {
    name: 'thongyod-mock-api',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.envDir || process.cwd(), 'VITE_')
      const areas = mockedAreas(env.VITE_API_MOCKS)
      if (areas.size === 0) return
      server.config.logger.info(`[mock api] mocking: ${env.VITE_API_MOCKS ?? 'all'}`)
      server.middlewares.use('/api', async (req, res, next) => {
        const area = areaOf((req.originalUrl ?? '').split('?')[0])
        if (!area || !areas.has(area)) return next() // → proxy to the real backend
        try {
          const { getResponse } = await import('msw')
          const { handlers } = await server.ssrLoadModule('/src/mocks/handlers.ts')
          const origin = `http://${req.headers.host ?? 'localhost'}`
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined
          const request = new Request(new URL(req.originalUrl ?? req.url ?? '/', origin), {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
          })
          const response = await getResponse(handlers, request, { baseUrl: origin })
          if (!response) return next()
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) {
          // Query cancellation/React StrictMode may close the request while its body is read.
          // A disconnected browser is not a Vite server error or an HMR overlay.
          if (req.aborted) return
          next(error)
        }
      })
    },
  }
}

// https://vite.dev/config/
/**
 * sw.js for the real app (not the Pages demo, which runs MSW's worker): caches the app shell so the
 * phone can open Thongyod and show our own wake-up screen while the free Render server starts.
 */
/** One id per build: compiled into the app and written to /version.json, so an open page can tell it is out of date. */
const BUILD_ID = Date.now().toString(36)

function serviceWorker(): Plugin {
  let base = '/'
  return {
    name: 'thongyod-service-worker',
    apply: 'build',
    configResolved(config) { base = config.base },
    generateBundle(_, bundle) {
      if (process.env.VITE_DEPLOY_MOCKS === 'true') return
      const files = Object.keys(bundle).filter((name) => /\.(js|css|woff2)$/.test(name) && name.startsWith('assets/'))
      const build = Object.keys(bundle).filter((name) => name.endsWith('.js')).sort().join('|')
      let hash = 0
      for (const ch of build) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
      const source = readFileSync(new URL('./sw/sw.template.js', import.meta.url), 'utf8')
        .replace('__BUILD__', hash.toString(36))
        .replace('__BASE__', base)
        .replace('__PRECACHE__', JSON.stringify([`${base}index.html`, ...files.map((f) => base + f)]))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), mockApi(), serviceWorker()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: {
    // Bridge/editor writes on Windows may not fire file events; polling keeps hot reload reliable.
    watch: { usePolling: true, interval: 300 },
    // Real backend (NestJS, apps/api) when mocks are off or a path has no mock.
    // The room socket keeps its /api prefix (Socket.IO listens on that exact path) and needs WebSocket upgrades.
    proxy: {
      '/api/socket.io': { target: 'http://127.0.0.1:3000', ws: true },
      '/api': { target: 'http://127.0.0.1:3000', rewrite: (path) => path.replace(/^\/api/, '') },
    },
  },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
