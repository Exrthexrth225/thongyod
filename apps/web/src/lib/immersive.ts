import { useSyncExternalStore } from 'react'

// Full screen while playing (#123): the game's header shrinks to a slim bar (PageHeader), and the browser is asked for
// real full screen where it can (Android, desktop). iPhone Safari cannot do that for a page; the app added to the
// home screen already has no browser bars. Leaving the game ends it.
let on = false
let real = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** The browser can hide its own bars (false on iPhone Safari). */
export const canRealFullscreen = () => typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function' && document.fullscreenEnabled !== false

export function setImmersive(next: boolean) {
  if (next === on) return
  on = next
  notify()
  const el = document.documentElement
  if (next) {
    const ask = el.requestFullscreen?.bind(el)
    if (ask) {
      ask({ navigationUI: 'hide' })
        .then(() => (real = true))
        .catch(() => (real = false))
    }
  } else if (real && document.fullscreenElement) {
    real = false
    void document.exitFullscreen?.().catch(() => {})
  }
}

if (typeof document !== 'undefined') {
  // The system "back" / Esc left real full screen: leave ours too.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && real) {
      real = false
      setImmersive(false)
    }
  })
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useImmersive = () => useSyncExternalStore(subscribe, () => on, () => false)
