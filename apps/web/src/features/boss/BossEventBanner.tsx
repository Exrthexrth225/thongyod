import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Banknote, Crown, Dices, Hand, Plane, ShieldAlert, Sparkles, UserPlus } from 'lucide-react'
import type { BossEvent, BossEventKind, RoomPlayer } from '@/api/types'
import { Avatar } from '@/components/common/Avatar'
import { celebrate } from '@/lib/celebrate'
import { confettiBurst } from '@/lib/confetti'
import { buzz, playSound } from '@/lib/sound'
import { cn } from '@/lib/utils'
import { TEAM_META, formatMillions } from './teamMeta'

const DRAMATIC_KINDS = new Set<BossEventKind>([
  'boss_played',
  'stop_played',
  'travel_played',
  'recruit_played',
  'interrupt_resolved',
  'deal_settled',
  'deal_failed',
  'end_roll',
  'game_ended',
])

type Props = {
  events: BossEvent[]
  players: RoomPlayer[]
  sound: boolean
}

export function BossEventBanner({ events, players, sound }: Props) {
  const { t } = useTranslation()
  const [banner, setBanner] = useState<BossEvent | null>(null)
  const seenRev = useRef(0)
  const timer = useRef<number>(0)

  const nameOf = (id?: string) => players.find((p) => p.userId === id)?.displayName ?? '?'

  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    if (!events.length) return
    const fresh = events.filter((e) => e.revision > seenRev.current)
    if (!fresh.length) return
    seenRev.current = fresh[fresh.length - 1].revision

    const latest = [...fresh].reverse().find((e) => DRAMATIC_KINDS.has(e.kind))
    if (!latest) return

    window.clearTimeout(timer.current)
    setBanner(latest)

    if (latest.kind === 'boss_played' || latest.kind === 'recruit_played') {
      if (sound) playSound('end')
      buzz([40, 40, 60])
      confettiBurst(window.innerWidth / 2, window.innerHeight * 0.28)
    } else if (latest.kind === 'stop_played') {
      if (sound) playSound('wrong')
      buzz([60, 40, 60])
    } else if (latest.kind === 'travel_played') {
      if (sound) playSound('flip')
      buzz(40)
    } else if (latest.kind === 'deal_settled') {
      if (sound) playSound('correct')
      buzz([30, 30, 80])
      confettiBurst(window.innerWidth / 2, window.innerHeight * 0.35)
    } else if (latest.kind === 'end_roll') {
      if (sound) playSound(latest.cancelled ? 'pop' : 'end')
      if (!latest.cancelled) celebrate()
    } else if (latest.kind === 'game_ended') {
      if (sound) playSound('end')
      celebrate()
    } else if (latest.kind === 'deal_failed') {
      if (sound) playSound('pass')
    } else if (latest.kind === 'interrupt_resolved') {
      if (sound) playSound(latest.cancelled ? 'pop' : 'correct')
    }

    timer.current = window.setTimeout(() => setBanner(null), 2600)
  }, [events, sound])

  if (!banner) return null

  const actor = players.find((p) => p.userId === banner.actorId)
  const teamLabel = banner.team ? t(`boss.teams.${banner.team}`) : ''
  const targetName = banner.targetId ? nameOf(banner.targetId) : ''

  let tone = 'bg-ink text-ink-foreground'
  let anim = 'boss-slam'
  let Icon = Sparkles
  let headline = ''
  let detail = ''

  switch (banner.kind) {
    case 'boss_played':
      tone = 'bg-yolk text-on-slab ring-4 ring-ink/15'
      Icon = Crown
      headline = t('boss.events.bossTitle')
      detail = t('boss.events.bossBody', { actor: nameOf(banner.actorId) })
      break
    case 'stop_played':
      tone = 'bg-rose-600 text-white ring-4 ring-rose-300/60'
      anim = 'boss-stop-slam'
      Icon = Hand
      headline = t('boss.events.stopTitle')
      detail = t('boss.events.stopBody', { actor: nameOf(banner.actorId), target: targetName })
      break
    case 'travel_played':
      tone = 'bg-sky text-on-slab ring-4 ring-sky-300/60'
      anim = 'boss-fly'
      Icon = Plane
      headline = t('boss.events.travelTitle')
      detail = t('boss.events.travelBody', { actor: nameOf(banner.actorId), team: teamLabel })
      break
    case 'recruit_played':
      tone = 'bg-lilac text-on-slab ring-4 ring-violet-300/60'
      Icon = UserPlus
      headline = t('boss.events.recruitTitle')
      detail = t('boss.events.recruitBody', { actor: nameOf(banner.actorId), team: teamLabel })
      break
    case 'interrupt_resolved':
      tone = banner.cancelled ? 'bg-muted text-foreground' : 'bg-mint text-on-slab'
      Icon = ShieldAlert
      headline = banner.cancelled ? t('boss.events.blockedTitle') : t('boss.events.passedTitle')
      detail = banner.cancelled ? t('boss.events.blockedBody') : t('boss.events.passedBody')
      break
    case 'deal_settled':
      tone = 'bg-mint text-on-slab ring-4 ring-emerald-300/70'
      Icon = Banknote
      headline = t('boss.events.settledTitle', { n: banner.dealNumber ?? 1 })
      detail = t('boss.events.settledBody', { amount: formatMillions(banner.amount ?? 0), boss: nameOf(banner.actorId) })
      break
    case 'deal_failed':
      tone = 'bg-muted text-foreground'
      Icon = ShieldAlert
      headline = t('boss.events.failedTitle')
      detail = t('boss.events.failedBody', { boss: nameOf(banner.actorId) })
      break
    case 'end_roll':
      tone = banner.cancelled ? 'bg-tangerine text-on-slab' : 'bg-rose-600 text-white'
      anim = 'boss-dice-tumble'
      Icon = Dices
      headline = t('boss.events.endRollTitle', { roll: banner.roll ?? 1 })
      detail = banner.cancelled ? t('boss.events.endRollSafe') : t('boss.events.endRollHit')
      break
    case 'game_ended':
      tone = 'bg-yolk text-on-slab ring-4 ring-amber-200'
      Icon = Crown
      headline = t('boss.events.gameOverTitle')
      detail = t('boss.events.gameOverBody')
      break
    default:
      break
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-4">
      <div
        key={banner.id}
        role="status"
        aria-live="polite"
        className={cn('flex max-w-sm items-center gap-3 rounded-3xl px-4 py-3 shadow-xl', tone, anim)}
      >
        {banner.team ? (
          <img src={TEAM_META[banner.team].img} alt="" className="size-12 shrink-0 rounded-2xl bg-background/40 p-0.5" />
        ) : actor ? (
          <Avatar name={actor.displayName} src={actor.avatarUrl} className="size-11 shrink-0 ring-2 ring-background/60" />
        ) : (
          <Icon className="size-9 shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-heading text-lg leading-tight font-extrabold">
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{headline}</span>
          </p>
          <p className="text-xs leading-snug font-medium opacity-90">{detail}</p>
        </div>
      </div>
    </div>
  )
}
