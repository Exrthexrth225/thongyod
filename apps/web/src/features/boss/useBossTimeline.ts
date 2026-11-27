import { useEffect, useState } from 'react'
import type { BossEvent, BossView } from '@/api/types'
import type { Mood } from './meta'

const FX_KINDS = new Set(['deal_opened', 'team_played', 'travel_played', 'boss_played', 'recruit_played', 'stop_played', 'deal_settled', 'deal_failed', 'end_roll', 'game_ended', 'dice_rolled', 'interrupt_resolved', 'slot_set'])
/** These always play, however late; the rest are dropped when the table has moved on. */
const MUST_PLAY = new Set(['deal_settled', 'end_roll', 'game_ended', 'dice_rolled'])
const STALE_MS = 6000

/** Dice: tumble ~1.5 s, hold the face, hop space by space, then light up the destination. */
export const ROLL = { tumble: 1500, hold: 600, step: 260, land: 500 }
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** How long one effect holds the screen before the next one starts. */
export function effectMs(e: BossEvent): number {
  const quick = reduced()
  switch (e.kind) {
    case 'dice_rolled': return quick ? 900 : ROLL.tumble + ROLL.hold + (e.path?.length ?? 1) * ROLL.step + ROLL.land
    case 'deal_settled': return 3400 // stamp, then coins fly to everyone paid
    case 'end_roll': return 3600
    case 'game_ended': return 4000
    case 'team_played': case 'slot_set': return 1600
    default: return 2400
  }
}

/**
 * Effects play one after another, never on top of each other: a closed deal stamps, then the coins fly, then the
 * end-game die rolls, then the winner. Only events that arrived after this screen opened play (no replay of history).
 * Arrival times are this device's clock, so a skewed server clock cannot cut an effect short.
 * Nothing here gates a real decision: Stop windows and closing counts come from the game state, not from this queue.
 */
export function useBossTimeline(view: BossView) {
  const [since] = useState(() => view.revision)
  const [arrived, setArrived] = useState<Record<number, number>>({})
  const [now, setNow] = useState(0)
  const fresh = view.events.filter((e) => e.revision > since && FX_KINDS.has(e.kind))

  // Schedule: each effect starts when it arrived or when the one before it ended, whichever is later.
  let end = 0
  let current: BossEvent | null = null
  let currentStart = 0
  let pending = false
  const lastRoll = view.events.findLast((x) => x.kind === 'dice_rolled')
  let rollStop = 0
  for (const e of fresh) {
    const at = arrived[e.revision]
    if (at === undefined) { pending = true; continue }
    const start = Math.max(at, end)
    if (!MUST_PLAY.has(e.kind) && start - at > STALE_MS) continue
    const stop = start + effectMs(e)
    if (e.revision === lastRoll?.revision) rollStop = stop
    if (now >= start && now < stop) { current = e; currentStart = start }
    if (now < stop) pending = true
    end = stop
  }

  const unseen = fresh.some((e) => arrived[e.revision] === undefined)
  const busy = unseen || pending
  const revisions = fresh.map((e) => e.revision).join(',')
  useEffect(() => {
    if (!busy) return
    const tick = () => {
      const t = Date.now()
      setNow(t)
      setArrived((a) => {
        const add = revisions.split(',').filter((r) => r && a[Number(r)] === undefined)
        return add.length ? { ...a, ...Object.fromEntries(add.map((r) => [Number(r), t])) } : a
      })
    }
    tick()
    const id = window.setInterval(tick, 100)
    return () => window.clearInterval(id)
  }, [busy, revisions])

  const moods: Record<string, Mood> = {}
  const e = current
  const paid = view.lastSettlement
  if (e?.kind === 'deal_settled' && paid && paid.dealNumber === e.dealNumber) for (const id of Object.keys(paid.payouts)) moods[id] = 'happy'
  if (e?.kind === 'deal_failed') moods[e.actorId] = 'upset'
  if (e?.kind === 'interrupt_resolved' && !e.cancelled) {
    const played = view.events.findLast((x) => x.revision < e.revision && ['travel_played', 'recruit_played', 'boss_played'].includes(x.kind))
    if (played?.targetId) moods[played.targetId] = 'upset'
    if (played) moods[played.actorId] = 'happy'
  }
  if (e?.kind === 'stop_played') { moods[e.actorId] = 'happy'; if (e.targetId) moods[e.targetId] = 'upset' }
  if (e?.kind === 'game_ended') for (const id of view.winnerIds) moods[id] = 'happy'

  // The dice result is not announced (and its actions not offered) until the roll has played out.
  const rolling = !!lastRoll && lastRoll.revision > since && (arrived[lastRoll.revision] === undefined || now < rollStop)
  return { latest: current, startedAt: currentStart, now, moods, since, rolling }
}
