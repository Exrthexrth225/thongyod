import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flag, Plus, RotateCcw, Trophy, UsersRound, X } from 'lucide-react'
import { SectionHeader } from '@/components/common/SectionHeader'
import { SegmentedChoice } from '@/components/common/SegmentedChoice'
import { BottomAction } from '@/components/games/BottomAction'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { markDone } from '@/features/daily/daily'
import { confettiFrom } from '@/lib/confetti'
import { playSound, unlockSound } from '@/lib/sound'
import { useGameSound } from '@/lib/soundPrefs'
import { cn } from '@/lib/utils'
import { MAX_RUNNERS, MIN_RUNNERS, RACER_IDS, makeRace, positionAt, type Race } from './logic'
import { RaceRunner } from './RaceRunner'
import { loadRunners, saveRunners, type Runner } from './storage'
import './race.css'

type Phase = 'setup' | 'countdown' | 'running' | 'result'
type Goal = 'first' | 'last'

/** Race time 1.0 (the winner's finish) takes this long on screen at normal speed. */
const UNIT_MS = 7000
/** Close to the line the race goes into slow motion. */
const SLOWMO_FROM = 0.86
const SLOWMO_RATE = 0.4
const NAME_MAX = 12
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// สัตว์วิ่งแข่ง (DECISIONS #103): pick who races, 3-2-1, they run; the order was decided fairly at the start and
// the run is staged so the lead changes and the end is close. "ที่ 1 ชนะ" or "ที่โหล่โดน".
export function RaceGame() {
  const { t } = useTranslation()
  const sound = useGameSound('race')
  const [runners, setRunners] = useState<Runner[]>(
    () =>
      loadRunners() ?? [
        { name: t('race.defaultName', { n: 1 }), racer: 'cat' },
        { name: t('race.defaultName', { n: 2 }), racer: 'shiba' },
      ],
  )
  const [goal, setGoal] = useState<Goal>('first')
  const [phase, setPhase] = useState<Phase>('setup')
  const [count, setCount] = useState(3)
  const [race, setRace] = useState<Race | null>(null)
  const [finished, setFinished] = useState<number[]>([])
  const runnerEls = useRef<(HTMLDivElement | null)[]>([])
  const trackEls = useRef<(HTMLDivElement | null)[]>([])
  const frame = useRef(0)
  const timers = useRef<number[]>([])
  const skip = useRef(false)

  useEffect(() => saveRunners(runners), [runners])
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      timers.current.forEach((id) => window.clearTimeout(id))
    },
    [],
  )

  const valid = runners.length >= MIN_RUNNERS && runners.every((r) => r.name.trim() !== '')

  function update(i: number, patch: Partial<Runner>) {
    setRunners((list) => list.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  }
  function nextFreeRacer(i: number) {
    const used = new Set(runners.map((r) => r.racer))
    const start = RACER_IDS.indexOf(runners[i].racer)
    for (let k = 1; k <= RACER_IDS.length; k++) {
      const id = RACER_IDS[(start + k) % RACER_IDS.length]
      if (!used.has(id)) return update(i, { racer: id })
    }
  }
  function addRunner() {
    const used = new Set(runners.map((r) => r.racer))
    const racer = RACER_IDS.find((id) => !used.has(id))
    if (!racer || runners.length >= MAX_RUNNERS) return
    setRunners((list) => [...list, { name: t('race.defaultName', { n: list.length + 1 }), racer }])
  }

  function start() {
    if (!valid) return
    unlockSound()
    const next = makeRace(runners.length)
    setRace(next)
    setFinished([])
    skip.current = false
    runnerEls.current.forEach((el) => el && (el.style.transform = 'translateX(0)'))
    if (reducedMotion()) return finish(next, next.order)
    setPhase('countdown')
    setCount(3)
    timers.current = [0, 700, 1400].map((ms, k) =>
      window.setTimeout(() => {
        setCount(3 - k)
        if (sound) playSound('countdown')
      }, ms),
    )
    timers.current.push(
      window.setTimeout(() => {
        if (sound) playSound('go')
        setPhase('running')
        run(next)
      }, 2100),
    )
  }

  /** Moves the runners frame by frame (transform only, straight on the DOM: no re-render per frame). */
  function run(r: Race) {
    let simT = 0
    let last = -1
    const done: number[] = []
    const end = Math.max(...r.paths.map((p) => p.finish))
    const tick = (now: number) => {
      if (last < 0) last = now
      const dt = Math.min(64, now - last)
      last = now
      const lead = Math.max(...r.paths.map((p) => positionAt(p, simT)))
      const rate = lead > SLOWMO_FROM && done.length === 0 ? SLOWMO_RATE : 1
      simT = skip.current ? end : simT + (dt / UNIT_MS) * rate
      r.paths.forEach((p, i) => {
        const el = runnerEls.current[i]
        const track = trackEls.current[i]
        if (el && track) el.style.transform = `translateX(${positionAt(p, simT) * (track.clientWidth - el.clientWidth)}px)`
        if (simT >= p.finish && !done.includes(i)) {
          done.push(i)
          if (sound) playSound(done.length === 1 ? 'pop' : 'tick')
        }
      })
      setFinished((f) => (f.length === done.length ? f : [...r.order.slice(0, done.length)]))
      if (simT < end) frame.current = requestAnimationFrame(tick)
      else timers.current.push(window.setTimeout(() => finish(r, r.order), 500))
    }
    frame.current = requestAnimationFrame(tick)
  }

  function finish(r: Race, order: number[]) {
    setFinished(order)
    setPhase('result')
    markDone('tool')
    if (sound) playSound('end')
    const hero = goal === 'first' ? order[0] : order[order.length - 1]
    window.setTimeout(() => confettiFrom(runnerEls.current[hero], 40), 50)
    void r
  }

  if (phase === 'setup') {
    return (
      <div className="flex flex-col gap-4 pb-28">
        <section className="flex flex-col gap-2">
          <SectionHeader title={t('race.who')} count={runners.length} />
          <Card className="mx-4 flex flex-col gap-2 p-3">
            {runners.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => nextFreeRacer(i)}
                  className="pressable shrink-0 rounded-full p-1"
                  aria-label={t('race.changeRacer', { name: r.name, racer: t(`race.racers.${r.racer}`) })}
                >
                  <RaceRunner racer={r.racer} initial={String(i + 1)} />
                </button>
                <Input
                  value={r.name}
                  maxLength={NAME_MAX}
                  aria-label={t('race.nameLabel', { n: i + 1 })}
                  onChange={(e) => update(i, { name: e.target.value })}
                  className="bg-background"
                />
                {runners.length > MIN_RUNNERS && (
                  <Button variant="ghost" size="icon" aria-label={t('race.remove', { name: r.name })} onClick={() => setRunners((l) => l.filter((_, k) => k !== i))}>
                    <X />
                  </Button>
                )}
              </div>
            ))}
            {runners.length < MAX_RUNNERS && (
              <Button variant="ghost" onClick={addRunner}>
                <Plus data-icon="inline-start" />
                {t('race.add')}
              </Button>
            )}
          </Card>
          <p className="px-4 text-xs text-muted-foreground">{t('race.tapAnimal')}</p>
        </section>
        <section className="flex flex-col gap-2">
          <SectionHeader title={t('race.goal')} />
          <div className="px-4">
            <SegmentedChoice<Goal>
              label={t('race.goal')}
              value={goal}
              onChange={setGoal}
              options={[
                { value: 'first', label: t('race.goals.first') },
                { value: 'last', label: t('race.goals.last') },
              ]}
            />
          </div>
        </section>
        <BottomAction>
          <Button size="lg" className="flex-1" disabled={!valid} onClick={start}>
            <Flag data-icon="inline-start" />
            {t('race.start')}
          </Button>
        </BottomAction>
      </div>
    )
  }

  const order = race?.order ?? []
  const hero = phase === 'result' ? (goal === 'first' ? order[0] : order[order.length - 1]) : -1

  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      {/* Track: tap to jump to the end. */}
      <div
        role="button"
        tabIndex={0}
        aria-label={phase === 'running' ? t('race.skip') : t('race.trackLabel')}
        onClick={() => (skip.current = true)}
        onKeyDown={(e) => e.key === 'Enter' && (skip.current = true)}
        className="on-ink relative flex flex-col gap-1.5 rounded-[28px] bg-ink p-3"
      >
        {runners.map((r, i) => {
          const place = finished.indexOf(i)
          return (
            <div key={i} ref={(el) => void (trackEls.current[i] = el)} className="relative h-14 rounded-2xl bg-card">
              <span className="race-finish absolute inset-y-1 right-1 w-2.5 rounded-sm" aria-hidden="true" />
              <span className="pointer-events-none absolute inset-y-0 left-16 flex items-center truncate pr-6 text-sm font-semibold text-muted-foreground">{r.name}</span>
              <div ref={(el) => void (runnerEls.current[i] = el)} className="absolute top-1 left-0.5 will-change-transform" style={{ transform: 'translateX(0)' }}>
                <RaceRunner racer={r.racer} initial={String(i + 1)} running={phase === 'running' && place === -1} className={cn(hero === i && 'scale-110')} />
                {place !== -1 && (
                  <span className="num-pop absolute -top-1 -right-1 grid size-6 place-items-center rounded-full bg-yolk text-xs font-bold text-on-slab">{place + 1}</span>
                )}
              </div>
            </div>
          )
        })}
        {phase === 'countdown' && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-[28px] bg-ink/60">
            <span key={count} className="race-count font-heading text-8xl font-extrabold text-yolk">
              {count}
            </span>
          </div>
        )}
      </div>
      {phase === 'running' && <p className="text-center text-sm text-muted-foreground">{t('race.tapToSkip')}</p>}

      {phase === 'result' && (
        <Card className="flex flex-col gap-3 p-4">
          <p className="flex items-center gap-2 font-heading text-2xl font-bold">
            <Trophy className="size-6 shrink-0 text-brand" aria-hidden="true" />
            {t(goal === 'first' ? 'race.won' : 'race.lost', { name: runners[hero]?.name })}
          </p>
          <ol className="flex flex-col gap-1.5">
            {order.map((runner, place) => (
              <li key={runner} className={cn('flex items-center gap-3 rounded-2xl px-2 py-1', runner === hero && 'bg-accent')}>
                <span className="w-6 text-center font-heading text-lg font-bold tabular-nums">{place + 1}</span>
                <RaceRunner racer={runners[runner].racer} initial={String(runner + 1)} className="size-9" />
                <span className="min-w-0 flex-1 truncate font-medium">{runners[runner].name}</span>
              </li>
            ))}
          </ol>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setPhase('setup')}>
              <UsersRound data-icon="inline-start" />
              {t('race.edit')}
            </Button>
            <Button onClick={start}>
              <RotateCcw data-icon="inline-start" />
              {t('race.again')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
