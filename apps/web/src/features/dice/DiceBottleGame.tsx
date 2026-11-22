import bottleArt from '@/assets/party/bottle.webp'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dices, Smartphone, Wine } from 'lucide-react'
import { NumberStepper } from '@/components/common/NumberStepper'
import { SegmentedChoice } from '@/components/common/SegmentedChoice'
import { Button } from '@/components/ui/button'
import { useShake } from '@/features/fortune/useShake'
import { markDone } from '@/features/daily/daily'
import { useGameSettings } from '@/lib/gameSettings'
import { buzz, playSound, unlockSound } from '@/lib/sound'
import { useGameSound } from '@/lib/soundPrefs'
import { tintClass } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { Die } from './Die'
import { rollDice, spinBottle, total, tumble, type Face } from './logic'
import '@/components/games/games.css'

type Mode = 'dice' | 'bottle'
type Settings = { mode: Mode; dice: number; seats: number }
const DEFAULTS: Settings = { mode: 'dice', dice: 2, seats: 6 }
const fix = (raw: Partial<Settings>): Settings => ({
  mode: raw.mode === 'bottle' ? 'bottle' : 'dice',
  dice: Math.max(1, Math.min(3, Math.round(raw.dice ?? 2))),
  seats: raw.seats === 0 ? 0 : Math.max(2, Math.min(12, Math.round(raw.seats ?? 6))),
})

