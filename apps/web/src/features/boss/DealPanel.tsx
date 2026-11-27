import { useTranslation } from 'react-i18next'
import { Check, Plane, X } from 'lucide-react'
import type { BossView, InvestorTeam, RoomPlayer } from '@/api/types'
import { cn } from '@/lib/utils'
import { nameOf, seatTeam, TEAM_COLOR } from './meta'
import { Face, Money, PriceTag, SeatFaces, TeamBadge } from './parts'

type Props = { view: BossView; players: RoomPlayer[]; meId?: string; big?: boolean }

/** The open deal on the table: who brings which team, the boss's offer and who agreed. Public on every screen. */
export function DealPanel({ view, players, meId, big }: Props) {
  const { t } = useTranslation()
  const deal = view.deal
  if (!deal) return null
  const space = view.spaces[deal.spaceIndex]
  const agreed = new Set(deal.agreedTeams)
  const accepted = new Set([deal.bossId, ...deal.acceptedIds])
  const given = Object.values(deal.allocation).reduce((a, b) => a + b, 0)
  const bossShare = deal.allocation[deal.bossId] ?? 0

  const slot = (team: InvestorTeam) => {
    const ids = deal.providers[team] ?? []
    const blocked = deal.blockedTeams.includes(team)
    const owner = view.seats.find((s) => s.investors.includes(team))?.userId
    return (
      <li key={team} className={cn('flex items-center gap-2 rounded-xl bg-white/85 p-1 pr-2 text-[#3a2416] ring-2 transition-[box-shadow,opacity]', agreed.has(team) ? 'ring-emerald-500' : 'ring-transparent', !ids.length && 'opacity-60')}>
        <TeamBadge team={team} className={big ? 'size-9' : 'size-7'} />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {blocked && <span className="flex items-center gap-0.5 rounded-md bg-sky-100 px-1 text-xs font-bold text-sky-700"><Plane className="size-3" aria-hidden="true" />{t('boss.deal.sentAway')}</span>}
          {ids.length === 0 && !blocked && <span className="text-xs opacity-70">{t('boss.deal.nobody')}</span>}
          {ids.map((id) => (
            <span key={id} className={cn('flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-bold', accepted.has(id) ? 'bg-emerald-100 text-emerald-800' : 'bg-black/5')} title={id === owner && !blocked ? t('boss.deal.investor', { name: nameOf(players, id) }) : t('boss.deal.byCard', { name: nameOf(players, id) })}>
              {id === owner && !blocked ? <Face team={team} className="size-5 rounded-full" /> : <span className="size-2.5 rounded-sm" style={{ background: TEAM_COLOR[team] }} />}
              <span className="max-w-20 truncate">{nameOf(players, id)}</span>
              {accepted.has(id) && <Check className="size-3" aria-hidden="true" />}
            </span>
          ))}
        </span>
      </li>
    )
  }

  const recipients = Object.entries(deal.allocation).filter(([id]) => id !== deal.bossId)
  const contributors = new Set(deal.contributorIds)
  const missing = space.groups.reduce((n, g) => n + Math.max(0, g.pick - g.teams.filter((team) => agreed.has(team)).length), 0)

  return (
    <div className={cn('boss-deal flex w-full min-w-0 flex-col gap-2 rounded-2xl bg-[#fff4dc]/95 p-2.5 text-[#3a2416] shadow-[0_3px_0_#5a3420] ring-2 ring-[#5a3420]/60', big && 'gap-3 p-4')}>
      <header className="flex items-center gap-2">
        <SeatFaces view={view} userId={deal.bossId} className={big ? 'size-12' : 'size-9'} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className={cn('truncate font-black', big ? 'text-xl' : 'text-base')}>{t('boss.status.deal', { n: deal.dealNumber })} · {nameOf(players, deal.bossId)}</p>
          <p className="text-xs opacity-75">{t('boss.deal.people', { count: space.teamCount })} · {t('boss.deal.dividends', { count: space.dividends })} · {t('boss.status.perDividend', { m: view.currentShareValue / 1_000_000 })}</p>
        </div>
        <PriceTag key={deal.totalValue} amount={deal.totalValue} share={view.currentShareValue} dividends={space.dividends} size={big ? 34 : 28} className="boss-price-pop" />
      </header>

      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${space.groups.length}, minmax(0, 1fr))` }}>
        {space.groups.map((g, i) => {
          const have = g.teams.filter((team) => agreed.has(team)).length
          return (
            <section key={i} className={cn('flex min-w-0 flex-col gap-1', i > 0 && 'border-l-2 border-dashed border-[#5a3420]/35 pl-2')}>
              <h4 className={cn('flex items-center justify-between text-xs font-black uppercase tracking-wide', have >= g.pick ? 'text-emerald-700' : 'opacity-70')}>
                <span>{g.pick === g.teams.length ? t('boss.deal.needs') : t('boss.deal.pick', { count: g.pick })}</span>
                <span className="tabular-nums">{Math.min(have, g.pick)}/{g.pick}</span>
              </h4>
              <ul className="flex flex-col gap-1">{g.teams.map(slot)}</ul>
            </section>
          )
        })}
      </div>

      <section className="flex flex-col gap-1 rounded-xl bg-white/70 p-2">
        {!deal.offered ? (
          <p className="text-center text-sm opacity-75">{t('boss.deal.noOffer')}</p>
        ) : (
          <>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-black/10" aria-hidden="true">
              {Object.entries(deal.allocation).map(([id, amount]) => <i key={id} className="h-full transition-[width] duration-500" style={{ width: `${(amount / Math.max(deal.totalValue, given)) * 100}%`, background: TEAM_COLOR[seatTeam(view, id)] }} />)}
            </div>
            <ul className="flex flex-col gap-0.5 text-sm">
              {recipients.map(([id, amount]) => {
                const status = !contributors.has(id) ? 'bribe' : deal.acceptedIds.includes(id) ? 'ok' : deal.declinedIds.includes(id) ? 'no' : 'wait'
                return (
                  <li key={id} className={cn('flex items-center gap-2 rounded-lg px-1', id === meId && 'bg-amber-100')}>
                    <span className="min-w-0 flex-1 truncate font-semibold">{nameOf(players, id)}</span>
                    <Money amount={amount} />
                    <span className={cn('flex w-16 items-center justify-end gap-0.5 text-xs font-bold', status === 'ok' && 'text-emerald-700', status === 'no' && 'text-red-600', status === 'bribe' && 'text-amber-700', status === 'wait' && 'opacity-60')}>
                      {status === 'ok' && <Check className="size-3" aria-hidden="true" />}
                      {status === 'no' && <X className="size-3" aria-hidden="true" />}
                      {t(status === 'ok' ? 'boss.deal.accepted' : status === 'no' ? 'boss.deal.declined' : status === 'bribe' ? 'boss.deal.bribe' : 'boss.deal.waiting')}
                    </span>
                  </li>
                )
              })}
              <li className="flex items-center gap-2 border-t border-black/10 px-1 pt-1 font-bold">
                <span className="flex-1">{t('boss.deal.bossKeeps')}</span>
                <Money amount={bossShare} />
                <span className="w-16" />
              </li>
            </ul>
          </>
        )}
        {Object.entries(deal.asks).some(([, v]) => v !== null) && (
          <p className="flex flex-wrap gap-1 text-xs">
            {Object.entries(deal.asks).filter(([, v]) => v !== null).map(([id, v]) => (
              <span key={id} className="rounded-full bg-black/5 px-2 py-0.5 font-semibold">{nameOf(players, id)}: {t('boss.deal.asked', { amount: t('boss.money', { m: (v ?? 0) / 1_000_000 }) })}</span>
            ))}
          </p>
        )}
      </section>
      <p className={cn('text-center text-xs font-bold', deal.canClose ? 'text-emerald-700' : 'opacity-70')}>
        {deal.canClose ? t('boss.deal.ready') : missing > 0 ? t('boss.deal.missingTeams', { count: missing }) : t('boss.deal.noOffer')}
      </p>
    </div>
  )
}

/** The deal as a small contract on the phone's table: who is in, empty seats, the split bar and the value. */
export function ContractCard({ view, players, meId }: { view: BossView; players: RoomPlayer[]; meId?: string }) {
  const { t } = useTranslation()
  const deal = view.deal
  if (!deal) return null
  const space = view.spaces[deal.spaceIndex]
  const accepted = new Set([deal.bossId, ...deal.acceptedIds])
  const given = Object.values(deal.allocation).reduce((a, b) => a + b, 0)
  const mine = new Set(Object.entries(deal.providers).filter(([, ids]) => meId && ids?.includes(meId)).map(([team]) => team))
  return (
    <div key={deal.id} className="boss-contract relative w-full max-w-[25rem] rounded-2xl bg-[#f6efdc] p-2.5 text-[#241b4b] shadow-[0_10px_30px_rgba(0,0,0,0.45)] ring-1 ring-[#d9cfb2]">
      <PriceTag key={deal.totalValue} amount={deal.totalValue} share={view.currentShareValue} dividends={space.dividends} size={24} className="boss-price-pop absolute -right-3 -top-4 z-10 rotate-[4deg]" />
      <div className="flex items-center gap-2 pr-24">
        <span className="flex size-6 items-center justify-center rounded-md bg-[#241b4b] text-sm font-black text-white">{space.teamCount}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-black">{t('boss.deal.contract', { n: space.index + 1 })} · $×{space.dividends}</span>
      </div>
      <div className="mt-2 flex items-stretch justify-center gap-2">
        {space.groups.map((g, i) => {
          const inTeams = g.teams.filter((team) => deal.agreedTeams.includes(team))
          const offered = g.teams.filter((team) => !inTeams.includes(team) && (deal.providers[team]?.length ?? 0) > 0 && !deal.blockedTeams.includes(team))
          const empty = Math.max(0, g.pick - inTeams.length)
          return (
            <div key={i} className={cn('flex min-w-0 flex-col items-center gap-1', i > 0 && 'border-l border-[#d9cfb2] pl-2')}>
              <div className={cn('flex flex-wrap items-center justify-center gap-1 rounded-xl p-0.5', g.teams.some((team) => mine.has(team)) && 'boss-mine')}>
                {inTeams.map((team) => {
                  const who = (deal.providers[team] ?? []).find((id) => accepted.has(id))
                  return (
                    <span key={team} className="relative" title={nameOf(players, who)}>
                      <Face team={team} className="size-10 rounded-full ring-2 ring-emerald-500" />
                      <TeamBadge team={team} className="absolute -bottom-1 -right-1 size-4" />
                    </span>
                  )
                })}
                {Array.from({ length: empty }, (_, k) => <span key={`e${k}`} className="size-10 rounded-full border-2 border-dashed border-[#c9bfa0]" />)}
                {offered.map((team) => <TeamBadge key={team} team={team} className="size-5 opacity-80" />)}
              </div>
              <span className={cn('text-[11px] font-bold', inTeams.length >= g.pick ? 'text-emerald-700' : 'opacity-70')}>
                {g.pick === g.teams.length ? t('boss.deal.needs') : t('boss.deal.pick', { count: g.pick })} {Math.min(inTeams.length, g.pick)}/{g.pick}
              </span>
            </div>
          )
        })}
      </div>
      {deal.offered && (
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-black/10" aria-hidden="true">
          {Object.entries(deal.allocation).map(([id, amount]) => <i key={id} className="h-full transition-[width] duration-500" style={{ width: `${(amount / Math.max(deal.totalValue, given)) * 100}%`, background: TEAM_COLOR[seatTeam(view, id)] }} />)}
        </div>
      )}
      <p className={cn('mt-1.5 text-center text-[11px] font-bold', deal.canClose ? 'text-emerald-700' : 'opacity-70')}>
        {(() => {
          const missing = space.groups.reduce((n, g) => n + Math.max(0, g.pick - g.teams.filter((team) => deal.agreedTeams.includes(team)).length), 0)
          return deal.canClose ? t('boss.deal.ready') : !deal.offered ? t('boss.deal.noOffer') : missing > 0 ? t('boss.deal.missingTeams', { count: missing }) : t('boss.deal.waitAccept')
        })()}
      </p>
    </div>
  )
}
