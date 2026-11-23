import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flag, Plus, RotateCcw, RotateCw, Trophy, UsersRound, X } from 'lucide-react'
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
import { useMediaQuery } from '@/lib/useMediaQuery'
import { cn } from '@/lib/utils'
import { MAX_RUNNERS, MIN_RUNNERS, PICK_ORDER, RACER_IDS, eventAt, makeRace, positionAt, type EventKind, type Race } from './logic'
import { RaceFx, RaceProp } from './RaceFx'
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

/** Phone held sideways (short screen): the race takes the whole screen (#112). */
const SIDEWAYS = '(orientation: landscape) and (max-height: 560px)'
const EVENT_SOUND: Record<EventKind, 'wrong' | 'flip' | 'roll' | 'pass' | 'pop'> = { trip: 'wrong', banana: 'flip', prank: 'flip', nap: 'pop', bee: 'roll', wrongWay: 'pass' }

// สัตว์วิ่งแข่ง (DECISIONS #103, #112): pick who races, 3-2-1, they run on one grass field; the order was decided
// fairly at the start and the run is staged so the lead changes and the end is close. "ที่ 1 ชนะ" or "ที่โหล่โดน".
// Sideways phone = full-screen field. After a race the field stays, with a one-tap rematch in the thumb zone.
export function RaceGame() {
  const { t } = useTranslation()
  const sound = useGameSound('race')
  const [runners, setRunners] = useState<Runner[]>(
    () =>
      loadRunners() ?? [
        { name: t('race.defaultName', { n: 1 }), racer: 'cat' },
        { name: t('race.defaultName', { n: 2 }), racer: 'frog' },
      ],
  )
  const [goal, setGoal] = useState<Goal>('first')
  /** The goal the shown race was run with (changing `goal` on the result screen is for the next round). */
  const [raceGoal, setRaceGoal] = useState<Goal>('first')
  const sideways = useMediaQuery(SIDEWAYS)
  const [phase, setPhase] = useState<Phase>('setup')
  const [count, setCount] = useState(3)
  const [race, setRace] = useState<Race | null>(null)
  /** Changes every race, so props from the last race never linger. */
  const [raceId, setRaceId] = useState(0)
  const [finished, setFinished] = useState<number[]>([])
  /** What the announcer is saying (#114). */
  const [call, setCall] = useState<{ id: number; text: string } | null>(null)
  const propEls = useRef<(HTMLSpanElement | null)[]>([])
  const runnerEls = useRef<(HTMLDivElement | null)[]>([])
  const trackEls = useRef<(HTMLDivElement | null)[]>([])
  const trackBox = useRef<HTMLDivElement>(null)
  const frame = useRef(0)
  const timers = useRef<number[]>([])
  const skip = useRef(false)
  /** Skip needs two taps (#125, Earth): one stray tap while holding the phone must not end the race. */
  const [armed, setArmed] = useState(false)
  const armTimer = useRef(0)
  /** The goal at the moment the race started (read inside the frame loop). */
  const goalNow = useRef<Goal>('first')

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
    const racer = PICK_ORDER.find((id) => !used.has(id))
    if (!racer || runners.length >= MAX_RUNNERS) return
    setRunners((list) => [...list, { name: t('race.defaultName', { n: list.length + 1 }), racer }])
  }

  function start() {
    if (!valid) return
    unlockSound()
    stop()
    // A rematch counts down faster: everyone is already looking at the field.
    const beat = race ? 450 : 700
    const next = makeRace(runners.length)
    setRace(next)
    setRaceId((n) => n + 1)
    propEls.current = []
    setRaceGoal(goal)
    goalNow.current = goal
    setFinished([])
    setCall(null)
    skip.current = false
    runnerEls.current.forEach((el) => {
      if (!el) return
      el.style.transform = 'translateX(0)'
      el.dataset.ev = ''
      el.dataset.act = ''
    })
    if (reducedMotion()) return finish(next, next.order, goal)
    setPhase('countdown')
    setCount(3)
    timers.current = [0, beat, beat * 2].map((ms, k) =>
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
      }, beat * 3),
    )
  }

  /** Moves the runners frame by frame (transform only, straight on the DOM: no re-render per frame). */
  function run(r: Race) {
    let simT = 0
    let last = -1
    const done: number[] = []
    const end = Math.max(...r.paths.map((p) => p.finish))
    const evNow: (EventKind | null)[] = r.paths.map(() => null)
    /** Where runner i stands (px) at race time t. */
    const px = (i: number, t: number) => {
      const el = runnerEls.current[i]
      const track = trackEls.current[i]
      return el && track ? positionAt(r.paths[i], t) * (track.clientWidth - el.clientWidth - 30) : 0
    }
    const tick = (now: number) => {
      if (last < 0) last = now
      const dt = Math.min(64, now - last)
      last = now
      const lead = Math.max(...r.paths.map((p) => positionAt(p, simT)))
      const rate = lead > SLOWMO_FROM && done.length === 0 ? SLOWMO_RATE : 1
      trackBox.current?.style.setProperty('--flip', rate < 1 ? '0.55s' : '0.24s')
      simT = skip.current ? end : simT + (dt / UNIT_MS) * rate
      r.paths.forEach((p, i) => {
        const el = runnerEls.current[i]
        // The runner starts 8px in and stops with its nose just over the finish line (22px from the edge).
        if (el) el.style.transform = `translateX(${px(i, simT)}px)`
        // Events (#114): the slot's data-ev drives the pose and the little drawings in race.css.
        const ev = skip.current ? null : eventAt(p, simT)
        if (el && ev !== evNow[i]) {
          evNow[i] = ev
          el.dataset.ev = ev ?? ''
          const e = r.events.find((x) => x.runner === i)
          if (ev && e) {
            el.style.setProperty('--ev-ms', `${Math.round((e.dur * UNIT_MS) / rate)}ms`)
            const name = runners[i]?.name ?? ''
            const by = e.by !== undefined ? (runners[e.by]?.name ?? '') : ''
            const id = Date.now()
            setCall({ id, text: t(`race.ev.${ev}`, { name, by }) })
            timers.current.push(window.setTimeout(() => setCall((c) => (c?.id === id ? null : c)), 1900))
            if (sound) playSound(EVENT_SOUND[ev], 0.9)
          }
        }
        if (simT >= p.finish && !done.includes(i)) {
          done.push(i)
          if (sound) playSound(done.length === 1 ? 'pop' : 'tick')
        }
      })
      // Props: a rock or a peel appears just before the runner reaches it; a prankster hops as it throws.
      r.events.forEach((e, k) => {
        const prop = propEls.current[k]
        const thrower = e.by !== undefined ? runnerEls.current[e.by] : null
        if (thrower) thrower.dataset.act = !skip.current && simT >= e.at - 0.07 && simT < e.at + 0.02 ? 'throw' : ''
        if (!prop) return
        const on = !skip.current && simT >= e.at - 0.06 && simT < e.at + e.dur + 0.12
        if (on && prop.dataset.on !== '1') {
          const runnerW = runnerEls.current[e.runner]?.clientWidth ?? 40
          prop.style.left = `${8 + px(e.runner, e.at) + runnerW * 0.78}px`
          prop.dataset.on = '1'
        } else if (!on && prop.dataset.on === '1') prop.dataset.on = ''
      })
      setFinished((f) => (f.length === done.length ? f : [...r.order.slice(0, done.length)]))
      if (simT < end) frame.current = requestAnimationFrame(tick)
      else timers.current.push(window.setTimeout(() => finish(r, r.order, goalNow.current), 500))
    }
    frame.current = requestAnimationFrame(tick)
  }

  function finish(r: Race, order: number[], g: Goal) {
    setFinished(order)
    setPhase('result')
    markDone('tool')
    if (sound) playSound('end')
    const hero = g === 'first' ? order[0] : order[order.length - 1]
    window.setTimeout(() => confettiFrom(runnerEls.current[hero], 40), 50)
    void r
  }

  /** Stop whatever is running (frames, countdown, pending result). */
  function stop() {
    cancelAnimationFrame(frame.current)
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }

  function leave() {
    stop()
    setPhase('setup')
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
          <p className="flex items-center gap-1.5 px-4 text-xs text-muted-foreground landscape:hidden">
            <RotateCw className="size-3.5 shrink-0" aria-hidden="true" />
            {t('race.rotateHint')}
          </p>
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
  const hero = phase === 'result' ? (raceGoal === 'first' ? order[0] : order[order.length - 1]) : -1

  // The announcer (#114): over the field when sideways (under the ✕), otherwise in the line under the field.
  const callLine = call && phase === 'running' && (
    <p key={call.id} className="race-call max-w-[90%] truncate rounded-full bg-ink px-3 py-1 font-heading text-sm font-bold text-ink-foreground" aria-live="polite">
      {call.text}
    </p>
  )

  const field = (
    <div
      role="button"
      tabIndex={0}
      aria-label={phase === 'running' ? t('race.skip') : t('race.trackLabel')}
      onClick={() => {
        if (phase !== 'running' || skip.current) return
        window.clearTimeout(armTimer.current)
        if (armed) {
          skip.current = true
          setArmed(false)
          return
        }
        setArmed(true)
        armTimer.current = window.setTimeout(() => setArmed(false), 1600)
      }}
      onKeyDown={(e) => e.key === 'Enter' && (skip.current = true)}
      ref={trackBox}
      data-phase={phase}
      className={cn('race-field relative flex flex-col overflow-hidden rounded-[28px] py-1.5', sideways && 'h-full')}
    >
      <span className="race-finish absolute inset-y-0 right-5 w-3" aria-hidden="true" />
      {armed && phase === 'running' && (
        <span className="race-call pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink px-4 py-2 font-heading text-base font-bold whitespace-nowrap text-ink-foreground" aria-live="polite">
          {t('race.tapAgain')}
        </span>
      )}
      {runners.map((r, i) => {
        const place = finished.indexOf(i)
        return (
          <div key={i} ref={(el) => void (trackEls.current[i] = el)} className={cn('race-lane relative', sideways ? 'min-h-0 flex-1' : 'h-15')}>
            <span className="race-start absolute inset-y-0" aria-hidden="true" />
            {race?.events.map((e, k) =>
              e.runner === i && (e.kind === 'trip' || e.kind === 'banana' || e.kind === 'prank') ? (
                <RaceProp key={`${raceId}-${k}`} kind={e.kind} ref={(el) => void (propEls.current[k] = el)} />
              ) : null,
            )}
            <div ref={(el) => void (runnerEls.current[i] = el)} className="race-slot absolute left-2 z-[2] will-change-transform" style={{ transform: 'translateX(0)' }}>
              <RaceRunner racer={r.racer} initial={String(i + 1)} running={phase === 'running' && place === -1} won={place === 0} className="size-full" />
              <RaceFx />
              {/* The place rides on the name tag behind the animal, never on its face (QA BUG-010). */}
              <span className="race-tag pointer-events-none absolute flex max-w-28 items-center gap-1 rounded-full bg-ink/85 py-0.5 pr-2 pl-0.5 text-[11px] leading-4 font-semibold whitespace-nowrap text-ink-foreground">
                {place !== -1 ? (
                  <span className="num-pop grid size-4 shrink-0 place-items-center rounded-full bg-yolk text-[10px] font-bold text-on-slab">{place + 1}</span>
                ) : (
                  <span className="w-1" />
                )}
                <span className="min-w-0 truncate">{r.name}</span>
              </span>
            </div>
          </div>
        )
      })}
      {sideways && callLine && <div className="pointer-events-none absolute inset-x-0 top-14 z-10 flex justify-center">{callLine}</div>}
      {phase === 'countdown' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-ink/55">
          <span key={count} className="race-count font-heading text-8xl font-extrabold text-yolk">
            {count}
          </span>
        </div>
      )}
      {sideways && (
        <Button
          variant="secondary"
          size="icon"
          aria-label={t('race.exit')}
          className="absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-ink/80 text-ink-foreground hover:bg-ink"
          onClick={(e) => {
            e.stopPropagation()
            leave()
          }}
        >
          <X />
        </Button>
      )}
    </div>
  )

  const result = phase === 'result' && (
    <div className="flex w-full flex-col gap-2.5">
      <p className="flex items-center gap-2 font-heading text-xl font-bold" aria-live="polite">
        <Trophy className="size-5 shrink-0 text-brand" aria-hidden="true" />
        <span className="min-w-0 truncate">{t(raceGoal === 'first' ? 'race.won' : 'race.lost', { name: runners[hero]?.name })}</span>
      </p>
      <ol className="sr-only" aria-label={t('race.order')}>
        {order.map((runner) => (
          <li key={runner}>{runners[runner].name}</li>
        ))}
      </ol>
      {/* For the next round only: this result stays as it is (QA BUG-011). */}
      <p className="-mb-1 text-xs font-semibold text-muted-foreground">{t('race.nextGoal')}</p>
      <SegmentedChoice<Goal>
        label={t('race.nextGoal')}
        value={goal}
        onChange={setGoal}
        options={[
          { value: 'first', label: t('race.goals.first') },
          { value: 'last', label: t('race.goals.last') },
        ]}
      />
      <div className="flex gap-2">
        <Button variant="secondary" size="lg" onClick={leave} aria-label={t('race.edit')}>
          <UsersRound />
        </Button>
        <Button size="lg" className="flex-1" onClick={start}>
          <RotateCcw data-icon="inline-start" />
          {t('race.again')}
        </Button>
      </div>
    </div>
  )

  if (sideways) {
    return (
      <div className="fixed inset-0 z-50 bg-background p-2 pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))]">
        {field}
        {result && <div className="absolute bottom-4 left-1/2 w-[min(22rem,55%)] -translate-x-1/2 rounded-3xl bg-background/95 p-3 shadow-lg">{result}</div>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-8">
      {field}
      {phase !== 'result' && (
        <div className="flex min-h-8 items-center justify-center">{callLine || <p className="text-center text-sm text-muted-foreground">{t('race.tapToSkip')}</p>}</div>
      )}
      {/* Right under the track, not pinned to the bottom: no empty half screen in between (QA BUG-008). */}
      {result}
    </div>
  )
}