const ROLL_MS = 1100
const SPIN_MS = 3200
const DIE_TINTS = [5, 3, 2]
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ลูกเต๋า & ปั่นขวด: shake or tap. Results are decided first, then the 3D dice / bottle animate to them.
export function DiceBottleGame() {
  const { t } = useTranslation()
  const sound = useGameSound('dice')
  const [settings, setSettings] = useGameSettings<Settings>('dice', DEFAULTS, fix)
  const [faces, setFaces] = useState<Face[]>(() => Array.from({ length: settings.dice }, () => 1 as Face))
  const [rots, setRots] = useState(() => Array.from({ length: 3 }, () => ({ x: -20, y: 25 })))
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState(false)
  const [bottle, setBottle] = useState(0)
  const [seat, setSeat] = useState<number | null>(null)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const set = (patch: Partial<Settings>) => setSettings((s) => fix({ ...s, ...patch }))

  function roll() {
    if (busy) return
    unlockSound()
    const next = rollDice(settings.dice)
    setFaces(next)
    setRots((r) => r.map((rot, i) => (i < next.length ? tumble(rot, next[i], 2 + i) : rot)))
    setShown(false)
    setBusy(true)
    if (sound) playSound('roll')
    buzz(40)
    const wait = reducedMotion() ? 0 : ROLL_MS
    timer.current = window.setTimeout(() => {
      setBusy(false)
      setShown(true)
      if (sound) playSound('pop')
      markDone('tool')
    }, wait)
  }

  function spin() {
    if (busy) return
    unlockSound()
    const next = spinBottle(bottle, settings.seats)
    setBottle(next.rotation)
    setSeat(null)
    setShown(false)
    setBusy(true)
    if (sound) playSound('pass', 0.6)
    const wait = reducedMotion() ? 0 : SPIN_MS
    timer.current = window.setTimeout(() => {
      setBusy(false)
      setSeat(next.seat)
      setShown(true)
      if (sound) playSound('end')
      buzz(50)
      markDone('tool')
    }, wait)
  }

  const go = settings.mode === 'dice' ? roll : spin
  const shake = useShake(go, true)

  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      <SegmentedChoice<Mode>
        label={t('games.dice.modeLabel')}
        value={settings.mode}
        disabled={busy}
        onChange={(mode) => {
          set({ mode })
          setShown(false)
        }}
        options={[
          { value: 'dice', label: t('games.dice.dice'), icon: Dices },
          { value: 'bottle', label: t('games.dice.bottle'), icon: Wine },
        ]}
      />

      {settings.mode === 'dice' ? (
        <>
          <button
            type="button"
            onClick={roll}
            disabled={busy}
            aria-busy={busy}
            aria-label={t('games.dice.roll')}
            className={cn('relative flex min-h-[42dvh] flex-col items-center justify-center gap-6 rounded-3xl p-6', tintClass(4))}
          >
            <div className="flex flex-wrap items-center justify-center gap-6">
              {faces.map((_, i) => (
                <Die key={i} rolling={busy} rotation={rots[i]} faceClass={cn('bg-card', i === 0 ? 'text-foreground' : tintClass(DIE_TINTS[i]).split(' ')[1])} />
              ))}
            </div>
            <span className="min-h-12 text-center" role="status" aria-live="polite">
              {shown && (
                <span className="game-pop block">
                  <span className="block text-5xl font-medium tabular-nums">{faces.length > 1 ? total(faces) : faces[0]}</span>
                  {faces.length > 1 && <span className="text-sm opacity-80">{faces.join(' + ')}</span>}
                </span>
              )}
            </span>
          </button>
          <div className="flex items-center justify-between rounded-3xl bg-card p-3">
            <span className="text-sm font-medium">{t('games.dice.howMany')}</span>
            <NumberStepper
              label={t('games.dice.howMany')}
              value={settings.dice}
              min={1}
              max={3}
              disabled={busy}
              onChange={(dice) => {
                set({ dice })
                setFaces(Array.from({ length: dice }, (_, i) => faces[i] ?? (1 as Face)))
                setShown(false)
              }}
            />
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={spin}
            disabled={busy}
            aria-busy={busy}
            aria-label={t('games.dice.spin')}
            className={cn('relative mx-auto grid aspect-square w-full max-w-[22rem] place-items-center rounded-full', tintClass(2))}
          >
            {settings.seats >= 2 &&
              Array.from({ length: settings.seats }, (_, i) => {
                const a = ((i * 360) / settings.seats - 90) * (Math.PI / 180)
                return (
                  <span
                    key={i}
                    className={cn(
                      'absolute grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-sm font-medium transition-transform',
                      seat === i ? 'game-pop scale-125 bg-primary text-primary-foreground' : 'bg-background/80',
                    )}
                    style={{ left: `${50 + 43 * Math.cos(a)}%`, top: `${50 + 43 * Math.sin(a)}%` }}
                  >
                    {i + 1}
                  </span>
                )
              })}
            <img src={bottleArt} alt="" draggable={false} className="bottle-spin aspect-square h-[62%] object-contain" style={{ transform: `rotate(${bottle}deg)` }} />
          </button>
          <p className="min-h-8 text-center text-xl font-medium" role="status" aria-live="polite">
            {shown && seat !== null && <span className="game-pop inline-block">{t('games.dice.pointsAt', { n: seat + 1 })}</span>}
          </p>
          <div className="flex items-center justify-between rounded-3xl bg-card p-3">
            <span className="min-w-0 text-sm">
              <span className="block font-medium">{t('games.dice.seats')}</span>
              <span className="block text-xs text-muted-foreground">{t('games.dice.seatsHint')}</span>
            </span>
            <NumberStepper label={t('games.dice.seats')} value={settings.seats} min={0} max={12} disabled={busy} onChange={(seats) => set({ seats: seats === 1 ? (settings.seats === 0 ? 2 : 0) : seats })} />
          </div>
        </>
      )}

      <Button size="lg" className="h-14 text-lg" disabled={busy} onClick={go}>
        {settings.mode === 'dice' ? <Dices data-icon="inline-start" /> : <Wine data-icon="inline-start" />}
        {settings.mode === 'dice' ? t('games.dice.roll') : t('games.dice.spin')}
      </Button>
      {shake.support === 'needs-permission' && (
        <Button variant="outline" onClick={() => void shake.requestPermission()}>
          <Smartphone data-icon="inline-start" />
          {t('games.dice.enableShake')}
        </Button>
      )}
      {shake.support === 'on' && <p className="text-center text-xs text-muted-foreground">{t('games.dice.shakeHint')}</p>}
    </div>
  )
}
