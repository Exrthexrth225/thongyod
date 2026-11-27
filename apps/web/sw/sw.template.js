/* Thongyod service worker (generated at build time by vite.config.ts: serviceWorker()).
 * Job: open the app from this phone even while the free Render server is asleep, so we can show
 * our own "waking the server" screen instead of Render's. It never caches API calls or private data.
 * Real app only: the Pages demo uses MSW's worker and never registers this one. */
const BUILD = '__BUILD__'
const BASE = '__BASE__'
const PRECACHE = __PRECACHE__
const CACHE = `thongyod-shell-${BUILD}`
const KEEP = 2 // this build and the one before, so an open page can still load its lazy files
const SERVER_PATHS = /^\/(api|auth|media|health)(\/|$)/

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const meta = await caches.open('thongyod-meta')
    const saved = await meta.match('order')
    const order = saved ? await saved.json() : []
    const next = [CACHE, ...order.filter((name) => name !== CACHE)].slice(0, KEEP)
    await meta.put('order', new Response(JSON.stringify(next)))
    for (const name of await caches.keys()) if (name.startsWith('thongyod-shell-') && !next.includes(name)) await caches.delete(name)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  const path = url.pathname.slice(BASE.length - 1)
  if (SERVER_PATHS.test(path)) return
  if (request.mode === 'navigate') {
    // The app shell from this build, even when the server is asleep or offline.
    event.respondWith(caches.match(`${BASE}index.html`, { cacheName: CACHE }).then((hit) => hit ?? caches.match(`${BASE}index.html`)).then((hit) => hit ?? fetch(request)))
    return
  }
  if (path.startsWith('/assets/')) {
    // Hashed file names never change: cache first, remember new ones (pictures load on demand).
    event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') { const copy = response.clone(); void caches.open(CACHE).then((cache) => cache.put(request, copy)) }
      return response
    })))
  }
})
