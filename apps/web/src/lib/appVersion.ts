// Keeps an open page on the build the server is serving. After a deploy the service worker can hand an
// already-open tab the old app, which then misreads new game data; checking /version.json and reloading
// (with the new service worker in place) avoids that. The seat in a room survives a reload.
declare const __BUILD_ID__: string

const CURRENT = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'
let checking = false

/** True when the server serves a different build than this page runs. */
async function outdated(): Promise<boolean> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return false
    const { build } = (await res.json()) as { build?: string }
    return !!build && build !== CURRENT
  } catch { return false }
}

/** Reload onto the new build: let the new service worker take over first (it skips waiting), then reload. */
export async function checkForNewVersion() {
  if (CURRENT === 'dev' || checking || !import.meta.env.PROD || import.meta.env.VITE_DEPLOY_MOCKS === 'true') return
  checking = true
  try {
    if (!(await outdated())) return
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.update().catch(() => undefined)
      await new Promise((done) => setTimeout(done, 1500))
    }
    // never loop: at most one automatic reload every 30 s
    const last = Number(sessionStorage.getItem('thongyod-reloaded') ?? 0)
    if (Date.now() - last < 30_000) return
    sessionStorage.setItem('thongyod-reloaded', String(Date.now()))
    window.location.reload()
  } catch { /* storage blocked: stay on this page */ } finally { checking = false }
}

/** Check now, when the page comes back to the front, and every two minutes. */
export function watchAppVersion() {
  void checkForNewVersion()
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void checkForNewVersion() })
  window.setInterval(() => void checkForNewVersion(), 120_000)
}
