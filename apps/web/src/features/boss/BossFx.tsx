import { useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { BossEvent, BossView, RoomPlayer } from '@/api/types'
import { useSecondsLeft } from '@/features/rooms/useSecondsLeft'
import { cn } from '@/lib/utils'
import { cardArt, fxArt, millions, moneyArt, nameOf } from './meta'

/** Big slam banner for the moment that just happened. Keyed by event id so each plays once. */
export function FxBanner({ event, view, players }: { event: BossEvent | null; view: BossView; players: RoomPlayer[] }) {
  const { t } = useTranslation()
  if (!event) return null
  const actor = nameOf(players, event.actorId)
  let art: string | null = null, title: string, sub = '', tone = 'gold'
  switch (event.kind) {
    case 'deal_opened': art = fxArt('ribbon'); title = t('boss.fx.deal'); sub = t('boss.fx.dealSub', { boss: actor, n: event.dealNumber, amount: t('boss.money', { m: millions(event.amount ?? 0) }) }); break
    case 'deal_settled':
      art = fxArt('stamp'); title = t('boss.fx.settled'); tone = 'red'
      if (view.lastSettlement && view.lastSettlement.dealNumber === event.dealNumber) sub = Object.entries(view.lastSettlement.payouts).sort(([, a], [, b]) => b - a).map(([id, amount]) => t('boss.fx.paid', { name: nameOf(players, id), amount: t('boss.money', { m: millions(amount) }) })).join(' · ')
      break
    case 'deal_failed': title = t('boss.fx.failed'); tone = 'gray'; break
    case 'stop_played': art = cardArt('stop'); title = t('boss.fx.stopped', { actor }); tone = 'red'; break
    case 'game_ended': art = fxArt('trophy'); title = t('boss.fx.winner', { name: view.winnerIds.map((id) => nameOf(players, id)).join(', ') }); break
    default: return null
  }
  return (
    <div key={event.id} className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center" aria-live="polite">
      <div className={cn('boss-slam flex flex-col items-center gap-1 text-center', event.kind === 'deal_settled' && 'boss-stamp')}>
        {art && <img src={art} alt="" className={cn('drop-shadow-xl', event.kind === 'deal_settled' ? 'size-40' : 'size-28')} />}
        <span className={cn('boss-title rounded-2xl px-4 py-1 text-3xl font-black', tone === 'red' && 'text-red-600', tone === 'gray' && 'text-slate-600', tone === 'gold' && 'text-amber-500', event.kind === 'deal_settled' && '-mt-28 mb-16 rotate-[-12deg] text-4xl')}>{title}</span>
        {sub && <span className={cn('rounded-full bg-black/65 px-3 py-1 text-sm font-bold text-white', event.kind === 'deal_settled' && 'boss-pop-late text-[#ffd77a]')}>{sub}</span>}
      </div>
      {(event.kind === 'deal_settled' || event.kind === 'game_ended') && <img src={fxArt('confetti')} alt="" className="boss-confetti absolute -z-10 size-56 opacity-80" />}
    </div>
  )
}

/** Travel / Boss / Recruit waiting out its Stop window: the card, a ring and (if I can) a STOP button. */
export function InterruptOverlay({ view, players, canStop, onStop, stopping }: { view: BossView; players: RoomPlayer[]; canStop: boolean; onStop: () => void; stopping: boolean }) {
  const { t } = useTranslation()
  const intr = view.interrupt
  const left = useSecondsLeft(intr?.deadlineAt ?? null)
  if (!intr || view.phase !== 'interrupt') return null
  const actor = nameOf(players, intr.actorId)
  const team = intr.targetTeam ? t(`boss.teamShort.${intr.targetTeam}`) : ''
  const text = intr.kind === 'travel' ? t('boss.fx.travel', { actor, team }) : intr.kind === 'recruit' ? t('boss.fx.recruit', { actor, team }) : t('boss.fx.boss', { actor })
  return (
    <div key={intr.id} className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <svg viewBox="0 0 120 120" className="absolute -inset-6 size-[calc(100%+3rem)] -rotate-90" aria-hidden="true">
            <circle cx="60" cy="60" r="56" fill="none" stroke="#ffffff33" strokeWidth="6" />
            <circle cx="60" cy="60" r="56" fill="none" stroke="#ffd54a" strokeWidth="6" strokeLinecap="round" pathLength={100} strokeDasharray="100" className="boss-ring" style={{ animationDuration: '5s' }} />
          </svg>
          <div className="boss-card-slam flex size-36 items-center justify-center rounded-3xl bg-[#fff4dc] shadow-2xl ring-4 ring-amber-400">
            <img src={cardArt(intr.kind)} alt="" className="size-28" />
          </div>
        </div>
        <span className="rounded-2xl bg-black/70 px-4 py-2 text-center text-lg font-bold text-white">{text}</span>
        <span className="text-sm font-semibold text-white/90 tabular-nums">{canStop ? t('boss.fx.stopWindow', { s: left }) : `${t('boss.fx.waitStop')} · ${left}`}</span>
        {canStop && (
          <button type="button" disabled={stopping} onClick={onStop} className="boss-stop-btn mt-1 rounded-full bg-red-600 px-10 py-4 text-3xl font-black tracking-wide text-white shadow-[0_6px_0_#7f1d1d] active:translate-y-1 active:shadow-[0_2px_0_#7f1d1d] disabled:opacity-60">
            {t('boss.act.stop')}
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

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }
// Cube face order: front 1, back 6, right 3, left 4, top 2, bottom 5. Rotation that brings each value to the front.
const SHOW: Record<number, string> = { 1: 'rotateX(0deg) rotateY(0deg)', 6: 'rotateY(180deg)', 3: 'rotateY(-90deg)', 4: 'rotateY(90deg)', 2: 'rotateX(-90deg)', 5: 'rotateX(90deg)' }
const FACES: [number, string][] = [[1, 'translateZ(var(--h))'], [6, 'rotateY(180deg) translateZ(var(--h))'], [3, 'rotateY(90deg) translateZ(var(--h))'], [4, 'rotateY(-90deg) translateZ(var(--h))'], [2, 'rotateX(90deg) translateZ(var(--h))'], [5, 'rotateX(-90deg) translateZ(var(--h))']]

/** A 3D die that tumbles and lands on `value`. Re-mount (key) to roll again. */
export function Die({ value, size = 64, rolling = true, className }: { value: number; size?: number; rolling?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !rolling || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    el.animate(
      [{ transform: 'translateY(-60%) rotateX(720deg) rotateY(540deg) rotateZ(90deg)' }, { transform: `translateY(8%) ${SHOW[value]}`, offset: 0.75 }, { transform: SHOW[value] }],
      { duration: 1100, easing: 'cubic-bezier(.2,.7,.3,1)' },
    )
  }, [value, rolling])
  return (
    <div className={cn('[perspective:600px]', className)} style={{ width: size, height: size }}>
      <div ref={ref} className="relative size-full [transform-style:preserve-3d]" style={{ transform: SHOW[value], ['--h' as string]: `${size / 2}px` }}>
        {FACES.map(([n, tf]) => (
          <div key={n} className="absolute inset-0 grid grid-cols-3 grid-rows-3 rounded-[22%] border-2 border-[#5a3420] bg-[#fffaf0] p-[14%] shadow-inner" style={{ transform: tf }}>
            {Array.from({ length: 9 }, (_, i) => <span key={i} className={cn('m-auto size-[70%] rounded-full', PIPS[n].includes(i) && (n === 1 ? 'bg-red-600' : 'bg-[#3a2416]'))} />)}
          </div>
        ))}
      </div>
    </div>
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
      tag.className = 'pointer-events-none absolute left-0 top-0 rounded-full bg-[#ffc21a] px-2 py-0.5 text-sm font-black text-[#241b4b] shadow-lg'
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
      <span className={cn('boss-pop-late rounded-2xl px-4 py-1 text-xl font-black', event.cancelled ? 'bg-emerald-500 text-white' : 'bg-red-600 text-white')}>
        {event.cancelled ? t('boss.fx.endNo', { roll }) : t('boss.fx.endYes', { roll })}
      </span>
    </div>
  )
}
