import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MoonStar, RotateCcw } from 'lucide-react'
import { queryClient } from '@/api/queryClient'
import { Button } from '@/components/ui/button'
import { serverAwake } from '@/lib/serverAwake'

type State = 'checking' | 'awake' | 'waking' | 'failed'

/** Only the real app sleeps (free Render instance). The demo and dev servers are always up. */
const needsCheck = () => import.meta.env.PROD && import.meta.env.VITE_DEPLOY_MOCKS !== 'true'

const SHOW_AFTER_MS = 1200
const POLL_MS = 2000
const GIVE_UP_MS = 150_000

/**
 * Opens the app at once (from the service worker's cache) and, if the server does not answer
 * quickly, covers it with our own "waking the server" screen until it does.
 */
export function ServerWake({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [state, setState] = useState<State>(() => (needsCheck() ? 'checking' : 'awake'))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!needsCheck()) return
    let stopped = false
    const started = Date.now()
    const show = window.setTimeout(() => { if (!stopped) setState((s) => (s === 'checking' ? 'waking' : s)) }, SHOW_AFTER_MS)
    const loop = async (first: boolean) => {
      if (stopped) return
      if (await serverAwake()) {
        if (stopped) return
        setState('awake')
        // Anything that failed while asleep loads again.
        if (!first) void queryClient.invalidateQueries()
        return
      }
      if (stopped) return
      if (Date.now() - started > GIVE_UP_MS) { setState('failed'); return }
      window.setTimeout(() => void loop(false), POLL_MS)
    }
    void loop(true)
    return () => { stopped = true; window.clearTimeout(show) }
  }, [attempt])

  return (
    <>
      {children}
      {(state === 'waking' || state === 'failed') && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background px-8 text-center" role="status" aria-live="polite">
          <MoonStar className="game-breathe size-16 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-extrabold">{state === 'failed' ? t('wake.failed') : t('wake.title')}</h1>
          <p className="max-w-sm text-sm text-balance text-muted-foreground">{state === 'failed' ? t('wake.failedHint') : t('wake.hint')}</p>
          {state === 'waking' && <div className="h-1.5 w-48 overflow-hidden rounded-full bg-muted"><div className="wake-bar h-full w-1/3 rounded-full bg-primary" /></div>}
          {state === 'failed' && <Button onClick={() => { setState('waking'); setAttempt((n) => n + 1) }}><RotateCcw data-icon="inline-start" />{t('wake.retry')}</Button>}
        </div>
      )}
    </>
  )
}
