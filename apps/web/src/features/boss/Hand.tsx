import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BossActionPayload, BossHandCard, BossView, InvestorTeam, RoomPlayer } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Word } from './Word'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { cn } from '@/lib/utils'
import { cardArt, cardKey, cardName, faceArt, fxArt, moneyArt, nameOf, shortName, TEAM_COLOR, TEAMS } from './meta'
import { TeamBadge } from './parts'

/** Card look: coloured frame, light art panel, name (+ team) underneath — like a real card. */
const KIND_STYLE = {
  travel: { frame: '#2f9fb3', art: '#dff6f9', ink: '#fff' },
  boss: { frame: '#e9b949', art: '#fff6dc', ink: '#241b4b' },
  stop: { frame: '#c43a3a', art: '#ffe4e1', ink: '#fff' },
  recruit: { frame: '#6b6fb8', art: '#ecebff', ink: '#fff' },
} as const


/** One influence card face. `size` = width in px; the card is 5:7. */
export function CardFace({ card, size = 88, className, count, glow, detail = true }: { card: BossHandCard; size?: number; className?: string; count?: number; glow?: boolean; detail?: boolean }) {
  const { t } = useTranslation()
  const style = card.kind === 'team' ? { frame: TEAM_COLOR[card.team], art: '#ffffffd9', ink: '#fff' } : KIND_STYLE[card.kind]
  const team = 'team' in card && card.team !== 'any' ? t(`boss.teamShort.${card.team}`) : ''
  const desc = card.kind === 'team' ? t('boss.cards.descTeam', { team })
    : card.kind === 'travel' ? (card.team === 'any' ? t('boss.cards.descTravelAny') : t('boss.cards.descTravel', { team }))
    : card.kind === 'boss' ? t('boss.cards.descBoss') : card.kind === 'stop' ? t('boss.cards.descStop') : t('boss.cards.descRecruit')
  return (
    <span
      className={cn('boss-card relative flex shrink-0 flex-col rounded-[12%/8.6%] p-[6%] shadow-[0_8px_18px_rgba(0,0,0,0.45)]', glow && 'boss-card-glow', className)}
      style={{ width: size, height: size * 1.42, background: style.frame }}
    >
      <span className={cn('relative flex items-center justify-center overflow-hidden rounded-[10%/14%]', detail ? 'h-[50%]' : 'h-[58%]')} style={{ background: style.art }}>
        {card.kind === 'team' ? (
          <>
            <img src={faceArt(card.team)} alt="" className="h-[96%] object-contain object-bottom" draggable={false} />
            <TeamBadge team={card.team} className="absolute bottom-[4%] right-[4%] size-[34%]" />
          </>
        ) : (
          <>
            <img src={cardArt(card.kind)} alt="" className="h-[86%] object-contain" draggable={false} />
            {card.kind === 'travel' && card.team !== 'any' && <TeamBadge team={card.team} className="absolute bottom-[4%] right-[4%] size-[34%]" />}
          </>
        )}
      </span>
      <span className="mt-[5%] flex flex-1 flex-col items-center justify-start gap-[3%] text-center leading-[1.15]" style={{ color: style.ink }}>
        <span className="font-black" style={{ fontSize: Math.max(9, size * 0.14) }}>{cardName(card, t)}</span>
        {/* Thai has no spaces between words: each space-separated chunk stays whole, lines break only between chunks */}
        {detail && <span className="font-semibold opacity-90" style={{ fontSize: Math.max(8, size * 0.1) }}>{desc.split(' ').map((w, i) => <Fragment key={i}>{i > 0 && ' '}<span className="inline-block whitespace-nowrap">{w}</span></Fragment>)}</span>}
      </span>
      {count !== undefined && count > 1 && <span className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-[#241b4b] text-xs font-black text-white ring-2 ring-white">×{count}</span>}
    </span>
  )
}

type Act = (action: BossActionPayload) => void

/** Whether this card can be played now; every card remains readable. */
function playable(view: BossView, meId: string, card: BossHandCard) {
  const deal = view.deal
  if (card.kind === 'stop') return view.phase === 'interrupt' && view.interrupt?.actorId !== meId && !view.interrupt?.stoppedBy
  if (!deal || (view.phase !== 'negotiating' && view.phase !== 'closing')) return false
  const teams = view.spaces[deal.spaceIndex].groups.flatMap((g) => g.teams)
  if (card.kind === 'team') return teams.includes(card.team)
  if (card.kind === 'boss') return deal.bossId !== meId
  if (card.kind === 'recruit') return view.myHand.filter((c) => c.kind === 'recruit').length >= 3
  if (card.kind !== 'travel') return false
  return (card.team === 'any' ? teams : teams.filter((x) => x === card.team)).some((x) => (deal.providers[x] ?? []).some((id) => id !== meId))
}

/** Size of an element, kept up to date (the hand fits its cards to whatever room the layout gives it). */
function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, box] as const
}

