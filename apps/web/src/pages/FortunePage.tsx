import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { History, Share2, UserPlus, Vibrate } from 'lucide-react'
import { HowToButton } from '@/components/games/HowToPlay'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, buttonVariants } from '@/components/ui/button'
import { FortuneCard } from '@/features/fortune/FortuneCard'
import { FortuneCup } from '@/features/fortune/FortuneCup'
import { bangkokDayKey, drawForToday, fortuneOf, levelOf, nextDrawAt, type Draw } from '@/features/fortune/logic'
import { formatTimeUntil } from '@/lib/date'
import { forgetTodayForTesting, loadDraw, saveDraw } from '@/features/fortune/storage'
import { useShake } from '@/features/fortune/useShake'
import { celebrate } from '@/lib/celebrate'
import { SoundToggle } from '@/components/common/SoundToggle'
import { playSound, unlockSound } from '@/lib/sound'
import { useGameSound } from '@/lib/soundPrefs'
import { appUrl, lineShareUrl } from '@/lib/share'
import { cn } from '@/lib/utils'

type Phase = 'ready' | 'shaking' | 'stick' | 'card'
/** Match fortune.css: the rattle, then the stick sliding out and landing. */
const SHAKE_MS = 1100
const STICK_MS = 1900
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// เซียมซี (DECISIONS #51): shake (or tap) → the cup shakes → a stick pops out → the fortune card.
export function FortunePage() {
  const { t } = useTranslation()
  const [draw, setDraw] = useState<Draw | null>(() => {
    const saved = loadDraw()
    return saved && saved.day === bangkokDayKey(new Date()) ? saved : null
  })
  const [phase, setPhase] = useState<Phase>(draw ? 'card' : 'ready')
  const [alreadyToday, setAlreadyToday] = useState(draw !== null)
  const timers = useRef<number[]>([])
  const sound = useGameSound('fortune')

  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])

  function reveal(next: Draw) {
    setPhase('card')
    const great = levelOf(next.stick) === 'great'
    if (sound) playSound(great ? 'end' : 'correct')
    if (great) celebrate()
  }

  function shake() {
    if (phase === 'shaking' || phase === 'stick') {
      // Tap during the animation = skip to the card.
      timers.current.forEach(window.clearTimeout)
      if (draw) reveal(draw)
      return
    }
    if (phase !== 'ready') return
    unlockSound()
    const { draw: next } = drawForToday(new Date(), loadDraw())
    saveDraw(next)
    setDraw(next)
    navigator.vibrate?.([40, 60, 40])
    if (reducedMotion()) {
      reveal(next)
      return
    }
    setPhase('shaking')
    // Rattle while the cup shakes, a pop when the stick jumps out (sound on by default, #46).
    const rattle = sound ? [0, 110, 220, 330, 440, 550, 660, 770, 880].map((ms) => window.setTimeout(() => playSound('roll', 0.9), ms)) : []
    timers.current = [
      ...rattle,
      window.setTimeout(() => {
        setPhase('stick')
        if (sound) playSound('flip')
      }, SHAKE_MS),
      // The stick lands: a soft clack and sparkles.
      window.setTimeout(() => sound && playSound('pop'), SHAKE_MS + 1100),
      window.setTimeout(() => reveal(next), SHAKE_MS + STICK_MS),
    ]
  }

  const { support, requestPermission } = useShake(shake, phase === 'ready')

  const fortune = draw ? fortuneOf(draw.stick) : undefined
  const shareText =
    draw && fortune
      ? t('fortune.shareText', {
          n: draw.stick,
          level: t(`fortune.levels.${levelOf(draw.stick)}`),
          poem: fortune.poem.join(' '),
          study: fortune.study,
          money: fortune.money,
          love: fortune.love,
          lucky: fortune.lucky,
        })
      : ''

  return (
    <>
      <PageHeader
        title={t('fortune.title')}
        subtitle={t('fortune.subtitle')}
        backTo="/games"
        action={
          <span className="flex items-center">
            <HowToButton game="fortune" />
            <SoundToggle game="fortune" />
            <Link to="/fortune/history" className={buttonVariants({ variant: 'ghost', size: 'icon' })} aria-label={t('fortune.history')}>
            <History className="size-5" />
            </Link>
          </span>
        }
      />

      <div className="flex flex-col items-center gap-5 px-4 pb-8">
        {phase !== 'card' ? (
          <>
            {/* Night-temple block (#97 look). pt-20 = room for the stick's jump above the cup, so it is never cut off. */}
            <div className="fortune-temple mt-1 flex w-full justify-center rounded-[32px] pt-20">
              <button type="button" onClick={shake} aria-label={t('fortune.cylinder')} className="touch-manipulation">
                <FortuneCup state={phase === 'shaking' ? 'shaking' : phase === 'stick' ? 'out' : 'idle'} stick={draw?.stick} />
              </button>
            </div>
            <Button size="lg" className="w-full" onClick={shake}>
              <Vibrate data-icon="inline-start" />
              {t('fortune.shake')}
            </Button>
            <p className="text-center text-sm text-muted-foreground">{t('fortune.hint')}</p>
            {support === 'needs-permission' && (
              <Button variant="outline" onClick={() => void requestPermission()}>
                {t('fortune.enableShake')}
              </Button>
            )}
            {support === 'denied' && <p className="text-center text-xs text-muted-foreground">{t('fortune.shakeOff')}</p>}
          </>
        ) : (
          draw && (
            <>
              <FortuneCup state="rest" stick={draw.stick} className="-my-12 scale-[0.6]" />
              {alreadyToday && <p className="-mt-2 text-center text-sm font-medium text-pretty">{t('fortune.alreadyToday')}</p>}
              <div className="mt-3 w-full">
                <FortuneCard stick={draw.stick} />
              </div>
              <p className="text-center text-sm text-muted-foreground">{t('fortune.comeBack', { when: formatTimeUntil(nextDrawAt(new Date())) })}</p>
              <a href={lineShareUrl(shareText)} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
                <Share2 data-icon="inline-start" />
                {t('fortune.share')}
              </a>
              <a
                href={lineShareUrl(`${t('fortune.inviteText')}\n${appUrl('/fortune')}`)}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}
              >
                <UserPlus data-icon="inline-start" />
                {t('fortune.invite')}
              </a>
              {/* TEMPORARY test button for Earth (2026-11-22). Remove before release: see HANDOFF "Remove before release". */}
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  forgetTodayForTesting()
                  setDraw(null)
                  setAlreadyToday(false)
                  setPhase('ready')
                }}
              >
                {t('fortune.testRedraw')}
              </Button>
            </>
          )
        )}
      </div>
    </>
  )
}
