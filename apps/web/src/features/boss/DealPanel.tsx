import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Clock, Minus, Plane, Plus, X } from 'lucide-react'
import type { BossActionPayload, BossDealState, BossSlot, BossView, InvestorTeam, RoomPlayer } from '@/api/types'
import { missingText, peopleInDeal } from './dealInfo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { M, nameOf, shortName, TEAM_COLOR } from './meta'
import { Face, Money, PlayerName, PriceTag, SeatFaces, TeamBadge } from './parts'

type Props = { view: BossView; players: RoomPlayer[]; meId?: string }

/** One contract slot as everyone sees it: who fills it and from what, or that it is empty, or whose contribution was lost. */
function SlotChip({ slot, deal, players, big }: { slot: BossSlot; deal: BossDealState; players: RoomPlayer[]; big?: boolean }) {
  const { t } = useTranslation()
  const src = slot.source
  if (!src) {
    return (
      <li className={cn('boss-slot-chip flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-[#b9ab84] px-1.5 text-center text-[#7a6a46]', big ? 'h-[4.4rem]' : 'h-14')}>
        <span className="text-xs font-black">{t('boss.table.slotEmpty')}</span>
        {slot.lost && <span className="w-full truncate rounded bg-red-100 px-1 text-[10px] font-bold text-red-700">{t('boss.table.lost', { team: t(`boss.teamShort.${slot.lost.team}`), name: shortName(nameOf(players, slot.lost.ownerId)) })}</span>}
      </li>
    )
  }
  const ok = src.ownerId === deal.bossId || deal.acceptedIds.includes(src.ownerId)
  const no = deal.declinedIds.includes(src.ownerId)
  return (
    <li className={cn('boss-slot-chip boss-slot-in flex min-w-0 items-center gap-1.5 rounded-xl bg-white px-1.5 ring-2', big ? 'h-[4.4rem]' : 'h-14', ok ? 'ring-emerald-500' : no ? 'ring-red-500' : 'ring-[#e0d4b3]')}>
      {/* the slot is one colour: that colour's character, with its badge */}
      <span className={cn('relative shrink-0 rounded-full', big ? 'size-11' : 'size-9')} style={{ background: TEAM_COLOR[src.team], padding: 2 }}>
        <Face team={src.team} className="size-full rounded-full" />
        <TeamBadge team={src.team} className={cn('absolute -bottom-1 -right-1', big ? 'size-5' : 'size-4')} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <PlayerName name={nameOf(players, src.ownerId)} className={cn('font-black', big ? 'text-sm' : 'text-xs')} />
        <span className="text-[10px] font-bold text-[#7a6a46]">{src.kind === 'placard' ? t('boss.table.placard') : t('boss.table.card')}</span>
      </span>
      {ok ? <Check className="size-4 shrink-0 text-emerald-600" aria-hidden="true" /> : no ? <X className="size-4 shrink-0 text-red-600" aria-hidden="true" /> : <Clock className="size-3.5 shrink-0 text-[#b9ab84]" aria-hidden="true" />}
    </li>
  )
}

/**
 * The open deal as the whole table sees it (iPad, and phones without a shared screen):
 * slots by column, face-up Team cards (offered / picked), one payout line per person, and what is still missing.
 */
