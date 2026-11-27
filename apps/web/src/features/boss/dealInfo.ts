// I'm the Boss! deal and instruction helpers (no components, so React Fast Refresh stays happy).
import type { TFunction } from 'i18next'
import type { BossDealState, BossView, InvestorTeam, RoomPlayer } from '@/api/types'
import { nameOf, shortName } from './meta'

/** Each person once: the colours they supply, their payout and whether they confirmed. Boss first. */
export function peopleInDeal(deal: BossDealState) {
  const supplied = new Map<string, InvestorTeam[]>()
  for (const s of deal.slots) if (s.source) supplied.set(s.source.ownerId, [...(supplied.get(s.source.ownerId) ?? []), s.source.team])
  const ids = [...new Set([deal.bossId, ...supplied.keys(), ...Object.keys(deal.allocation).filter((id) => (deal.allocation[id] ?? 0) > 0)])]
  return ids.map((id) => ({
    id,
    teams: supplied.get(id) ?? [],
    amount: deal.allocation[id] ?? 0,
    status: id === deal.bossId ? 'boss' as const : deal.acceptedIds.includes(id) ? 'ok' as const : deal.declinedIds.includes(id) ? 'no' as const : deal.requiredIds.includes(id) ? 'wait' as const : 'none' as const,
  }))
}

/** What is still missing: per column, how many more and from which colours. */
export function missingText(view: BossView, deal: BossDealState, t: TFunction) {
  const space = view.spaces[deal.spaceIndex]
  const used = new Set(deal.slots.flatMap((s) => (s.source ? [s.source.team] : [])))
  const parts = space.groups.flatMap((g, gi) => {
    const empty = deal.slots.filter((s) => s.group === gi && !s.source).length
    if (!empty) return []
    const teams = g.teams.filter((team) => !used.has(team)).map((team) => t(`boss.teamShort.${team as InvestorTeam}` as const))
    return [empty === teams.length ? teams.join(' + ') : t('boss.table.missingGroup', { count: empty, teams: teams.join('/') })]
  })
  return parts.length ? t('boss.table.missing', { list: parts.join(' · ') }) : t('boss.table.full')
}

/**
 * The one line telling this player what is going on and what to do now.
 * `rolling`: the dice animation is still playing, so the result is not announced yet.
 */
export function instruction(view: BossView, players: RoomPlayer[], meId: string | null, t: TFunction, rolling = false): string {
  const who = (id: string | null | undefined) => shortName(nameOf(players, id), 8)
  const deal = view.deal
  switch (view.phase) {
    case 'game_over': return t('boss.say.over')
    case 'draft': return view.draft?.actorId === meId ? t('boss.say.draftMine') : t('boss.say.draft', { name: who(view.draft?.actorId) })
    case 'pick_start': return view.markerChooserId === meId ? t('boss.say.pickMine') : t('boss.say.pick', { name: who(view.markerChooserId) })
    case 'discard_limit': return view.turnPlayerId === meId ? t('boss.say.discardMine') : t('boss.say.discard', { name: who(view.turnPlayerId) })
    case 'turn_choice': return view.turnPlayerId === meId ? t('boss.say.myTurn') : t('boss.say.turn', { name: who(view.turnPlayerId) })
    case 'rolled_choice': {
      if (rolling) return t('boss.say.rolling')
      return view.turnPlayerId === meId ? t('boss.say.rolledMine', { roll: view.lastRoll }) : t('boss.say.rolled', { name: who(view.turnPlayerId), roll: view.lastRoll })
    }
    case 'interrupt': return t('boss.say.interrupt', { name: who(view.interrupt?.actorId) })
    case 'closing': return t('boss.say.closing')
    default: break
  }
  if (!deal) return ''
  if (deal.bossId === meId) {
    if (deal.canClose) return t('boss.say.bossMeClose')
    const waiting = deal.requiredIds.filter((id) => !deal.acceptedIds.includes(id))
    if (deal.offered && deal.slots.every((s) => s.source) && waiting.length) return t('boss.say.bossMeWait', { names: waiting.map((id) => who(id)).join(', ') })
    if (!deal.offered && deal.slots.every((s) => s.source)) return t('boss.say.bossMeOffer')
    return t('boss.say.bossMe')
  }
  if (meId && deal.terms[meId] !== undefined && !deal.acceptedIds.includes(meId)) return t('boss.say.confirm')
  return t('boss.say.boss', { name: who(deal.bossId) })
}
