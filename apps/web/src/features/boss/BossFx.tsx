import { useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { BossEvent, BossHandCard, BossView, InvestorTeam, RoomPlayer } from '@/api/types'
import { useSecondsLeft } from '@/features/rooms/useSecondsLeft'
import { cn } from '@/lib/utils'
import { CardFace } from './Hand'
import { SeatFaces } from './parts'
import { ROLL } from './useBossTimeline'
import { Word } from './Word'
import { faceArt, fxArt, millions, moneyArt, shortOf, PLAY_FX, TEAMS, type Mood } from './meta'

/** Big slam banner for the moment that just happened. Keyed by event id so each plays once. */
export function FxBanner({ event, view, players }: { event: BossEvent | null; view: BossView; players: RoomPlayer[] }) {
  const { t } = useTranslation()
  if (!event) return null
  const actor = shortOf(players, event.actorId)
  let art: string | null = null, title: string, sub = '', tone = 'gold', fly = ''
  switch (event.kind) {
    case 'deal_opened': art = fxArt('ribbon'); title = t('boss.fx.deal'); sub = t('boss.fx.dealSub', { boss: actor, n: event.dealNumber, amount: t('boss.money', { m: millions(event.amount ?? 0) }) }); break
    case 'deal_settled':
      art = fxArt('stamp'); title = t('boss.fx.settledValue', { amount: t('boss.money', { m: millions(event.amount ?? 0) }) }); tone = 'red'
      if (view.lastSettlement && view.lastSettlement.dealNumber === event.dealNumber) sub = Object.entries(view.lastSettlement.payouts).sort(([, a], [, b]) => b - a).map(([id, amount]) => t('boss.fx.paid', { name: shortOf(players, id), amount: t('boss.money', { m: millions(amount) }) })).join(' · ')
      break
    case 'deal_failed': title = t('boss.fx.failed'); tone = 'gray'; break
    case 'interrupt_resolved': {
      const played = view.events.findLast((x) => x.revision < event.revision && ['travel_played', 'recruit_played', 'boss_played'].includes(x.kind))
      const team = event.team ? t(`boss.teamShort.${event.team}`) : ''
      if (event.cancelled) {
        const stop = view.events.findLast((x) => x.revision < event.revision && x.kind === 'stop_played')
        art = fxArt('stop'); title = t('boss.fx.blocked'); tone = 'red'; fly = 'stop'
        sub = t('boss.fx.blockedSub', { name: shortOf(players, stop?.actorId), actor })
      } else if (played?.kind === 'travel_played') { art = fxArt('plane'); fly = 'plane'; title = t('boss.fx.doneTravel', { team }); sub = t('boss.fx.doneTravelSub') }
      else if (played?.kind === 'boss_played') { art = fxArt('crown'); fly = 'crown'; title = t('boss.fx.doneBoss', { actor }); sub = t('boss.fx.doneBossSub', { target: shortOf(players, played.targetId) }) }
      else if (played?.kind === 'recruit_played') { art = fxArt('magnet'); fly = 'magnet'; title = t('boss.fx.doneRecruit', { actor, team }); sub = t('boss.fx.doneRecruitSub') }
      else return null
      break
    }
    case 'team_played': {
      const card = { id: event.id, kind: 'team', team: event.team ?? 'red' } as BossHandCard
      return (
        <div key={event.id} className="boss-toast pointer-events-none absolute inset-x-0 top-12 z-30 flex justify-center" aria-live="polite">
          <span className="flex items-center gap-2 rounded-2xl bg-[#241b4b]/95 py-1 pl-1 pr-3 text-sm font-bold text-white shadow-xl ring-2 ring-[#e9b949]">
            <CardFace card={card} size={34} detail={false} className="boss-card-slam" />
            {t('boss.fx.teamPlayed', { actor, team: t(`boss.teamShort.${card.kind === 'team' ? card.team : 'red'}`) })}
          </span>
        </div>
      )
    }
    case 'game_ended': art = fxArt('trophy'); title = t('boss.fx.winner', { name: view.winnerIds.map((id) => shortOf(players, id)).join(', ') }); break
    default: return null
  }
  return (
    <div key={event.id} className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center" aria-live="polite">
      <div className={cn('boss-slam flex flex-col items-center gap-1 text-center', event.kind === 'deal_settled' && 'boss-stamp')}>
        {art && <img src={art} alt="" className={cn('drop-shadow-xl', event.kind === 'deal_settled' ? 'size-40' : 'size-28', fly && `boss-fx-${fly}-done`)} />}
        <Word text={title} tone={tone === 'red' ? 'red' : tone === 'gray' ? 'gray' : 'gold'} className={cn('px-2 text-[clamp(30px,6.5vmin,64px)]', event.kind === 'deal_settled' && '-mt-28 mb-16 rotate-[-12deg] text-[clamp(36px,8vmin,76px)]')} />
        {sub && <span className={cn('rounded-full bg-black/65 px-3 py-1 text-sm font-bold text-white', event.kind === 'deal_settled' && 'boss-pop-late text-[#ffd77a]')}>{sub}</span>}
      </div>
      {(event.kind === 'deal_settled' || event.kind === 'game_ended') && <img src={fxArt('confetti')} alt="" className="boss-confetti absolute -z-10 size-56 opacity-80" />}
    </div>
  )
}

/** Travel / Boss / Recruit waiting out its Stop window: who played what on whom, what happens if nobody stops it, a ring and (if I can) a STOP button. */
export function InterruptOverlay({ view, players, canStop, onStop, stopping }: { view: BossView; players: RoomPlayer[]; canStop: boolean; onStop: () => void; stopping: boolean }) {
  const { t } = useTranslation()
  const intr = view.interrupt
  const left = useSecondsLeft(intr?.deadlineAt ?? null)
  if (!intr || view.phase !== 'interrupt') return null
  const actor = shortOf(players, intr.actorId)
  const team = intr.targetTeam ? t(`boss.teamShort.${intr.targetTeam}`) : ''
  const target = shortOf(players, intr.targetId)
  const card = { id: intr.id, kind: intr.kind, team: intr.targetTeam ?? 'any' } as BossHandCard
  const title = intr.kind === 'travel' ? t('boss.fx.travel', { actor, team }) : intr.kind === 'recruit' ? t('boss.fx.recruit', { actor, team }) : t('boss.fx.boss', { actor })
  const outcome = intr.kind === 'travel' ? t('boss.fx.outTravel', { team }) : intr.kind === 'recruit' ? t('boss.fx.outRecruit', { actor, team }) : t('boss.fx.outBoss', { actor, target })
  // a player shows every colour they hold; a card aimed at one colour shows just that colour
  const targetFace: InvestorTeam | string = intr.kind === 'boss' || !intr.targetTeam ? (intr.targetId ?? intr.actorId) : intr.targetTeam
  const stopped = !!intr.stoppedBy
  const who = (face: InvestorTeam | string, name: string, mood: Mood, extra?: string) => (
    <span className={cn('flex min-w-20 flex-col items-center gap-1', extra)}>
      {(TEAMS as readonly string[]).includes(face)
        ? <img src={faceArt(face as InvestorTeam, mood)} alt="" className="size-16 rounded-full bg-white/90 object-contain p-0.5 ring-4 ring-white/80" />
        : <SeatFaces view={view} userId={face} mood={mood} round className="size-16" />}
      <span className="max-w-full truncate rounded-full bg-black/60 px-2 text-xs font-bold text-white">{name}</span>
    </span>
  )
  return (
    <div key={intr.id} className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-[#120d2b]/75 backdrop-blur-[3px]">
      <div className="flex max-h-full origin-center flex-col items-center gap-2 overflow-y-auto p-3 [scrollbar-width:none] [@media(min-width:768px)_and_(min-height:600px)]:scale-[1.45] [@media(max-height:500px)]:scale-[0.74]">
        <Word text={title} className="boss-role text-[28px]" />
        <div className="flex items-center gap-2">
          {who(intr.actorId, actor, stopped ? 'upset' : 'happy', intr.kind === 'boss' ? 'boss-fx-crowned' : undefined)}
          <div className="relative">
            <svg viewBox="0 0 120 120" className="absolute -inset-5 size-[calc(100%+2.5rem)] -rotate-90" aria-hidden="true">
              <circle cx="60" cy="60" r="56" fill="none" stroke="#ffffff26" strokeWidth="5" />
              {!stopped && <circle cx="60" cy="60" r="56" fill="none" stroke="#ffd54a" strokeWidth="5" strokeLinecap="round" pathLength={100} strokeDasharray="100" className="boss-ring" style={{ animationDuration: '5s' }} />}
            </svg>
            <CardFace card={card} size={96} className="boss-card-slam" />
            <img src={fxArt(PLAY_FX[intr.kind])} alt="" className={cn('pointer-events-none absolute size-20 drop-shadow-xl', `boss-fx-${intr.kind}`)} />
            {stopped && <img src={fxArt('stop')} alt="" className="boss-fx-stopslam pointer-events-none absolute inset-0 m-auto size-28 drop-shadow-2xl" />}
          </div>
          {intr.kind !== 'recruit' || intr.targetId
            ? who(targetFace, intr.kind === 'boss' ? target : intr.targetId ? `${team} · ${target}` : team, stopped ? 'happy' : 'upset', stopped ? undefined : intr.kind === 'recruit' ? 'boss-fx-pulled' : 'boss-fx-shake')
            : who(targetFace, team, 'calm', 'boss-fx-pulled')}
        </div>
        {stopped
          ? <Word text={t('boss.fx.stoppedBy', { name: shortOf(players, intr.stoppedBy) })} tone="red" className="boss-role text-[22px]" />
          : <span className="rounded-2xl bg-white/95 px-3 py-1.5 text-center text-sm font-bold text-[#3a2416]"><span className="text-[#b45309]">{t('boss.fx.ifNone')}</span> → {outcome}</span>}
        <span className="text-xs font-semibold text-white/85 tabular-nums">{stopped ? t('boss.fx.resolving', { s: left }) : canStop ? t('boss.fx.stopWindow', { s: left }) : `${t('boss.fx.waitStop')} · ${left}`}</span>
        {canStop && !stopped && (
          <button type="button" disabled={stopping} onClick={onStop} className="boss-stop-btn flex items-center gap-2 rounded-full bg-red-600 py-2 pl-3 pr-8 text-2xl font-black tracking-wide text-white shadow-[0_6px_0_#7f1d1d] active:translate-y-1 active:shadow-[0_2px_0_#7f1d1d] disabled:opacity-60">
            <img src={fxArt('stop')} alt="" className="size-10" /><Word text={t('boss.act.stop')} tone="white" className="text-[30px] tracking-wide" />
          </button>
        )}
      </div>
    </div>
  )
}

/** "Going once, going twice…" ring while the deal closes. */
export function ClosingRing({ deadline, className }: { deadline: string | null; className?: string }) {
  const { t } = useTranslation()
  const left = useSecondsLeft(deadline)
  if (!deadline) return null
  return (
    <div key={deadline} className={cn('flex items-center gap-2 rounded-full bg-amber-400 px-3 py-1 font-black text-[#3a2416] shadow-md', className)}>
      <svg viewBox="0 0 40 40" className="size-7 -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r="16" fill="none" stroke="#3a241633" strokeWidth="5" />
        <circle cx="20" cy="20" r="16" fill="none" stroke="#3a2416" strokeWidth="5" pathLength={100} strokeDasharray="100" className="boss-ring" style={{ animationDuration: '6s' }} />
      </svg>
      <span className="tabular-nums">{left > 3 ? t('boss.phase.closing') : t('boss.phase.closingCount', { s: left })}</span>
    </div>
  )
}

// Each sheet contains 48 views of one rounded solid, lit from the same point above the table.
const dieSheets = import.meta.glob<string>('../../assets/boss/die/roll-*.webp', { eager: true, import: 'default' })
const columns = 8, rows = 6, frameCount = rows * columns
const spritePose = (frame: number) => `translate(${-(frame % columns) * 100 / columns}%, ${-Math.floor(frame / columns) * 100 / rows}%)`
const spinFrames = Array.from({ length: frameCount }, (_, frame) => ({
  transform: spritePose(frame), offset: frame / (frameCount - 1), easing: 'steps(1, end)',
}))

// Heights are fractions of a die. Gravity accelerates the fall; each impact loses energy.
function throwPose(t: number) {
  const x = -84 * (1 - t) ** 2
  let height: number
  if (t < .37) height = (1 - (t / .37) ** 2) * .55
  else if (t < .67) {
    const phase = (t - .37) / .30
    height = 4 * .26 * phase * (1 - phase)
  } else if (t < .84) {
    const phase = (t - .67) / .17
    height = 4 * .075 * phase * (1 - phase)
  } else height = 0
  return { x, height }
}

export function Die({ value, size = 64, rolling = true, startedAt, className }: { value: number; size?: number; rolling?: boolean; startedAt?: number; className?: string }) {
  const result = useRef<HTMLSpanElement>(null)
  const sprite = useRef<HTMLImageElement>(null)
  const body = useRef<HTMLSpanElement>(null)
  const shadow = useRef<HTMLSpanElement>(null)
  const src = dieSheets[`../../assets/boss/die/roll-${value}.webp`]
  useLayoutEffect(() => {
    if (!result.current || !sprite.current || !body.current || !shadow.current || !rolling) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (motion.matches) return
    const poses = spinFrames.map(({ offset }) => throwPose(offset))
    const options = { duration: ROLL.tumble, easing: 'linear' }
    const animations = [
      sprite.current.animate(spinFrames, options),
      result.current.animate([{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'scale(1)' }],
        { delay: ROLL.tumble, duration: 140, fill: 'backwards' }),
      body.current.animate(poses.map(({ x, height }) => ({ transform: `translate(${x}%, ${-height * 100}%)` })), options),
      shadow.current.animate(poses.map(({ x, height }) => ({
        transform: `translateX(${x / .7}%) scale(${1 - height * .6})`, opacity: .4 - height * .5,
      })), options),
    ]
    const elapsed = startedAt ? Math.max(0, Date.now() - startedAt) : 0
    for (const animation of animations) animation.currentTime = elapsed
    const stop = () => animations.forEach((animation) => animation.cancel())
    motion.addEventListener('change', stop)
    return () => { stop(); motion.removeEventListener('change', stop) }
  }, [value, rolling, startedAt])
  return (
    <span className={cn('boss-die relative inline-block shrink-0', className)} style={{ width: size, height: size }} role="img" aria-label={String(value)}>
      <span ref={shadow} aria-hidden="true" className="boss-die-shadow" />
      <span ref={body} className="absolute inset-0 overflow-hidden">
        <img ref={sprite} src={src} alt="" draggable={false} className="absolute left-0 top-0 max-w-none"
          style={{ width: `${columns * 100}%`, height: `${rows * 100}%`, transform: spritePose(frameCount - 1) }} />
      </span>
      <span ref={result} aria-hidden="true" className="absolute right-0 bottom-0 rounded-full bg-[#241b4b] px-1 font-black leading-tight text-[#ffda75]"
        style={{ fontSize: Math.max(11, size * .22) }}>{value}</span>
    </span>
  )
}

/** Coins fly from the middle of `container` to each paid seat. Plays once per settled deal. */
export function MoneyFly({ event, payouts, container }: { event: BossEvent; payouts: Record<string, number>; container: React.RefObject<HTMLElement | null> }) {
  const layer = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = container.current, host = layer.current
    if (!root || !host || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const box = root.getBoundingClientRect()
    const start = { x: box.width / 2, y: box.height / 2 }
    const made: HTMLElement[] = []
    Object.keys(payouts).forEach((id, seatIndex) => {
      const target = root.querySelector(`[data-seat="${CSS.escape(id)}"]`)
      if (!target) return
      const r = target.getBoundingClientRect()
      const end = { x: r.left - box.left + 24, y: r.top - box.top + 20 }
      // "+$2M" pops up over the seat when the money lands.
      const tag = document.createElement('span')
      tag.textContent = `+$${millions(payouts[id])}M`
      tag.dataset.text = tag.textContent
      tag.className = 'boss-word pointer-events-none absolute left-0 top-0 text-2xl'
      host.appendChild(tag); made.push(tag)
      tag.animate(
        [
          { transform: `translate(${end.x}px, ${end.y}px) scale(0.3)`, opacity: 0 },
          { transform: `translate(${end.x}px, ${end.y - 18}px) scale(1.15)`, opacity: 1, offset: 0.25 },
          { transform: `translate(${end.x}px, ${end.y - 30}px) scale(1)`, opacity: 1, offset: 0.8 },
          { transform: `translate(${end.x}px, ${end.y - 44}px) scale(0.9)`, opacity: 0 },
        ],
        { duration: 1800, delay: 1400 + seatIndex * 160, easing: 'ease-out', fill: 'both' },
      )
      for (let i = 0; i < 6; i++) {
        const img = document.createElement('img')
        img.src = moneyArt(i % 3 === 0 ? 'cash' : 'coin')
        img.alt = ''
        img.className = 'pointer-events-none absolute left-0 top-0 size-9'
        host.appendChild(img); made.push(img)
        const lift = -80 - Math.random() * 60
        img.animate(
          [
            { transform: `translate(${start.x - 18}px, ${start.y - 18}px) scale(0.4)`, opacity: 0 },
            { transform: `translate(${(start.x + end.x) / 2 - 18}px, ${(start.y + end.y) / 2 + lift}px) scale(1.15) rotate(${(Math.random() - 0.5) * 60}deg)`, opacity: 1, offset: 0.5 },
            { transform: `translate(${end.x - 18}px, ${end.y - 18}px) scale(0.6)`, opacity: 0.2 },
          ],
          { duration: 900, delay: 700 + seatIndex * 160 + i * 70, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'both' },
        )
      }
    })
    const done = window.setTimeout(() => made.forEach((m) => m.remove()), 3500)
    return () => { window.clearTimeout(done); made.forEach((m) => m.remove()) }
  }, [event.id, payouts, container])
  return <div ref={layer} className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden="true" />
}

/** After a settled deal from #10: the end-game roll. */
export function EndRoll({ event, view }: { event: BossEvent; view: BossView }) {
  const { t } = useTranslation()
  const roll = event.roll ?? 1
  const faces = view.lastEndRoll && view.lastEndRoll.dealNumber === event.dealNumber ? view.lastEndRoll.faces : []
  return (
    <div key={event.id} className="pointer-events-none absolute inset-x-0 top-[18%] z-30 flex flex-col items-center gap-2">
      <span className="rounded-full bg-black/60 px-3 py-1 text-sm font-bold text-white">{t('boss.fx.endRoll')} · {faces.join(' ')}</span>
      <Die value={roll} size={72} />
      <Word text={event.cancelled ? t('boss.fx.endNo', { roll }) : t('boss.fx.endYes', { roll })} tone={event.cancelled ? 'green' : 'red'} className="boss-pop-late text-[clamp(26px,5vmin,48px)]" />
    </div>
  )
}
