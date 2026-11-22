import { useEffect } from 'react'

// Keep the screen on while a game sits in the middle of the circle (#126). The browser drops the lock when the tab
// is hidden, so it is asked for again whenever the page comes back. Not supported = nothing happens.
export function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let alive = true
    const ask = () => {
      if (document.visibilityState !== 'visible') return
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (alive) lock = l
          else void l.release()
        })
        .catch(() => {})
    }
    ask()
    document.addEventListener('visibilitychange', ask)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', ask)
      void lock?.release().catch(() => {})
    }
  }, [on])
}