/** `compact`: a phone's middle on its own screen — two payout columns, no extra lines, so nothing has to scroll. */
export function DealBoard({ view, players, meId, big, compact }: Props & { big?: boolean; compact?: boolean }) {
  const { t } = useTranslation()
  const deal = view.deal
  if (!deal) return null
  const space = view.spaces[deal.spaceIndex]
  const selectedCards = new Set(deal.slots.flatMap((s) => (s.source?.kind === 'card' ? [s.source.cardId] : [])))
  const people = peopleInDeal(deal)
  const waiting = people.filter((p) => p.status === 'wait' || p.status === 'no').map((p) => shortName(nameOf(players, p.id)))
  return (
    <div key={deal.id} className={cn('boss-deal-board boss-contract flex w-full min-w-0 flex-col rounded-2xl bg-[#f6efdc] text-[#241b4b] shadow-[0_10px_30px_rgba(0,0,0,0.45)] ring-1 ring-[#d9cfb2]', big ? 'gap-2.5 p-3' : 'gap-1.5 p-2', compact && 'max-h-full max-w-[36rem] gap-1 overflow-hidden p-1.5')}>
      <header className="flex items-center gap-2">
        <SeatFaces view={view} userId={deal.bossId} round className={big ? 'size-11' : 'size-8'} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className={cn('flex min-w-0 items-center gap-1 font-black', big ? 'text-lg' : 'text-sm')}>
            <span className="shrink-0">{t('boss.status.deal', { n: deal.dealNumber })} ·</span>
            <PlayerName name={nameOf(players, deal.bossId)} />
          </p>
          <p className="text-[11px] font-semibold opacity-70">{t('boss.deal.people', { count: space.teamCount })} · $×{space.dividends}</p>
        </div>
        {/* fixed room for the price so it never sits on the slots */}
        <PriceTag key={deal.totalValue} amount={deal.totalValue} share={view.currentShareValue} dividends={space.dividends} size={big ? 30 : 20} className="boss-price-pop shrink-0" />
      </header>

      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${space.groups.length}, minmax(0, 1fr))` }}>
        {space.groups.map((g, gi) => (
          <section key={gi} className={cn('flex min-w-0 flex-col gap-1', gi > 0 && 'border-l-2 border-dashed border-[#d9cfb2] pl-1.5')}>
            {/* what this part of the deal needs: loud enough to read from across the table */}
            <h4 className={cn('flex flex-wrap items-center gap-1 font-black', big ? 'text-base' : compact ? 'text-[11px]' : 'text-sm')}>
              <span className={cn('rounded-md bg-[#241b4b] text-white', compact ? 'px-1.5' : 'px-2 py-0.5')}>{g.pick === g.teams.length ? t('boss.deal.needs') : t('boss.deal.pick', { count: g.pick })}</span>
              {g.teams.map((team) => (
                <span key={team} className={cn('flex items-center gap-1 rounded-full bg-white pr-2 ring-2', compact ? 'pl-0' : 'py-0.5 pl-0.5', deal.blockedTeams.includes(team) && 'line-through opacity-45')} style={{ ['--tw-ring-color' as string]: TEAM_COLOR[team] }}>
                  <TeamBadge team={team} className={big ? 'size-7' : compact ? 'size-4' : 'size-6'} />{t(`boss.teamShort.${team}`)}
                </span>
              ))}
            </h4>
            <ul className={cn('grid gap-1', big && g.pick > 2 && 'grid-cols-2')}>
              {deal.slots.map((s, i) => (s.group === gi ? <SlotChip key={i} slot={s} deal={deal} players={players} big={big} /> : null))}
            </ul>
          </section>
        ))}
      </div>

      {!compact && (deal.tableCards.length > 0 || deal.blockedTeams.length > 0) && (
        <div className="flex flex-wrap items-center gap-1 text-[10px] font-bold">
          {deal.tableCards.map((c) => (
            <span key={c.id} className={cn('flex items-center gap-1 rounded-md px-1 py-0.5 ring-1', selectedCards.has(c.id) ? 'bg-emerald-100 text-emerald-800 ring-emerald-400' : 'bg-white text-[#5a4a2a] ring-[#d9cfb2]')}>
              <span className="h-3.5 w-2.5 rounded-[2px]" style={{ background: TEAM_COLOR[c.team] }} />
              {shortName(nameOf(players, c.ownerId))} · {selectedCards.has(c.id) ? t('boss.table.selected') : t('boss.table.offered')}
            </span>
          ))}
          {deal.blockedTeams.map((team) => (
            <span key={team} className="flex items-center gap-0.5 rounded-md bg-sky-100 px-1 py-0.5 text-sky-700"><Plane className="size-3" aria-hidden="true" />{t(`boss.teamShort.${team}`)} {t('boss.table.sentAway')}</span>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-0.5 rounded-xl bg-white/70 p-1.5">
        {!deal.offered ? (
          <p className="text-center text-xs font-bold opacity-60">{t('boss.deal.noOffer')}</p>
        ) : (
          <ul className={cn('flex flex-col', big ? 'gap-1 text-sm' : 'gap-0.5 text-xs', compact && people.length > 3 && 'grid grid-cols-2 gap-x-2 text-[11px]')}>
            {people.map((p) => (
              <li key={p.id} className={cn('flex items-center gap-1.5 rounded-lg px-1', p.id === meId && 'bg-amber-100')}>
                <SeatFaces view={view} userId={p.id} round className={big ? 'size-7' : 'size-5'} />
                <PlayerName name={nameOf(players, p.id)} className="min-w-0 flex-1 font-bold" />
                {!(compact && people.length > 3) && <span className="flex shrink-0">{p.teams.map((team) => <TeamBadge key={team} team={team} className={big ? 'size-5' : 'size-4'} />)}</span>}
                <Money amount={p.amount} className={cn('w-14 shrink-0 text-right', big && 'w-16 text-base')} />
                <span className={cn('flex w-14 shrink-0 items-center justify-end gap-0.5 font-bold', p.status === 'ok' && 'text-emerald-700', p.status === 'no' && 'text-red-600', p.status === 'wait' && 'opacity-60', p.status === 'boss' && 'text-amber-700')}>
                  {p.status === 'ok' && <Check className="size-3" aria-hidden="true" />}
                  {p.status === 'no' && <X className="size-3" aria-hidden="true" />}
                  {p.status === 'boss' ? t('boss.status.boss') : p.status === 'ok' ? t('boss.deal.accepted') : p.status === 'no' ? t('boss.deal.declined') : p.status === 'wait' ? t('boss.deal.waiting') : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {!compact && <p className={cn('text-center text-[11px] font-black', deal.canClose ? 'text-emerald-700' : 'text-[#7a5a1a]')}>
        {deal.canClose ? t('boss.deal.ready') : deal.slots.some((s) => !s.source) ? missingText(view, deal, t) : waiting.length ? t('boss.table.waitingFor', { names: waiting.join(', ') }) : ''}
      </p>}
    </div>
  )
}

/**
 * The boss's phone: fill each slot by hand (colour, owner, exact source), then one payout per person.
 * Nothing is filled automatically, even when there is only one choice.
 */
export function BossEditor({ view, players, meId, busy, act }: Props & { meId: string; busy: boolean; act: (a: BossActionPayload) => void }) {
  const { t } = useTranslation()
  const deal = view.deal!
  const space = view.spaces[deal.spaceIndex]
  const [tab, setTab] = useState<1 | 2>(1)
  const [openSlot, setOpenSlot] = useState<number | null>(null)
  const [optionPage, setOptionPage] = useState(0)
  // amounts being typed, in millions, for this deal and this boss
  const key = `${deal.id}:${deal.bossId}`
  const [draft, setDraft] = useState<{ key: string; amounts: Record<string, number> } | null>(null)
  const others = view.seats.filter((s) => s.userId !== meId).map((s) => s.userId)
  const suppliers = new Set(deal.slots.flatMap((s) => (s.source && s.source.ownerId !== meId ? [s.source.ownerId] : [])))
  const order = [...others.filter((id) => suppliers.has(id)), ...others.filter((id) => !suppliers.has(id))]
  const amounts = draft?.key === key ? draft.amounts : Object.fromEntries(others.map((id) => [id, Math.round((deal.allocation[id] ?? 0) / M)]))
  const total = deal.totalValue / M
  const given = Object.values(amounts).reduce((a, b) => a + b, 0)
  const left = total - given
  const set = (id: string, v: number) => setDraft({ key, amounts: { ...amounts, [id]: Math.max(0, Math.min(total, v)) } })
  const submit = () => act({ type: 'submit_offer', allocation: { ...Object.fromEntries(Object.entries(amounts).filter(([, v]) => v > 0).map(([id, v]) => [id, v * M])), ...(left > 0 ? { [meId]: left * M } : {}) } })
  const changed = draft?.key === key && Object.entries(amounts).some(([id, v]) => v * M !== (deal.allocation[id] ?? 0))
  const used = new Set(deal.slots.flatMap((s) => (s.source ? [s.source.team] : [])))

  // choices for one slot: every colour of its column, from each owner placard and each face-up Team card
  const options = (slotIndex: number) => {
    const slot = deal.slots[slotIndex]
    return space.groups[slot.group].teams.flatMap((team) => {
      const owner = view.seats.find((s) => s.investors.includes(team))?.userId
      const list: { key: string; team: InvestorTeam; ownerId: string; kind: 'placard' | 'card'; source: { kind: 'placard'; team: InvestorTeam } | { kind: 'card'; cardId: string }; current: boolean }[] = []
      if (owner && !deal.blockedTeams.includes(team)) list.push({ key: `p:${team}`, team, ownerId: owner, kind: 'placard', source: { kind: 'placard', team }, current: slot.source?.kind === 'placard' && slot.source.team === team })
      for (const c of deal.tableCards.filter((x) => x.team === team)) list.push({ key: c.id, team, ownerId: c.ownerId, kind: 'card', source: { kind: 'card', cardId: c.id }, current: slot.source?.kind === 'card' && slot.source.cardId === c.id })
      return list
    })
  }

  const slotOptions = openSlot !== null && deal.slots[openSlot] ? options(openSlot) : []
  const page = Math.min(optionPage, Math.max(0, Math.ceil(slotOptions.length / 6) - 1))

  return (
    <div className="boss-editor relative flex w-full min-w-0 flex-col gap-1.5 rounded-2xl bg-[#f6efdc] p-2 text-[#241b4b] shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
      <header inert={openSlot !== null} className="flex items-center gap-1.5">
        {([1, 2] as const).map((n) => (
          <button key={n} type="button" onClick={() => setTab(n)} className={cn('h-8 flex-1 rounded-xl text-xs font-black transition', tab === n ? 'bg-[#241b4b] text-white' : 'bg-white/70 text-[#241b4b]')}>
            {t(n === 1 ? 'boss.table.step1' : 'boss.table.step2')}
          </button>
        ))}
        <PriceTag amount={deal.totalValue} share={view.currentShareValue} dividends={space.dividends} size={18} className="shrink-0" />
      </header>

      {tab === 1 ? (
        <>
          <div inert={openSlot !== null} className="boss-slot-groups grid gap-1.5" style={{ gridTemplateColumns: `repeat(${space.groups.length}, minmax(0, 1fr))` }}>
            {space.groups.map((g, gi) => (
              <section key={gi} className={cn('flex min-w-0 flex-col gap-1', gi > 0 && 'border-l-2 border-dashed border-[#d9cfb2] pl-1.5')}>
                <h4 className="flex flex-wrap items-center gap-1 text-[11px] font-black">
                  <span className="rounded-md bg-[#241b4b] px-1.5 text-white">{g.pick === g.teams.length ? t('boss.deal.needs') : t('boss.deal.pick', { count: g.pick })}</span>
                  {g.teams.map((team) => (
                    <span key={team} className={cn('flex items-center gap-0.5 rounded-full bg-white pr-1.5 ring-2', deal.blockedTeams.includes(team) && 'line-through opacity-45')} style={{ ['--tw-ring-color' as string]: TEAM_COLOR[team] }}>
                      <TeamBadge team={team} className="size-4" /><span className="boss-group-color-label">{t(`boss.teamShort.${team}`)}</span>
                    </span>
                  ))}
                </h4>
                {deal.slots.map((s, i) => s.group !== gi ? null : (
                  <button key={i} type="button" onClick={() => { setOpenSlot(i); setOptionPage(0) }}
                    className={cn('flex h-10 min-w-0 shrink-0 items-center gap-1.5 rounded-xl px-1.5 text-left transition', s.source ? 'bg-white ring-2 ring-[#e0d4b3]' : 'border-2 border-dashed border-[#b9ab84]', openSlot === i && 'ring-2 ring-[#ffb703]')}>
                    {s.source ? (
                      <>
                        <TeamBadge team={s.source.team} className="size-7" />
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate text-xs font-black">{shortName(nameOf(players, s.source.ownerId))}</span>
                          <span className="text-[10px] font-bold text-[#7a6a46]">{s.source.kind === 'placard' ? t('boss.table.placard') : t('boss.table.card')}</span>
                        </span>
                      </>
                    ) : (
                      <span className="flex min-w-0 flex-1 flex-col items-center leading-tight text-[#7a6a46]">
                        <span className="text-xs font-black">{t('boss.table.slotTap')}</span>
                        {s.lost && <span className="w-full truncate text-center text-[10px] font-bold text-red-700">{t('boss.table.lost', { team: t(`boss.teamShort.${s.lost.team}`), name: shortName(nameOf(players, s.lost.ownerId)) })}</span>}
                      </span>
                    )}
                  </button>
                ))}
              </section>
            ))}
          </div>
          {openSlot !== null && deal.slots[openSlot] && (
            <div className="boss-slot-picker absolute inset-0 z-10 flex flex-col gap-1 rounded-2xl bg-[#f6efdc] p-1.5">
              <header className="flex min-h-11 items-center justify-between gap-1">
                <p className="text-xs font-black">{t('boss.table.chooseFor')}</p>
                <button type="button" className="min-h-11 rounded-lg bg-white px-3 text-xs font-bold" onClick={() => setOpenSlot(null)}>{t('common.back')}</button>
              </header>
              <div className="grid grid-cols-2 gap-1">
                {slotOptions.slice(page * 6, page * 6 + 6).map((o) => {
                  const taken = used.has(o.team) && !o.current
                  return (
                    <button key={o.key} type="button" disabled={busy || taken || o.current} onClick={() => { act({ type: 'set_slot', slot: openSlot, source: o.source }); setOpenSlot(null) }}
                      className={cn('flex h-11 min-w-0 items-center gap-1.5 rounded-lg bg-white px-1.5 text-left ring-1 ring-[#e0d4b3] transition-transform active:scale-95 motion-reduce:transition-none disabled:opacity-40', o.current && 'bg-emerald-100 ring-emerald-500')}>
                      <TeamBadge team={o.team} className="size-7" />
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate text-xs font-black">{shortName(nameOf(players, o.ownerId))}{o.ownerId === meId ? ` (${t('boss.status.you')})` : ''}</span>
                        <span className="text-[10px] font-bold text-[#7a6a46]">{o.kind === 'placard' ? t('boss.table.placard') : t('boss.table.card')}{taken ? ` · ${t('boss.table.taken')}` : ''}</span>
                      </span>
                    </button>
                  )
                })}
                {slotOptions.length === 0 && <p className="col-span-2 py-2 text-center text-xs font-bold">{t('boss.table.noOption')}</p>}
              </div>
              <footer className="mt-auto flex min-h-11 gap-1">
                {deal.slots[openSlot].source && <button type="button" disabled={busy} onClick={() => { act({ type: 'set_slot', slot: openSlot, source: null }); setOpenSlot(null) }} className="min-h-11 flex-1 rounded-lg bg-red-50 px-2 text-xs font-black text-red-700">{t('boss.table.clear')}</button>}
                {slotOptions.length > 6 && <>
                  <button type="button" disabled={page === 0} onClick={() => setOptionPage(page - 1)} className="min-h-11 flex-1 rounded-lg bg-white px-2 text-xs font-bold disabled:opacity-40">{t('boss.phone.previous')}</button>
                  <button type="button" disabled={(page + 1) * 6 >= slotOptions.length} onClick={() => setOptionPage(page + 1)} className="min-h-11 flex-1 rounded-lg bg-white px-2 text-xs font-bold disabled:opacity-40">{t('boss.phone.next')}</button>
                </>}
              </footer>
            </div>
          )}
          <p className="text-center text-[11px] font-black text-[#7a5a1a]">{missingText(view, deal, t)}</p>
        </>
      ) : (
        <>
          <ul className="boss-payouts flex flex-col gap-1">
            {order.map((id) => {
              const teams = deal.slots.flatMap((s) => (s.source?.ownerId === id ? [s.source.team] : []))
              const st = deal.acceptedIds.includes(id) ? 'ok' : deal.declinedIds.includes(id) ? 'no' : null
              return (
                <li key={id} className={cn('flex h-10 items-center gap-1.5 rounded-xl bg-white px-1.5 ring-1', teams.length ? 'ring-[#e0d4b3]' : 'ring-transparent opacity-90')}>
                  <SeatFaces view={view} userId={id} round className="size-7" />
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="flex items-center gap-1 truncate text-xs font-black">{shortName(nameOf(players, id))}{st === 'ok' && <Check className="size-3 text-emerald-600" />}{st === 'no' && <X className="size-3 text-red-600" />}</span>
                    <span className="flex items-center gap-0.5">{teams.length ? teams.map((team) => <TeamBadge key={team} team={team} className="size-3.5" />) : <span className="text-[10px] font-bold text-[#7a6a46]">{t('boss.table.bribe')}</span>}</span>
                  </span>
                  <button type="button" aria-label={t('boss.phone.giveLess', { name: nameOf(players, id) })} className="flex size-8 items-center justify-center rounded-lg bg-[#241b4b]/10" onClick={() => set(id, (amounts[id] ?? 0) - 1)}><Minus className="size-4" /></button>
                  <Money amount={(amounts[id] ?? 0) * M} className="boss-payout-money w-12 text-center text-sm" />
                  <button type="button" aria-label={t('boss.phone.giveMore', { name: nameOf(players, id) })} className="flex size-8 items-center justify-center rounded-lg bg-[#241b4b]/10" onClick={() => set(id, (amounts[id] ?? 0) + 1)}><Plus className="size-4" /></button>
                </li>
              )
            })}
          </ul>
          <div className="boss-payout-footer">
            <p className={cn('text-center text-xs font-black', left < 0 ? 'text-red-600' : 'text-[#7a5a1a]')}>
              {left < 0 ? t('boss.table.over', { amount: t('boss.money', { m: -left }) }) : t('boss.table.left', { amount: t('boss.money', { m: left }) })}
            </p>
            <Button className={cn('h-10 rounded-xl font-black', (changed || !deal.offered) && left >= 0 && 'boss-glow')} disabled={busy || left < 0 || (deal.offered && !changed)} onClick={submit}>
              {deal.offered ? t('boss.table.resubmit') : t('boss.table.submit')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

/** A supplier or paid player: exactly what they agree to, and accept / decline bound to that version. */
export function OfferCard({ view, players, meId, busy, act }: Props & { meId: string; busy: boolean; act: (a: BossActionPayload) => void }) {
  const { t } = useTranslation()
  const deal = view.deal!
  const version = deal.terms[meId]
  if (version === undefined) return null
  const teams = deal.slots.flatMap((s) => (s.source?.ownerId === meId ? [{ team: s.source.team, kind: s.source.kind }] : []))
  const amount = deal.allocation[meId] ?? 0
  const accepted = deal.acceptedIds.includes(meId)
  const declined = deal.declinedIds.includes(meId)
  const names = teams.map((x) => `${t(`boss.teamShort.${x.team}`)} (${x.kind === 'placard' ? t('boss.table.placard') : t('boss.table.card')})`).join(' + ')
  return (
    <div key={version} className="boss-offer boss-contract flex w-full max-w-sm flex-col gap-2 rounded-2xl bg-[#f6efdc] p-3 text-[#241b4b] shadow-[0_10px_30px_rgba(0,0,0,0.45)] ring-2 ring-[#ffb703]">
      <p className="flex items-center gap-1.5 text-xs font-bold opacity-75"><SeatFaces view={view} userId={deal.bossId} round className="size-6" />{t('boss.table.fromBoss', { name: shortName(nameOf(players, deal.bossId)) })}</p>
      <div className="flex items-center gap-2">
        <span className="flex shrink-0">{teams.length ? teams.map((x) => <TeamBadge key={x.team} team={x.team} className="size-9" />) : <span className="text-3xl">🤝</span>}</span>
        <p className="min-w-0 text-base font-black leading-tight">
          {teams.length ? t('boss.table.termsUse', { teams: names }) : t('boss.table.termsNoUse')}
          <span className="block text-2xl text-[#b45309]">{t('boss.table.termsGive', { amount: t('boss.money', { m: amount / M }) })}</span>
          {!teams.length && <span className="block text-[11px] font-bold opacity-70">{t('boss.table.termsBribe')}</span>}
        </p>
      </div>
      {accepted ? (
        <p className="rounded-xl bg-emerald-100 py-2 text-center text-sm font-black text-emerald-800">{t('boss.table.acceptedWait')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" className="h-11 rounded-xl font-black" disabled={busy || declined} onClick={() => act({ type: 'decline_offer', version })}>{declined ? t('boss.table.declinedYou') : t('boss.act.decline')}</Button>
          <Button className="boss-glow h-11 rounded-xl text-base font-black" disabled={busy} onClick={() => act({ type: 'accept_offer', version })}>{t('boss.act.accept')}</Button>
        </div>
      )}
    </div>
  )
}
