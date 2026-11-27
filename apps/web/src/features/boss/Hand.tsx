import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BossActionPayload, BossHandCard, BossView, InvestorTeam, RoomPlayer } from '@/api/types'
import { Button } from '@/components/ui/button'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { cn } from '@/lib/utils'
import { cardArt, cardKey, cardName, faceArt, fxArt, moneyArt, nameOf, TEAM_COLOR, TEAMS } from './meta'
import { TeamBadge } from './parts'

/** Card look: coloured frame, light art panel, name (+ team) underneath — like a real card. */
const KIND_STYLE = {
  travel: { frame: '#2f9fb3', art: '#dff6f9', ink: '#fff' },
  boss: { frame: '#e9b949', art: '#fff6dc', ink: '#241b4b' },
  stop: { frame: '#c43a3a', art: '#ffe4e1', ink: '#fff' },
  recruit: { frame: '#6b6fb8', art: '#ecebff', ink: '#fff' },
} as const


/** One influence card face. `size` = width in px; the card is 5:7. */
export function CardFace({ card, size = 88, className, count, glow, dim, detail = true }: { card: BossHandCard; size?: number; className?: string; count?: number; glow?: boolean; dim?: boolean; detail?: boolean }) {
  const { t } = useTranslation()
  const style = card.kind === 'team' ? { frame: TEAM_COLOR[card.team], art: '#ffffffd9', ink: '#fff' } : KIND_STYLE[card.kind]
  const team = 'team' in card && card.team !== 'any' ? t(`boss.teamShort.${card.team}`) : ''
  const desc = card.kind === 'team' ? t('boss.cards.descTeam', { team })
    : card.kind === 'travel' ? (card.team === 'any' ? t('boss.cards.descTravelAny') : t('boss.cards.descTravel', { team }))
    : card.kind === 'boss' ? t('boss.cards.descBoss') : card.kind === 'stop' ? t('boss.cards.descStop') : t('boss.cards.descRecruit')
  return (
    <span
      className={cn('boss-card relative flex shrink-0 flex-col rounded-[12%/8.6%] p-[6%] shadow-[0_8px_18px_rgba(0,0,0,0.45)] transition-[filter,opacity] duration-300', glow && 'boss-card-glow', dim && 'opacity-60 saturate-[0.35]', className)}
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
        <span className="font-black" style={{ fontSize: size * 0.14 }}>{cardName(card, t)}</span>
        {detail && <span className="font-semibold opacity-90 [word-break:keep-all]" style={{ fontSize: Math.max(8, size * 0.1) }}>{desc}</span>}
      </span>
      {count !== undefined && count > 1 && <span className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-[#241b4b] text-xs font-black text-white ring-2 ring-white">×{count}</span>}
    </span>
  )
}

type Act = (action: BossActionPayload) => void

/** Whether this card does something right now (bright in the hand) or not (dimmed). */
function playable(view: BossView, meId: string, card: BossHandCard) {
  const deal = view.deal
  if (card.kind === 'stop') return view.phase === 'interrupt' && view.interrupt?.actorId !== meId && !view.interrupt?.stoppedBy
  if (!deal || (view.phase !== 'negotiating' && view.phase !== 'closing')) return false
  const teams = view.spaces[deal.spaceIndex].groups.flatMap((g) => g.teams)
  if (card.kind === 'team') return teams.includes(card.team)
  if (card.kind === 'boss') return deal.bossId !== meId
  if (card.kind === 'recruit') return view.myHand.filter((c) => c.kind === 'recruit').length >= 3
  if (card.kind !== 'travel') return false
  return (card.team === 'any' ? teams : teams.filter((x) => x === card.team)).some((x) => (deal.providers[x]?.length ?? 0) > 0)
}

/** My hand: same cards stacked; tap one to see what it can do right now. */
/** Card width in the hand: tall enough for name + ability, short enough to fit the bottom row of a landscape phone. */
const HAND_CARD = 70

export function HandBar({ view, players, meId, busy, act }: { view: BossView; players: RoomPlayer[]; meId: string; busy: boolean; act: Act }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<BossHandCard | null>(null)
  const stacks = new Map<string, BossHandCard[]>()
  for (const c of view.myHand) stacks.set(cardKey(c), [...(stacks.get(cardKey(c)) ?? []), c])
  const order = ['boss', 'stop', 'recruit', ...TEAMS.map((x) => `team:${x}`), 'travel:any', ...TEAMS.map((x) => `travel:${x}`)]
  const sorted = [...stacks.entries()].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
  return (
    <>
      <div className="boss-hand flex h-full items-end overflow-x-auto overflow-y-hidden px-1 pt-2 [scrollbar-width:none]" role="list" aria-label={t('boss.cards.hand', { count: view.myHand.length })}>
        <div className="mx-auto flex w-max items-end gap-1.5 pb-1">
          {sorted.map(([key, cards], i) => {
            const can = playable(view, meId, cards[0])
            const glow = can && (cards[0].kind === 'stop' || view.phase !== 'interrupt')
            return (
              <button
                key={key}
                type="button"
                role="listitem"
                aria-label={cardName(cards[0], t)}
                className={cn('boss-hand-card shrink-0 origin-bottom rounded-[12%/8.6%] transition-transform duration-200 hover:-translate-y-1.5 focus-visible:-translate-y-1.5 active:scale-95', can && '-translate-y-1')}
                style={{ animationDelay: `${i * 50}ms` }}
                onClick={() => setOpen(cards[0])}
              >
                <CardFace card={cards[0]} size={HAND_CARD} count={cards.length} glow={glow && cards[0].kind === 'stop'} dim={!can} className={cn(can && cards[0].kind !== 'stop' && 'boss-card-ready')} />
              </button>
            )
          })}
        </div>
      </div>
      <CardSheet card={open} onClose={() => setOpen(null)} view={view} players={players} meId={meId} busy={busy} act={(a) => { act(a); setOpen(null) }} />
    </>
  )
}

function CardSheet({ card, onClose, view, players, meId, busy, act }: { card: BossHandCard | null; onClose: () => void; view: BossView; players: RoomPlayer[]; meId: string; busy: boolean; act: Act }) {
  const { t } = useTranslation()
  const deal = view.deal
  const talking = !!deal && (view.phase === 'negotiating' || view.phase === 'closing')
  const space = deal ? view.spaces[deal.spaceIndex] : null
  const inDeal = (team: InvestorTeam) => !!space && space.groups.some((g) => g.teams.includes(team))
  let body: React.ReactNode = null
  if (card) {
    const reason = (text: string) => <p className="rounded-2xl bg-muted p-3 text-center text-sm">{text}</p>
    if (card.kind === 'stop') body = reason(t('boss.cards.stopOnly'))
    else if (!talking) body = reason(t('boss.cards.notNow'))
    else if (card.kind === 'team') {
      body = inDeal(card.team)
        ? <Button size="lg" className="h-14 text-lg" disabled={busy} onClick={() => act({ type: 'play_team', cardId: card.id })}>{t('boss.cards.playTeam', { team: t(`boss.teamShort.${card.team}`) })}</Button>
        : reason(t('boss.cards.notInDeal'))
    } else if (card.kind === 'boss') {
      body = deal!.bossId === meId ? reason(t('boss.cards.notNow')) : <Button size="lg" className="h-14 text-lg" disabled={busy} onClick={() => act({ type: 'play_boss', cardId: card.id })}>{t('boss.cards.playBoss')}</Button>
    } else if (card.kind === 'travel') {
      const teams = (card.team === 'any' ? TEAMS : [card.team]).filter(inDeal)
      const targets: { key: string; team: InvestorTeam; label: string; cardId?: string }[] = []
      for (const team of teams) {
        const owner = view.seats.find((s) => s.investors.includes(team))
        if (owner && !deal!.blockedTeams.includes(team)) targets.push({ key: `p:${team}`, team, label: t('boss.deal.investor', { name: nameOf(players, owner.userId) }) })
        for (const tc of deal!.tableCards.filter((c) => c.team === team)) targets.push({ key: tc.id, team, label: t('boss.deal.byCard', { name: nameOf(players, tc.ownerId) }), cardId: tc.id })
      }
      body = targets.length ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold">{t('boss.cards.travelWho')}</p>
          <div className="grid grid-cols-3 gap-2">
            {targets.map((x) => (
              <button key={x.key} type="button" disabled={busy} onClick={() => act({ type: 'play_travel', cardId: card.id, targetTeam: x.team, ...(x.cardId ? { targetCardId: x.cardId } : {}) })}
                className="flex flex-col items-center gap-1 rounded-2xl border-2 p-2 transition active:scale-95 disabled:opacity-50" style={{ borderColor: TEAM_COLOR[x.team] }}>
                <img src={faceArt(x.team, 'upset')} alt="" className="size-14 object-contain" />
                <span className="text-center text-xs font-bold leading-tight">{x.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : reason(t('boss.cards.notInDeal'))
    } else if (card.kind === 'recruit') {
      const recruits = view.myHand.filter((c) => c.kind === 'recruit')
      const pool: InvestorTeam[] = view.availableInvestors.length ? view.availableInvestors : view.seats.filter((s) => s.userId !== meId).flatMap((s) => s.investors)
      body = recruits.length < 3 ? reason(t('boss.cards.recruitNeed', { count: recruits.length })) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold">{t('boss.cards.recruitWho')}</p>
          {view.availableInvestors.length > 0 && <p className="text-xs text-muted-foreground">{t('boss.cards.recruitFirst')}</p>}
          <div className="grid grid-cols-3 gap-2">
            {pool.map((team) => (
              <Button key={team} variant="secondary" className="h-auto flex-col gap-0.5 rounded-2xl border-2 py-2" style={{ borderColor: TEAM_COLOR[team] }} disabled={busy} onClick={() => act({ type: 'play_recruit', cardIds: [recruits[0].id, recruits[1].id, recruits[2].id], targetTeam: team })}>
                <img src={faceArt(team, 'happy')} alt="" className="size-12 object-contain" /><span className="text-xs">{t(`boss.teamShort.${team}`)}</span>
              </Button>
            ))}
          </div>
        </div>
      )
    }
  }
  return (
    <BottomSheet full open={card !== null} onOpenChange={(v) => { if (!v) onClose() }} title={card ? cardName(card, t) : ''}>
      <div className="flex flex-col gap-3 px-4 pb-6">{card && <CardHow card={card} />}{body}</div>
    </BottomSheet>
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
      <CardFace card={card} size={92} className="boss-card-slam -rotate-3" />
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
            <button key={c.id} type="button" aria-pressed={on} className={cn('rounded-xl p-1 transition', on && 'bg-red-100 ring-2 ring-red-500')} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : p.length < need ? [...p, c.id] : p))}>
              <CardFace card={c} size={64} className={cn(on && 'opacity-60')} />
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}
