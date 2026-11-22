import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, CircleHelp, FlaskConical, Maximize, Minimize, Pin, PinOff, Play, Target } from 'lucide-react'
import { SoundToggle } from '@/components/common/SoundToggle'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { gameById, type GameId } from '@/config/games'
import { HOW_TO } from '@/config/howTo'
import { tintClass } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { markGameOpened } from '@/features/firstRun/firstRun'
import { noteOpened, pinStore, togglePin } from '@/features/games/library'
import { canRealFullscreen, setImmersive, useImmersive } from '@/lib/immersive'
import { isStandalone } from '@/lib/standalone'
import { toastManager } from '@/lib/toast'
import './games.css'

type SheetProps = { game: GameId; open: boolean; onOpenChange: (open: boolean) => void }

// "วิธีเล่น" tutorial: the goal, then one big illustrated step at a time (back / next), last step = start playing.
export function HowToPlaySheet({ game, open, onOpenChange }: SheetProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  const icons = HOW_TO[game] ?? []
  const tint = gameById(game).tint
  const total = icons.length
  const Icon = icons[step] ?? CircleHelp
  const key = `games.howto.${game}.s${step + 1}` as 'games.howto.spy.s1'

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setStep(0)
      }}
      title={t('games.howto.title', { game: t(`games.list.${game}.title`) })}
    >
      <div className="flex flex-col gap-4 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <p className="flex items-start gap-2 rounded-2xl bg-muted p-3 text-sm">
          <Target className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <b className="font-medium">{t('games.howto.goalLabel')}: </b>
            {t(`games.howto.${game}.goal` as 'games.howto.spy.goal')}
          </span>
        </p>
        <div key={step} className="game-card-in flex flex-col items-center gap-3 py-2 text-center" aria-live="polite">
          <span className={cn('grid size-24 place-items-center rounded-full', tintClass(tint))}>
            <Icon className="game-breathe size-12" aria-hidden="true" />
          </span>
          <span className="text-xs text-muted-foreground">{t('games.howto.stepOf', { n: step + 1, total })}</span>
          <span className="text-2xl font-medium">{t(`${key}.title`)}</span>
          <span className="max-w-xs text-base text-muted-foreground">{t(`${key}.text`)}</span>
        </div>
        <div className="flex justify-center gap-1.5" aria-hidden="true">
          {icons.map((_, i) => (
            <span key={i} className={cn('h-2 rounded-full transition-all', i === step ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30')} />
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="lg" disabled={step === 0} onClick={() => setStep((s) => s - 1)} aria-label={t('games.previous')}>
            <ChevronLeft />
          </Button>
          {step < total - 1 ? (
            <Button size="lg" className="flex-1" onClick={() => setStep((s) => s + 1)}>
              {t('games.next')}
              <ChevronRight data-icon="inline-end" />
            </Button>
          ) : (
            <Button
              size="lg"
              className="flex-1"
              onClick={() => {
                onOpenChange(false)
                setStep(0)
              }}
            >
              <Play data-icon="inline-start" />
              {t('games.howto.gotIt')}
            </Button>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}

/** "?" button that opens the tutorial. */
export function HowToButton({ game }: { game: GameId }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" size="icon" aria-label={t('games.howto.button')} onClick={() => setOpen(true)}>
        <CircleHelp />
      </Button>
      <HowToPlaySheet game={game} open={open} onOpenChange={setOpen} />
    </>
  )
}

/** "ช่วงทดสอบ" line under the header of a game that is playable but not finished (#124). */
export function BetaNote({ game }: { game: GameId }) {
  const { t } = useTranslation()
  if (gameById(game).status !== 'beta') return null
  return (
    <p className="mx-4 mb-3 flex items-start gap-2 rounded-2xl bg-tone-warning px-3 py-2 text-sm text-tone-warning-foreground">
      <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {t('games.betaNote')}
    </p>
  )
}

/** Pin this game to the top of the games list (#123). */
export function PinButton({ game }: { game: GameId }) {
  const { t } = useTranslation()
  const pinned = pinStore.use().includes(game)
  return (
    <Button variant="ghost" size="icon" aria-pressed={pinned} aria-label={t(pinned ? 'games.unpin' : 'games.pin')} onClick={() => pinStore.set(togglePin(pinStore.get(), game))}>
      {pinned ? <PinOff /> : <Pin />}
    </Button>
  )
}

/** Full screen while playing (#123); leaving the game turns it off. */
export function FullscreenButton() {
  const { t } = useTranslation()
  const on = useImmersive()
  useEffect(() => () => setImmersive(false), [])
  return (
    <Button variant="ghost" size="icon" aria-pressed={on} aria-label={t(on ? 'games.fullscreenOff' : 'games.fullscreen')} onClick={() => {
        // iPhone Safari cannot hide its bars for a page: say once how to get the real thing.
        if (!on && !canRealFullscreen() && !isStandalone()) toastManager.add({ title: t('games.fullscreenIos') })
        setImmersive(!on)
      }}>
      {on ? <Minimize /> : <Maximize />}
    </Button>
  )
}

/** Right side of every game's PageHeader: วิธีเล่น, sound, pin, full screen. */
export function GameHeaderActions({ game, sound = true }: { game: GameId; sound?: boolean }) {
  // Every game page shows these actions, so this is where "tried a game" is noted for the first-run card (#96)
  // and the game goes into "เล่นล่าสุด" (#123).
  useEffect(() => {
    markGameOpened()
    noteOpened(game)
  }, [game])
  return (
    <span className="-mr-2 flex items-center">
      <HowToButton game={game} />
      {sound && <SoundToggle game={game} />}
      <PinButton game={game} />
      <FullscreenButton />
    </span>
  )
}
