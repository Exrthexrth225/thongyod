import { useEffect, useState } from 'react'
import type { BossView } from '@/api/types'
import type { Mood } from './meta'

const FX_KINDS = new Set(['deal_opened', 'team_played', 'travel_played', 'boss_played', 'recruit_played', 'stop_played', 'deal_settled', 'deal_failed', 'end_roll', 'game_ended', 'dice_rolled', 'interrupt_resolved'])
const FRESH_MS = 4500

/** The clock, ticking only until `until` (ms) has passed. */
function useNowUntil(until: number | null) {
  const [now, setNow] = useState(() => Date.now())
  const live = until !== null && now < until
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => setNow(Date.now()), 400)
    return () => window.clearInterval(id)
  }, [live])
  return now
}

/**
 * What to animate: events that arrived after this screen opened (never replays history), and short-lived
 * moods for the faces (happy when paid, upset when sent away or the deal failed).
 */
export function useBossTimeline(view: BossView) {
  const [since] = useState(() => view.revision)
  const fresh = view.events.filter((e) => e.revision > since && FX_KINDS.has(e.kind))
  const latest = fresh.at(-1) ?? null
  const now = useNowUntil(latest ? Date.parse(latest.createdAt) + FRESH_MS : null)
  const recent = fresh.filter((e) => now - Date.parse(e.createdAt) < FRESH_MS)
  const moods: Record<string, Mood> = {}
  for (const e of recent) {
    if (e.kind === 'deal_settled' && view.lastSettlement && view.lastSettlement.dealNumber === e.dealNumber) for (const id of Object.keys(view.lastSettlement.payouts)) moods[id] = 'happy'
    if (e.kind === 'deal_failed') moods[e.actorId] = 'upset'
    if (e.kind === 'interrupt_resolved' && !e.cancelled) {
      const played = view.events.findLast((x) => x.revision < e.revision && ['travel_played', 'recruit_played', 'boss_played'].includes(x.kind))
      if (played?.targetId) moods[played.targetId] = 'upset'
      if (played) moods[played.actorId] = 'happy'
    }
    if (e.kind === 'stop_played') { moods[e.actorId] = 'happy'; if (e.targetId) moods[e.targetId] = 'upset' }
    if (e.kind === 'game_ended') for (const id of view.winnerIds) moods[id] = 'happy'
  }
  return { latest: latest && now - Date.parse(latest.createdAt) < FRESH_MS ? latest : null, moods, since }
}

