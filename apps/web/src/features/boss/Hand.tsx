import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BossActionPayload, BossHandCard, BossView, InvestorTeam, RoomPlayer } from '@/api/types'
import { Button } from '@/components/ui/button'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { cn } from '@/lib/utils'
import { cardArt, cardKey, nameOf, TEAM_COLOR, TEAMS } from './meta'
import { TeamBadge } from './parts'

/** One influence card face. */
export function CardFace({ card, className, count }: { card: BossHandCard; className?: string; count?: number }) {
  const { t } = useTranslation()
  const label = card.kind === 'team' ? t('boss.cards.team', { team: t(`boss.teamShort.${card.team}`) }) : card.kind === 'travel' ? (card.team === 'any' ? t('boss.cards.travelAny') : t('boss.cards.travel')) : t(`boss.cards.${card.kind}`)
  const tint = card.kind === 'team' ? TEAM_COLOR[card.team] : card.kind === 'travel' && card.team !== 'any' ? TEAM_COLOR[card.team] : card.kind === 'stop' ? '#d2443c' : card.kind === 'boss' ? '#e6b21f' : card.kind === 'recruit' ? '#3d6fd6' : '#8a8a8a'
  return (
    <span className={cn('boss-card relative flex aspect-[5/7] w-16 shrink-0 flex-col items-center justify-between overflow-hidden rounded-xl border-2 border-[#5a3420] bg-[#fff4dc] p-1 text-[#3a2416] shadow-[0_3px_0_#5a3420]', className)}>
      <span className="absolute inset-x-0 top-0 h-1/3" style={{ background: `linear-gradient(${tint}, transparent)` }} />
      <span className="relative flex flex-1 items-center justify-center">
        {card.kind === 'team' ? <TeamBadge team={card.team} className="size-11" /> : <img src={cardArt(card.kind)} alt="" className="size-11" draggable={false} />}
        {card.kind === 'travel' && card.team !== 'any' && <TeamBadge team={card.team} className="absolute -bottom-1 -right-2 size-5" />}
      </span>
      <span className="relative w-full truncate text-center text-[9px] font-black leading-tight">{label}</span>
      {count !== undefined && count > 1 && <span className="absolute right-0.5 top-0.5 rounded-full bg-[#3a2416] px-1.5 text-[10px] font-black text-white">×{count}</span>}
    </span>
  )
}

type Act = (action: BossActionPayload) => void

/** My hand: same cards stacked; tap one to see what it can do right now. */
export function HandBar({ view, players, meId, busy, act }: { view: BossView; players: RoomPlayer[]; meId: string; busy: boolean; act: Act }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<BossHandCard | null>(null)
  const stacks = new Map<string, BossHandCard[]>()
  for (const c of view.myHand) stacks.set(cardKey(c), [...(stacks.get(cardKey(c)) ?? []), c])
  const order = ['boss', 'stop', 'recruit', ...TEAMS.map((x) => `team:${x}`), 'travel:any', ...TEAMS.map((x) => `travel:${x}`)]
  const sorted = [...stacks.entries()].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
  return (
    <>
      <div className="boss-hand flex items-end gap-1.5 overflow-x-auto px-2 pb-1 pt-3 [scrollbar-width:none]" role="list" aria-label={t('boss.cards.hand', { count: view.myHand.length })}>
        {sorted.map(([key, cards], i) => (
          <button key={key} type="button" role="listitem" className="boss-hand-card shrink-0 transition-transform hover:-translate-y-2 focus-visible:-translate-y-2 active:scale-95" style={{ animationDelay: `${i * 40}ms` }} onClick={() => setOpen(cards[0])}>
            <CardFace card={cards[0]} count={cards.length} />
          </button>
        ))}
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
  const inDeal = (team: InvestorTeam) => !!space && (space.required.includes(team) || space.optional.includes(team))
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
          {targets.map((x) => (
            <Button key={x.key} variant="secondary" size="lg" className="h-12 justify-start gap-3" disabled={busy} onClick={() => act({ type: 'play_travel', cardId: card.id, targetTeam: x.team, ...(x.cardId ? { targetCardId: x.cardId } : {}) })}>
              <TeamBadge team={x.team} className="size-7" />{x.label}
            </Button>
          ))}
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
              <Button key={team} variant="secondary" className="h-14 flex-col gap-0.5" disabled={busy} onClick={() => act({ type: 'play_recruit', cardIds: [recruits[0].id, recruits[1].id, recruits[2].id], targetTeam: team })}>
                <TeamBadge team={team} className="size-7" /><span className="text-xs">{t(`boss.teamShort.${team}`)}</span>
              </Button>
            ))}
          </div>
        </div>
      )
    }
  }
  return (
    <BottomSheet full open={card !== null} onOpenChange={(v) => { if (!v) onClose() }} title={card ? <span className="flex items-center gap-2"><CardFace card={card} className="w-10" />{card.kind === 'team' ? t('boss.cards.team', { team: t(`boss.teamShort.${card.team}`) }) : t(card.kind === 'travel' && card.team === 'any' ? 'boss.cards.travelAny' : `boss.cards.${card.kind}`)}</span> : ''}>
      <div className="flex flex-col gap-3 px-4 pb-6">{body}</div>
    </BottomSheet>
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
              <CardFace card={c} className={cn('w-full', on && 'opacity-60')} />
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}
