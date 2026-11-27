import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BossActionPayload, BossHandCard, BossView, InvestorTeam, RoomPlayer } from '@/api/types'
import { Button } from '@/components/ui/button'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { cn } from '@/lib/utils'
import { cardArt, cardKey, cardName, faceArt, nameOf, TEAM_COLOR, TEAMS } from './meta'
import { TeamBadge } from './parts'

/** Card look: coloured frame, light art panel, name (+ team) underneath — like a real card. */
const KIND_STYLE = {
  travel: { frame: '#2f9fb3', art: '#dff6f9', ink: '#fff' },
  boss: { frame: '#e9b949', art: '#fff6dc', ink: '#241b4b' },
  stop: { frame: '#c43a3a', art: '#ffe4e1', ink: '#fff' },
  recruit: { frame: '#6b6fb8', art: '#ecebff', ink: '#fff' },
} as const


/** One influence card face. `size` = width in px; the card is 5:7. */
export function CardFace({ card, size = 84, className, count, glow }: { card: BossHandCard; size?: number; className?: string; count?: number; glow?: boolean }) {
  const { t } = useTranslation()
  const style = card.kind === 'team' ? { frame: TEAM_COLOR[card.team], art: '#ffffffd9', ink: '#fff' } : KIND_STYLE[card.kind]
  const sub = card.kind === 'travel' ? (card.team === 'any' ? t('boss.cards.anyTeam') : t('boss.cards.team', { team: t(`boss.teamShort.${card.team}`) })) : null
  return (
    <span
      className={cn('boss-card relative flex shrink-0 flex-col rounded-[12%/8.6%] p-[6%] shadow-[0_8px_18px_rgba(0,0,0,0.45)]', glow && 'boss-card-glow', className)}
      style={{ width: size, height: size * 1.42, background: style.frame }}
    >
      <span className="relative flex h-[56%] items-center justify-center overflow-hidden rounded-[10%/14%]" style={{ background: style.art }}>
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
      <span className="mt-[6%] flex flex-1 flex-col items-center justify-center text-center leading-[1.1]" style={{ color: style.ink }}>
        <span className="font-black" style={{ fontSize: size * 0.15 }}>{cardName(card, t)}</span>
        {sub && <span className="font-bold opacity-85" style={{ fontSize: size * 0.11 }}>{sub}</span>}
      </span>
      {count !== undefined && count > 1 && <span className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-[#241b4b] text-xs font-black text-white ring-2 ring-white">×{count}</span>}
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
      <div className="boss-hand relative flex h-full items-end justify-center" role="list" aria-label={t('boss.cards.hand', { count: view.myHand.length })}>
        {sorted.map(([key, cards], i) => {
          const mid = (sorted.length - 1) / 2, off = i - mid
          const glow = cards[0].kind === 'stop' && view.phase === 'interrupt'
          return (
            <button
              key={key}
              type="button"
              role="listitem"
              aria-label={cardName(cards[0], t)}
              className="boss-hand-card -mx-2 shrink-0 origin-bottom transition-transform duration-200 hover:z-10 hover:-translate-y-5 focus-visible:z-10 focus-visible:-translate-y-5 active:scale-95"
              style={{ transform: `translateY(${16 + Math.abs(off) * 4}%) rotate(${off * 6}deg)`, animationDelay: `${i * 50}ms` }}
              onClick={() => setOpen(cards[0])}
            >
              <CardFace card={cards[0]} count={cards.length} glow={glow} />
            </button>
          )
        })}
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
    <BottomSheet full open={card !== null} onOpenChange={(v) => { if (!v) onClose() }} title={card ? <span className="flex items-center gap-3"><CardFace card={card} size={44} />{cardName(card, t)}</span> : ''}>
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
              <CardFace card={c} size={64} className={cn(on && 'opacity-60')} />
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}
