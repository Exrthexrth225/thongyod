import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { History, Scissors, ScrollText, Share2, UserPlus, Vibrate } from 'lucide-react'
import { HowToButton } from '@/components/games/HowToPlay'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, buttonVariants } from '@/components/ui/button'
import { FortuneCard } from '@/features/fortune/FortuneCard'
import { FortuneCup } from '@/features/fortune/FortuneCup'
import { bangkokDayKey, fortuneOf, levelOf, nextDrawAt, shakeOnce, throwPoe, todaysDraw, type Draw, type Poe, type ShakeResult } from '@/features/fortune/logic'
import { formatTimeUntil } from '@/lib/date'
import { forgetTodayForTesting, loadDraw, markTorn, saveDraw } from '@/features/fortune/storage'
import { MoonBlocks } from '@/features/fortune/MoonBlocks'
import { useShake } from '@/features/fortune/useShake'
import { celebrate } from '@/lib/celebrate'
import { SoundToggle } from '@/components/common/SoundToggle'
import { playSound, unlockSound } from '@/lib/sound'
import { useGameSound } from '@/lib/soundPrefs'
import { appUrl, lineShareUrl } from '@/lib/share'
import { cn } from '@/lib/utils'

type Phase = 'ready' | 'shaking' | 'two' | 'stick' | 'poe' | 'throwing' | 'answer' | 'card' | 'tearing'
/** Match fortune.css: the rattle, the stick sliding out and landing, the blocks in the air, the slip tearing. */
const SHAKE_MS = 1100
const STICK_MS = 1900
const THROW_MS = 1000
const TEAR_MS = 1150
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// เซียมซี (DECISIONS #51, #131), like at a shrine: make a wish and shake → one stick falls (two = put them back and
// shake again) → throw the moon blocks to ask if it is yours → read the slip. A bad slip can be torn and left here.
export function FortunePage() {
  const { t } = useTranslation()
  const [draw, setDraw] = useState<Draw | null>(() => todaysDraw(new Date(), loadDraw()))
  const [phase, setPhase] = useState<Phase>(draw ? 'card' : 'ready')
  const [alreadyToday, setAlreadyToday] = useState(draw !== null)
  /** The stick that fell and is being asked about (not today's reading until the blocks say yes). */
  const [candidate, setCandidate] = useState<number | null>(null)
  const [poe, setPoe] = useState<Poe | null>(null)
  const throws = useRef(0)
  const timers = useRef<number[]>([])
  const sound = useGameSound('fortune')

  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])
  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms))
  const clearTimers = () => {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
  }

  /** Where a shake ends: two sticks on the floor, or one stick waiting for the moon blocks. */
  function settle(next: ShakeResult) {
    clearTimers()
    setPhase(next.kind === 'two' ? 'two' : 'poe')
  }

  function shake() {
    if (phase === 'shaking' || phase === 'stick') {
      // Tap during the animation = skip to where it lands.
      settle(candidate === null ? { kind: 'two' } : { kind: 'one', stick: candidate })
      return
    }
    if (phase !== 'ready' && phase !== 'two') return
    unlockSound()
    const next = shakeOnce()
    setCandidate(next.kind === 'one' ? next.stick : null)
    setPoe(null)
    throws.current = 0
    navigator.vibrate?.([40, 60, 40])
    if (reducedMotion()) return settle(next)
    setPhase('shaking')
    if (sound) [0, 110, 220, 330, 440, 550, 660, 770, 880].forEach((ms) => later(ms, () => playSound('roll', 0.9)))
    later(SHAKE_MS, () => {
      setPhase('stick')
      if (sound) playSound('flip')
    })
    later(SHAKE_MS + 1100, () => sound && playSound('pop'))
    later(SHAKE_MS + STICK_MS, () => settle(next))
  }

  function throwBlocks() {
    if (candidate === null) return
    clearTimers()
    const result = throwPoe(throws.current)
    throws.current += 1
    setPoe(null)
    setPhase('throwing')
    if (sound) playSound('roll', 0.7)
    later(reducedMotion() ? 0 : THROW_MS, () => {
      setPoe(result)
      setPhase('answer')
      if (sound) playSound(result === 'yes' ? 'correct' : 'pop')
    })
  }

  function read() {
    if (candidate === null) return
    const next: Draw = { day: bangkokDayKey(new Date()), stick: candidate }
    saveDraw(next)
    setDraw(next)
    setAlreadyToday(false)
    setPhase('card')
    const good = levelOf(next.stick) === 'good'
    if (sound) playSound(good ? 'end' : 'correct')
    if (good) celebrate()
  }

  function tear() {
    if (!draw) return
    setPhase('tearing')
    navigator.vibrate?.(60)
    later(reducedMotion() ? 0 : TEAR_MS, () => {
      markTorn()
      setDraw({ ...draw, torn: true })
      setPhase('card')
    })
  }

  const { support, requestPermission } = useShake(shake, phase === 'ready' || phase === 'two')

  const fortune = draw ? fortuneOf(draw.stick) : undefined
  const bad = draw ? levelOf(draw.stick) === 'bad' : false
  const shareText =
    draw && fortune
      ? t('fortune.shareText', {
          n: draw.stick,
          level: t(`fortune.levels.${levelOf(draw.stick)}`),
          verse: [0, 1, 2, 3].map((b) => fortune.verse.slice(b * 4, b * 4 + 4).join(' ')).join('\n'),
          meaning: fortune.meaning,
        })
      : ''
  const cupState = phase === 'shaking' ? 'shaking' : phase === 'stick' ? 'out' : phase === 'ready' ? 'idle' : 'rest'

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
        {phase !== 'card' && phase !== 'tearing' ? (
          <>
            {/* pt-20 = room for the stick's jump above the cup, so it is never cut off. */}
            <div className="fortune-temple mt-1 flex w-full flex-col items-center rounded-[32px] pt-20">
              <button type="button" onClick={shake} aria-label={t('fortune.cylinder')} className="touch-manipulation">
                <FortuneCup state={cupState} stick={candidate ?? undefined} two={candidate === null && phase !== 'ready'} />
              </button>
            </div>
            {(phase === 'ready' || phase === 'shaking' || phase === 'stick') && (
              <>
                <Button size="lg" className="w-full" onClick={shake}>
                  <Vibrate data-icon="inline-start" />
                  {t('fortune.shake')}
                </Button>
                <p className="text-center text-sm text-muted-foreground text-pretty">{t('fortune.hint')}</p>
                {support === 'needs-permission' && (
                  <Button variant="outline" onClick={() => void requestPermission()}>
                    {t('fortune.enableShake')}
                  </Button>
                )}
                {support === 'denied' && <p className="text-center text-xs text-muted-foreground">{t('fortune.shakeOff')}</p>}
              </>
            )}
            {phase === 'two' && (
              <>
                <p className="text-center">
                  <b className="block font-heading text-lg">{t('fortune.two.title')}</b>
                  <span className="text-sm text-muted-foreground">{t('fortune.two.text')}</span>
                </p>
                <Button size="lg" className="w-full" onClick={shake}>
                  <Vibrate data-icon="inline-start" />
                  {t('fortune.two.again')}
                </Button>
              </>
            )}
            {phase === 'poe' && candidate !== null && (
              <>
                <p className="text-center font-heading text-lg font-bold text-balance">{t('fortune.poe.ask', { n: candidate })}</p>
                <Button size="lg" className="w-full" onClick={throwBlocks}>
                  {t('fortune.poe.throw')}
                </Button>
              </>
            )}
            {(phase === 'throwing' || phase === 'answer') && <MoonBlocks result={phase === 'answer' ? poe : null} className="-mt-2" />}
            {phase === 'answer' && poe === 'yes' && (
              <Button size="lg" className="w-full" onClick={read}>
                <ScrollText data-icon="inline-start" />
                {t('fortune.poe.read')}
              </Button>
            )}
            {phase === 'answer' && poe === 'no' && (
              <Button size="lg" className="w-full" onClick={() => setPhase('ready')}>
                <Vibrate data-icon="inline-start" />
                {t('fortune.poe.reshake')}
              </Button>
            )}
            {phase === 'answer' && poe === 'laugh' && (
              <Button size="lg" className="w-full" onClick={throwBlocks}>
                {t('fortune.poe.again')}
              </Button>
            )}
          </>
        ) : (
          draw && (
            <>
              <FortuneCup state="rest" stick={draw.stick} className="-my-12 scale-[0.6]" />
              {alreadyToday && <p className="-mt-2 text-center text-sm font-medium text-pretty">{t('fortune.alreadyToday')}</p>}
              {draw.torn ? (
                <p className="mt-3 rounded-3xl bg-card px-5 py-6 text-center">
                  <b className="block font-heading text-lg">{t('fortune.torn')}</b>
                  <span className="text-sm text-muted-foreground">{t('fortune.tornHint')}</span>
                </p>
              ) : phase === 'tearing' ? (
                <div className="fortune-tear mt-3 w-full" aria-hidden="true">
                  <div className="fortune-tear-left">
                    <FortuneCard stick={draw.stick} />
                  </div>
                  <div className="fortune-tear-right">
                    <FortuneCard stick={draw.stick} />
                  </div>
                </div>
              ) : (
                <div className="mt-3 w-full">
                  <FortuneCard stick={draw.stick} />
                </div>
              )}
              {bad && !draw.torn && phase === 'card' && (
                <>
                  <Button size="lg" variant="secondary" className="w-full" onClick={tear}>
                    <Scissors data-icon="inline-start" />
                    {t('fortune.tear')}
                  </Button>
                  <p className="-mt-3 text-center text-xs text-muted-foreground text-pretty">{t('fortune.tearHint')}</p>
                </>
              )}
              <p className="text-center text-sm text-muted-foreground">{t('fortune.comeBack', { when: formatTimeUntil(nextDrawAt(new Date())) })}</p>
              {!draw.torn && (
                <a href={lineShareUrl(shareText)} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
                  <Share2 data-icon="inline-start" />
                  {t('fortune.share')}
                </a>
              )}
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
                  setCandidate(null)
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