/**
 * A straight, bounded row of full-colour piles. The foreground copy sits lowest.
 * ResizeObserver accounts for both axes when a decision takes space above the hand.
 */
export function HandBar({ view, players, meId, busy, act, big = false }: { view: BossView; players: RoomPlayer[]; meId: string; busy: boolean; act: Act; big?: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<BossHandCard | null>(null)
  const [ref, box] = useBox<HTMLDivElement>()
  const stacks = new Map<string, BossHandCard[]>()
  for (const c of view.myHand) stacks.set(cardKey(c), [...(stacks.get(cardKey(c)) ?? []), c])
  const order = ['boss', 'stop', 'recruit', ...TEAMS.map((x) => `team:${x}`), 'travel:any', ...TEAMS.map((x) => `travel:${x}`)]
  const sorted = [...stacks.entries()].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
  const n = sorted.length
  const padding = big ? 9 : 3
  const lift = big ? 6 : 3
  const layers = Math.min(4, Math.max(1, ...sorted.map(([, cards]) => cards.length)))
  // each extra copy of a card peeks out ~11% of the card height above the one in front
  const stepRatio = 0.11
  const stack = 1 + stepRatio * (layers - 1)
  const width = Math.max(0, box.w - padding * 2)
  const height = Math.max(0, box.h - padding * 2 - lift)
  // At most 12% overlap. Height always wins, including a short decision-hand row.
  const size = Math.max(0, Math.min(big ? 150 : 100, height / (1.42 * stack), width / (1 + Math.max(0, n - 1) * 0.88)))
  const layerStep = size * 1.42 * stepRatio
  const pileHeight = (layers - 1) * layerStep
  const step = n > 1 ? Math.min(size + 8, (width - size) / (n - 1)) : 0
  const rowWidth = size + step * Math.max(0, n - 1)
  return (
    <>
      <div ref={ref} className="boss-hand relative h-full w-full" aria-label={t('boss.cards.hand', { count: view.myHand.length })}>
        {n === 0 && (
          // no cards yet: an empty card outline says so, instead of a blank hole
          <div className="absolute inset-0 flex items-center justify-center gap-3 text-white/55">
            <span className="aspect-[1/1.42] h-[70%] max-h-24 rounded-[12%/8.6%] border-2 border-dashed border-white/25" aria-hidden="true" />
            <span className="max-w-[14rem] text-sm font-bold leading-snug">{t('boss.cards.emptyHand')}</span>
          </div>
        )}
        <div className="boss-hand-track absolute left-1/2 top-1/2" style={{ width: rowWidth, height: size * 1.42, transform: `translate(-50%, calc(-50% + ${pileHeight / 2}px))` }}>
          {size > 0 && sorted.map(([key, cards], i) => {
            const can = playable(view, meId, cards[0])
            const selected = open && cardKey(open) === key
            const copies = Math.min(cards.length, 4)
            return (
              <button
                key={key}
                type="button"
                aria-label={t('boss.phone.cardPile', { name: cardName(cards[0], t), count: cards.length })}
                className={cn('boss-hand-card absolute bottom-0 rounded-[12%/8.6%] transition-transform duration-200 ease-out hover:z-50 focus-visible:z-50 motion-reduce:transition-none', selected && 'z-50')}
                style={{
                  width: size,
                  height: size * 1.42,
                  left: i * step,
                  zIndex: selected ? 50 : i + 1,
                  transform: `translateY(${can ? -lift : 0}px)`,
                  animationDelay: `${i * 50}ms`,
                }}
                onClick={() => setOpen(cards[0])}
              >
                {Array.from({ length: copies - 1 }, (_, layer) => (
                  <span key={layer} aria-hidden="true" className="boss-pile-copy absolute inset-0 rounded-[inherit] border border-white/60"
                    style={{ background: cards[0].kind === 'team' ? TEAM_COLOR[cards[0].team] : KIND_STYLE[cards[0].kind].frame, transform: `translateY(${-(copies - layer - 1) * layerStep}px)`, filter: `brightness(${0.72 + layer * 0.1})` }} />
                ))}
                <CardFace card={cards[0]} size={size} detail={size >= 72} className={cn('relative', can && 'boss-card-playable')} />
                {cards.length > 1 && <span className="absolute right-1 z-10 rounded-full bg-[#241b4b] px-1.5 text-xs font-black leading-5 text-white ring-2 ring-white" style={{ top: -(copies - 1) * layerStep - 8 }}>×{cards.length}</span>}
              </button>
            )
          })}
        </div>
      </div>
      <CardSheet key={open?.id} card={open} onClose={() => setOpen(null)} view={view} players={players} meId={meId} busy={busy} act={(a) => { act(a); setOpen(null) }} />
    </>
  )
}

function CardSheet({ card, onClose, view, players, meId, busy, act }: { card: BossHandCard | null; onClose: () => void; view: BossView; players: RoomPlayer[]; meId: string; busy: boolean; act: Act }) {
  const { t } = useTranslation()
  const deal = view.deal
  const talking = !!deal && (view.phase === 'negotiating' || view.phase === 'closing')
  const space = deal ? view.spaces[deal.spaceIndex] : null
  const inDeal = (team: InvestorTeam) => !!space && space.groups.some((g) => g.teams.includes(team))
  const [chosen, choose] = useState('')
  const [page, setPage] = useState(0)
  if (!card) return null
  const targets: { id: string; team: InvestorTeam; owner: string; why?: string; action: BossActionPayload }[] = []
  let action: BossActionPayload | undefined
  let reason = ''
  if (card.kind === 'stop') reason = t('boss.cards.stopOnly')
  else if (!talking || !deal) reason = t('boss.cards.notNow')
  else if (card.kind === 'team') {
    if (inDeal(card.team)) action = { type: 'play_team', cardId: card.id }
    else reason = t('boss.cards.notInDeal')
  } else if (card.kind === 'boss') {
    if (deal.bossId !== meId) action = { type: 'play_boss', cardId: card.id }
    else reason = t('boss.cards.notNow')
  } else if (card.kind === 'travel') {
    for (const team of (card.team === 'any' ? TEAMS : [card.team]).filter(inDeal)) {
      const owner = view.seats.find((s) => s.investors.includes(team))
      if (owner) targets.push({ id: team, team, owner: t('boss.deal.investor', { name: shortName(nameOf(players, owner.userId)) }),
        why: owner.userId === meId ? t('boss.errors.OWN_TEAM') : deal.blockedTeams.includes(team) ? t('boss.table.sentAway') : undefined,
        action: { type: 'play_travel', cardId: card.id, targetTeam: team } })
      for (const c of deal.tableCards.filter((c) => c.team === team)) targets.push({ id: c.id, team,
        owner: t('boss.deal.byCard', { name: shortName(nameOf(players, c.ownerId)) }), why: c.ownerId === meId ? t('boss.errors.OWN_TEAM') : undefined,
        action: { type: 'play_travel', cardId: card.id, targetTeam: team, targetCardId: c.id } })
    }
    if (!targets.length) reason = t('boss.cards.notInDeal')
  } else {
    const recruits = view.myHand.filter((c) => c.kind === 'recruit')
    if (recruits.length < 3) reason = t('boss.cards.recruitNeed', { count: recruits.length })
    else for (const team of TEAMS) {
      const owner = view.seats.find((s) => s.investors.includes(team))
      targets.push({ id: team, team, owner: owner ? shortName(nameOf(players, owner.userId)) : t('boss.phone.free'),
        why: view.availableInvestors.length && owner ? t('boss.cards.recruitFirst') : owner?.userId === meId ? t('boss.cards.notNow') : undefined,
        action: { type: 'play_recruit', cardIds: recruits.slice(0, 3).map((c) => c.id) as [string, string, string], targetTeam: team } })
    }
  }
  const active = action ?? targets.find((x) => x.id === chosen && !x.why)?.action
  const pages = Math.ceil(targets.length / 3)
  const current = Math.min(page, Math.max(0, pages - 1))
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="boss-card-dialog" title={<Word text={cardName(card, t)} />}>
        <DialogClose aria-label={t('common.back')} className="boss-detail-close">×</DialogClose>
        <div className="boss-detail-face"><CardFace card={card} size={110} /></div>
        <CardHow card={card} />
        {targets.length > 0 && <div className="boss-targets">
          {targets.slice(current * 3, current * 3 + 3).map((x) => <button key={x.id} type="button" disabled={busy || !!x.why}
            aria-pressed={x.id === chosen} onClick={() => choose(x.id)}>
            <img src={faceArt(x.team)} alt="" style={{ borderColor: TEAM_COLOR[x.team] }} />
            <b>{t(`boss.teamShort.${x.team}`)}</b><small>{x.why || x.owner}</small>
          </button>)}
        </div>}
        <div className="boss-detail-actions">
          {pages > 1 && <button type="button" onClick={() => { setPage((current + 1) % pages); choose('') }}>{t('boss.phone.next')} {current + 1}/{pages}</button>}
          {reason ? <p>{reason}</p> : <><span>{card.kind === 'team' ? t('boss.table.teamWarn') : targets.length && !active ? t(card.kind === 'recruit' ? 'boss.cards.recruitWho' : 'boss.cards.travelWho') : ''}</span>
            <Button disabled={busy || !active} onClick={() => active && act(active)}>{t('boss.phone.play')}</Button></>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** The card big, and what happens when it's played in three pictures. */
function CardHow({ card }: { card: BossHandCard }) {
  const { t } = useTranslation()
  const team = 'team' in card && card.team !== 'any' ? card.team : null
  const teamName = team ? t(`boss.teamShort.${team}`) : t('boss.cards.anyTeam')
  const stop = { img: fxArt('stop'), text: t('boss.cards.how2') }
  const steps: { img: string; text: string }[] =
    card.kind === 'team' ? [{ img: faceArt(card.team), text: t('boss.cards.teamHow1', { team: teamName }) }, { img: fxArt('ribbon'), text: t('boss.cards.teamHow2') }, { img: moneyArt('coins'), text: t('boss.cards.teamHow3') }]
    : card.kind === 'travel' ? [{ img: fxArt('plane'), text: team ? t('boss.cards.travelHow1', { team: teamName }) : t('boss.cards.travelHow1Any') }, stop, { img: faceArt(team ?? 'blue', 'upset'), text: t('boss.cards.travelHow3') }]
    : card.kind === 'boss' ? [{ img: fxArt('crown'), text: t('boss.cards.bossHow1') }, stop, { img: fxArt('trophy'), text: t('boss.cards.bossHow3') }]
    : card.kind === 'recruit' ? [{ img: fxArt('magnet'), text: t('boss.cards.recruitHow1') }, stop, { img: faceArt('green', 'happy'), text: t('boss.cards.recruitHow3') }]
    : [{ img: fxArt('burst'), text: t('boss.cards.stopHow1') }, { img: fxArt('stop'), text: t('boss.cards.stopHow2') }, { img: fxArt('stamp'), text: t('boss.cards.stopHow3') }]
  return (
    <div className="flex items-center gap-3 rounded-3xl bg-[#241b4b] p-3 text-white">

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-xs font-bold text-[#ffd77a]">{t('boss.cards.howTitle')}</span>
        <ol className="flex items-stretch gap-1">
          {steps.map((x, i) => (
            <li key={i} className="boss-how flex flex-1 flex-col items-center gap-1 rounded-2xl bg-white/10 p-1.5 text-center" style={{ animationDelay: `${150 + i * 180}ms` }}>
              <img src={x.img} alt="" className="size-10 object-contain drop-shadow" />
              <span className="text-[10px] font-semibold leading-tight">{x.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

/** Over twelve after drawing: pick which to throw away. */
export function DiscardSheet({ view, busy, act }: { view: BossView; busy: boolean; act: Act }) {
  const { t } = useTranslation()
  const need = view.discardPendingCount
  const [picked, setPicked] = useState<string[]>([])
  return (
    <BottomSheet full open={need > 0} onOpenChange={() => {}} title={t('boss.cards.discardTitle', { count: need })}
      footer={<div className="border-t p-3"><Button size="lg" className="h-13 w-full text-lg" disabled={busy || picked.length !== need} onClick={() => act({ type: 'discard_cards', cardIds: picked })}>{t('boss.act.discard', { count: need })}</Button></div>}>
      <div className="grid grid-cols-4 gap-2 px-4 pb-4">
        {view.myHand.map((c) => {
          const on = picked.includes(c.id)
          return (
            <button key={c.id} type="button" aria-pressed={on} className={cn('relative rounded-xl p-1', on && 'bg-red-100 ring-2 ring-red-500')} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : p.length < need ? [...p, c.id] : p))}>
              <CardFace card={c} size={64} />
              {on && <span aria-hidden="true" className="absolute right-0 top-0 rounded-full bg-red-700 px-1 text-xs font-bold text-white">✓</span>}
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}
