import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import type { BossView, RoomPlayer } from '@/api/types'
import { cn } from '@/lib/utils'
import { nameOf } from './meta'

/**
 * Says who has to do what next, in plain words, on every screen (phones and the Board Screen). In a deal it also
 * shows the four steps: gather the teams → boss makes an offer → the people in the deal accept → boss closes.
 * `meId` makes it say "you" (none on the Board Screen).
 */
export function GuideBar({ view, players, meId, className }: { view: BossView; players: RoomPlayer[]; meId?: string; className?: string }) {
  const { t } = useTranslation()
  const who = (id: string) => (id === meId ? t('boss.guide.you') : nameOf(players, id))
  const deal = view.deal
  let text = ''
  let step = -1
  if (view.phase === 'game_over') text = t('boss.phase.over')
  else if (view.phase === 'pick_start') text = t('boss.guide.pick', { name: who(view.markerChooserId) })
  else if (view.phase === 'turn_choice') text = t('boss.guide.turn', { name: who(view.turnPlayerId) })
  else if (view.phase === 'rolled_choice') text = t('boss.guide.rolled', { name: who(view.turnPlayerId), roll: view.lastRoll ?? '' })
  else if (view.phase === 'discard_limit') text = t('boss.guide.discard', { name: who(view.turnPlayerId) })
  else if (view.phase === 'interrupt' && view.interrupt) text = t('boss.guide.interrupt', { name: who(view.interrupt.actorId) })
  else if (deal) {
    const space = view.spaces[deal.spaceIndex]
    const agreed = new Set(deal.agreedTeams)
    const missingTeams = space.groups.flatMap((g) => (g.teams.filter((x) => agreed.has(x)).length >= g.pick ? [] : g.teams.filter((x) => !agreed.has(x))))
    const missing = space.groups.reduce((n, g) => n + Math.max(0, g.pick - g.teams.filter((x) => agreed.has(x)).length), 0)
    const waiting = deal.contributorIds.filter((id) => id !== deal.bossId && !deal.acceptedIds.includes(id))
    const boss = who(deal.bossId)
    const mine = deal.bossId === meId
    if (view.phase === 'closing') { step = 3; text = t('boss.guide.closing') }
    else if (!deal.offered) { step = missing > 0 ? 0 : 1; text = missing > 0 ? t(mine ? 'boss.guide.gatherMe' : 'boss.guide.gather', { count: missing, teams: missingTeams.map((x) => t(`boss.teamShort.${x}`)).join(' / '), boss }) : t(mine ? 'boss.guide.offerMe' : 'boss.guide.offer', { boss }) }
    else if (!deal.canClose) {
      step = 2
      text = missing > 0
        ? t(mine ? 'boss.guide.gatherMe' : 'boss.guide.gather', { count: missing, teams: missingTeams.map((x) => t(`boss.teamShort.${x}`)).join(' / '), boss })
        : t('boss.guide.accept', { names: waiting.map(who).join(', ') || boss })
    } else { step = 3; text = t(mine ? 'boss.guide.closeMe' : 'boss.guide.close', { boss }) }
  }
  const steps = [t('boss.guide.s1'), t('boss.guide.s2'), t('boss.guide.s3'), t('boss.guide.s4')]
  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      {step >= 0 && (
        <ol className="flex items-center gap-1 text-[10px] font-bold" aria-label={t('boss.guide.steps')}>
          {steps.map((s, i) => (
            <li key={s} className={cn('flex items-center gap-1 rounded-full px-2 py-0.5', i < step ? 'bg-emerald-500/80 text-white' : i === step ? 'bg-[#ffc21a] text-[#241b4b]' : 'bg-white/10 text-white/60')}>
              {i < step ? <Check className="size-3" aria-hidden="true" /> : <span>{i + 1}</span>}
              {s}
            </li>
          ))}
        </ol>
      )}
      <p key={text} className="boss-role max-w-full rounded-2xl bg-black/50 px-3 py-1 text-center text-[13px] leading-snug font-bold text-white">{text}</p>
    </div>
  )
}
