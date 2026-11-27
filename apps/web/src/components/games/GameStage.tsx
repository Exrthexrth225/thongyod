import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Maximize, Minimize, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type FullscreenDoc = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => Promise<void> | void }
type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }

const fullscreenElement = () => document.fullscreenElement ?? (document as FullscreenDoc).webkitFullscreenElement ?? null
const canFullscreen = () => typeof document !== 'undefined' && Boolean(document.fullscreenEnabled || (document as FullscreenDoc).webkitFullscreenEnabled)

type Props = {
  /** Accessible name of the exit button, e.g. "ออกจากจอกลาง". */
  exitLabel: string
  onExit: () => void
  /** Short text beside the exit button (room code, round). */
  title?: ReactNode
  /** Extra round buttons on the right of the top bar. */
  actions?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * Full-screen layout for a game in progress (Board Screens and multi-phone games): no tab bar,
 * safe-area padding, and always a visible way out. The Fullscreen API is only an extra: it starts
 * from a tap, may be refused (iPhone Safari has none) and the user can leave it at any time.
 */
export function GameStage({ exitLabel, onExit, title, actions, className, children }: Props) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [full, setFull] = useState(false)
  const supported = canFullscreen()

  useEffect(() => {
    const sync = () => setFull(fullscreenElement() === ref.current)
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
      if (fullscreenElement()) void exitFullscreen()
    }
  }, [])

  async function exitFullscreen() {
    const doc = document as FullscreenDoc
    try { await (document.exitFullscreen ? document.exitFullscreen() : doc.webkitExitFullscreen?.()) } catch { /* already left */ }
  }

  async function toggle() {
    const el = ref.current as FullscreenEl | null
    if (!el) return
    if (fullscreenElement()) { await exitFullscreen(); return }
    try { await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.()) } catch { /* refused: the CSS layout already fills the screen */ }
  }

  return (
    <div
      ref={ref}
      className={cn(
        'fixed inset-0 z-40 flex flex-col overflow-hidden bg-background',
        'pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
        className,
      )}
    >
      {/* hidden when the page draws its own top bar (I'm the Boss! table screen) */}
      <div className="game-stage-bar flex shrink-0 items-center gap-2 px-3 py-2">
        <Button variant="ghost" size="icon" className="rounded-full bg-card" aria-label={exitLabel} onClick={() => { void exitFullscreen(); onExit() }}>
          <X className="size-5" aria-hidden="true" />
        </Button>
        <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{title}</div>
        {actions}
        {supported && (
          <Button variant="ghost" size="icon" className="rounded-full bg-card" aria-label={full ? t('rooms.board.exitFullscreen') : t('rooms.board.fullscreen')} onClick={() => void toggle()}>
            {full ? <Minimize className="size-5" aria-hidden="true" /> : <Maximize className="size-5" aria-hidden="true" />}
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
