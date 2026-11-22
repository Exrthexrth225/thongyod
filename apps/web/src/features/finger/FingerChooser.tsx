import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { NumberStepper } from '@/components/common/NumberStepper'
import { SegmentedChoice } from '@/components/common/SegmentedChoice'
import { markDone } from '@/features/daily/daily'
import { playSound, unlockSound } from '@/lib/sound'
import { useGameSound } from '@/lib/soundPrefs'
import { cn } from '@/lib/utils'
import './finger.css'
import { MIN_FINGERS, SETTLE_MS, SPOT_MS, decide, labelSpot, type FingerMode, type FingerResult } from './logic'

/** Slab colours for fingers (by touch order) and for teams. Tokens, so they follow light/dark mode. */
const COLORS = ['var(--yolk)', 'var(--mint)', 'var(--sky)', 'var(--tangerine)', 'var(--lilac)', 'var(--tint-7)', 'var(--tint-8)', 'var(--tint-6)']

type Finger = { id: number; x: number; y: number; color: number }
type Phase = 'wait' | 'settle' | 'done'

// วางนิ้วสุ่ม (DECISIONS #102): everyone keeps one finger on the dark stage. When nobody adds or lifts a finger for
// SETTLE_MS, the result is decided (secure random) and shown at once (#125): the stage closes in on the chosen finger and
// floods with its colour; teams / order labels sit beside the fingers where hands do not cover them.
// Lifting or adding a finger before the end starts the wait again. After the result, lift everything to play again.
export function FingerChooser() {
  const { t } = useTranslation()
  const sound = useGameSound('finger')
  const [mode, setMode] = useState<FingerMode>('one')
  const [teams, setTeams] = useState(2)
  const [fingers, setFingers] = useState<Finger[]>([])
  const [phase, setPhase] = useState<Phase>('wait')
  const [result, setResult] = useState<FingerResult | null>(null)
  const [stageW, setStageW] = useState(360)
  const stage = useRef<HTMLDivElement>(null)
  const timers = useRef<number[]>([])
  const nextColor = useRef(0)
  const live = useRef<Finger[]>([])

  const clear = () => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }
  useEffect(() => clear, [])

  /** The set of fingers changed: (re)start the wait, or go back to waiting for more fingers. */
  function changed(next: Finger[]) {
    live.current = next
    setFingers(next)
    if (phase === 'done') {
      if (next.length === 0) {
        setPhase('wait')
        setResult(null)
        nextColor.current = 0
      }
      return
    }
    clear()
    if (next.length < MIN_FINGERS) {
      setPhase('wait')
      return
    }
    setPhase('settle')
    timers.current.push(window.setTimeout(pick, SETTLE_MS))
  }

  function pick() {
    const now = live.current
    if (now.length < MIN_FINGERS) return
    unlockSound()
    setResult(decide(
      now.map((f) => f.id),
      mode,
      teams,
    ))
    setPhase('done')
    markDone('tool')
    navigator.vibrate?.([30, 40, 60])
    if (sound) playSound('end')
  }

  function point(e: PointerEvent<HTMLDivElement>) {
    const box = stage.current!.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }

  function onDown(e: PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    if (phase === 'done' && live.current.length > 0) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Not a live pointer (e.g. a synthetic event): moves still arrive on the stage.
    }
    setStageW(e.currentTarget.clientWidth)
    const finger: Finger = { id: e.pointerId, ...point(e), color: nextColor.current++ % COLORS.length }
    changed([...live.current.filter((f) => f.id !== e.pointerId), finger])
  }
  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (!live.current.some((f) => f.id === e.pointerId)) return
    const p = point(e)
    const next = live.current.map((f) => (f.id === e.pointerId ? { ...f, ...p } : f))
    live.current = next
    setFingers(next)
  }
  function onUp(e: PointerEvent<HTMLDivElement>) {
    if (!live.current.some((f) => f.id === e.pointerId)) return
    changed(live.current.filter((f) => f.id !== e.pointerId))
  }

  const winner = result?.mode === 'one' ? fingers.find((f) => f.id === result.winner) : undefined
  const hint =
    phase === 'wait'
      ? t(fingers.length === 1 ? 'finger.oneMore' : 'finger.place')
      : phase === 'settle'
        ? t('finger.hold')
        : t('finger.again')

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-col gap-2 px-4">
        <SegmentedChoice<FingerMode>
          label={t('finger.modeLabel')}
          value={mode}
          disabled={fingers.length > 0}
          onChange={setMode}
          options={[
            { value: 'one', label: t('finger.modes.one') },
            { value: 'teams', label: t('finger.modes.teams') },
            { value: 'order', label: t('finger.modes.order') },
          ]}
        />
        {mode === 'teams' && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('finger.teamCount')}</span>
            <NumberStepper value={teams} onChange={setTeams} min={2} max={4} label={t('finger.teamCount')} />
          </div>
        )}
      </div>

      <div
        ref={stage}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()}
        className="finger-stage on-ink relative mx-4 mb-4 min-h-[62dvh] flex-1 touch-none overflow-hidden rounded-[32px] bg-ink select-none"
        aria-label={t('finger.stageLabel')}
      >
        {/* Chosen (#125): the stage darkens down onto their finger, then floods with their colour. */}
        {winner && (
          <>
            <span aria-hidden="true" className="finger-spot pointer-events-none absolute inset-0 z-[1]" style={{ '--x': `${winner.x}px`, '--y': `${winner.y}px`, '--spot': `${SPOT_MS}ms` } as CSSProperties} />
            <span aria-hidden="true" className="finger-flood absolute z-[1] size-24 rounded-full" style={{ left: winner.x, top: winner.y, background: COLORS[winner.color], '--spot': `${SPOT_MS}ms` } as CSSProperties} />
          </>
        )}

        <p className={cn('pointer-events-none absolute inset-x-0 top-6 z-[3] px-6 text-center text-lg font-semibold text-balance', winner && 'finger-late text-on-slab')} style={{ '--spot': `${SPOT_MS}ms` } as CSSProperties} aria-live="polite">
          {phase === 'done' && result ? resultLine(result, t) : hint}
        </p>
        {phase === 'wait' && fingers.length === 0 && (
          <p className="pointer-events-none absolute inset-x-0 bottom-6 px-6 text-center text-sm text-muted-foreground">{t('finger.iphoneLimit')}</p>
        )}

        {fingers.map((f) => {
          const teamOf = result?.mode === 'teams' ? result.team[f.id] : undefined
          const rank = result?.mode === 'order' ? result.rank[f.id] : undefined
          const color = COLORS[teamOf ?? f.color]
          const won = result?.mode === 'one' && result.winner === f.id
          const lost = result?.mode === 'one' && !won
          const label = teamOf !== undefined ? t('finger.teamShort', { n: teamOf + 1 }) : rank !== undefined ? String(rank) : null
          return (
            <span
              key={f.id}
              aria-hidden="true"
              className={cn('finger-ring absolute grid size-26 place-items-center rounded-full', phase === 'settle' && 'is-settling', won && 'is-won', label && 'is-shown', lost && 'is-lost')}
              style={{ left: f.x, top: f.y, '--ring': color, '--settle': `${SETTLE_MS}ms`, '--delay': `${(rank ?? 0) * 90}ms` } as CSSProperties}
            >
              {label && (
                <b className={cn('finger-label absolute rounded-full px-3 font-heading leading-tight text-on-slab', rank !== undefined ? 'min-w-12 text-center text-4xl' : 'text-xl whitespace-nowrap')} data-spot={labelSpot(f.x, f.y, stageW)}>
                  {label}
                </b>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function resultLine(result: FingerResult, t: (key: 'finger.wonOne' | 'finger.wonTeams' | 'finger.wonOrder') => string): string {
  if (result.mode === 'one') return t('finger.wonOne')
  return result.mode === 'teams' ? t('finger.wonTeams') : t('finger.wonOrder')
}
