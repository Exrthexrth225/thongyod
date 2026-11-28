import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { BossEvent, BossView } from '@/api/types'
import { cn } from '@/lib/utils'
import { centerArt, fxArt, hopPath, markerSpot, ringCell, ringShape } from './meta'
import { DeckPile, PlacardStack, SpaceTile } from './parts'
import { ROLL } from './useBossTimeline'

type Props = {
  view: BossView
  /** The latest dice roll to animate (marker hops tile by tile). */
  roll?: BossEvent | null
  startedAt?: number
  /** While the marker is still hopping: keep the glow on the space it left, so the board does not give away the landing. */
  hold?: number | null
  /** pick_start: tap a space. */
  onPick?: (space: number) => void
  /** The middle of the table. */
  children?: ReactNode
  /** A space whose deal just closed: it flips over big. */
  settledSpace?: number | null
  /** Show the placard stack and the draw pile in the middle. */
  dealSlotButton?: ReactNode
  piles?: boolean
  className?: string
}

/** The board: 16 deal spaces around a felt table, the $ marker, and whatever goes in the middle. */
export function BossBoard({ view, roll, startedAt, hold = null, onPick, children, piles, dealSlotButton, settledSpace = null, className }: Props) {
  const grid = useRef<HTMLDivElement>(null)
  const marker = useRef<HTMLSpanElement>(null)
  const markerSpace = roll?.spaceIndex ?? hold ?? view.markerSpace
  const lit = hold ?? markerSpace
  const focus = markerSpace !== null && view.phase !== 'pick_start' && view.phase !== 'game_over'
  const rollKey = roll?.id

  // Hop the marker along its path like a game piece: it jumps onto the middle of each space (the space bumps and puffs),
  // and after landing on the last one it hops off to its resting spot at the side, so it never covers the icons.
  useLayoutEffect(() => {
    const root = grid.current, pawn = marker.current
    if (!root || !pawn || !roll || roll.fromSpace === undefined || roll.spaceIndex === undefined) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (motion.matches) return
    const closed = new Set(view.spaces.filter((s) => s.closedByDeal !== null).map((s) => s.index))
    // step by step, over closed spaces too (they just don't count)
    const path = roll.path ?? hopPath(roll.fromSpace, roll.spaceIndex, closed)
    const cell = (i: number) => root.querySelector<HTMLElement>(`[data-space="${i}"]`)!
    const rest = pawn.getBoundingClientRect()
    const restC = { x: rest.left + rest.width / 2, y: rest.top + rest.height / 2 }
    const rel = (p: { x: number; y: number }) => ({ x: p.x - restC.x, y: p.y - restC.y })
    const centre = (i: number) => { const r = cell(i).getBoundingClientRect(); return rel({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) }
    // where it rested on the space it starts from: measure a probe placed like the marker
    const probe = document.createElement('span')
    probe.style.cssText = 'position:absolute;width:0;height:0;'
    Object.assign(probe.style, markerSpot(roll.fromSpace))
    cell(roll.fromSpace).appendChild(probe)
    const pr = probe.getBoundingClientRect()
    probe.remove()
    const start = rel({ x: pr.left, y: pr.top })
    const lift = rest.height * 0.9
    const ceiling = root.getBoundingClientRect().top + rest.height * .55 - restC.y
    const animations: Animation[] = []
    const elapsed = startedAt ? Math.max(0, Date.now() - startedAt) : 0
    const hops = [...path.map(centre), { x: 0, y: 0 }]
    const total = path.length * ROLL.step + ROLL.off
    const delay = ROLL.tumble + ROLL.hold
    const frames: Keyframe[] = [{ transform: `translate(${start.x}px, ${start.y}px) scale(1)`, offset: 0 }]
    let from = start, t = 0
    hops.forEach((to, k) => {
      const len = k < path.length ? ROLL.step : ROLL.off
      const at = (f: number) => Math.min(1, (t + len * f) / total)
      const up = Math.min(lift * (k < path.length ? 1 : 0.7), lift + Math.abs(to.y - from.y) * 0.3)
      frames.push({ transform: `translate(${from.x}px, ${from.y}px) scale(1.05, 0.9)`, offset: at(0.08), easing: 'ease-out' })
      frames.push({ transform: `translate(${(from.x + to.x) / 2}px, ${Math.max(ceiling, Math.min(from.y, to.y) - up)}px) scale(0.95, 1.1)`, offset: at(0.5), easing: 'ease-in' })
      frames.push({ transform: `translate(${to.x}px, ${to.y}px) scale(1.18, 0.8)`, offset: at(0.88), easing: 'ease-out' })
      frames.push({ transform: `translate(${to.x}px, ${to.y}px) scale(1)`, offset: at(1) })
      if (k < path.length) {
        // the space bumps and a puff of dust where it lands
        const land = delay + t + len * 0.88
        animations.push(cell(path[k]).animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }, { transform: 'scale(1)' }], { duration: 260, delay: land, easing: 'ease-out' }))
        const puff = document.createElement('span')
        const r = cell(path[k]).getBoundingClientRect(), g = root.getBoundingClientRect()
        puff.className = 'boss-puff'
        puff.style.left = `${r.left - g.left + r.width / 2}px`
        puff.style.top = `${r.top - g.top + r.height / 2}px`
        root.appendChild(puff)
        const dust = puff.animate([{ opacity: 0, transform: 'translate(-50%, -50%) scale(0.3)' }, { opacity: 0.85, transform: 'translate(-50%, -50%) scale(0.9)', offset: 0.25 }, { opacity: 0, transform: 'translate(-50%, -50%) scale(1.6)' }], { duration: 520, delay: land, fill: 'both', easing: 'ease-out' })
        animations.push(dust)
        dust.finished.then(() => puff.remove(), () => puff.remove())
      }
      from = to
      t += len
    })
    // after the die has tumbled and shown its face
    animations.push(pawn.animate(frames, { duration: total, delay, fill: 'backwards' }))
    for (const animation of animations) animation.currentTime = elapsed
    const stop = () => animations.forEach((animation) => animation.cancel())
    motion.addEventListener('change', stop)
    return () => { stop(); motion.removeEventListener('change', stop) }
    // only when a new roll arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollKey, startedAt])

  return (
    <div className={cn('relative aspect-square max-h-full max-w-full overflow-hidden rounded-[3%] bg-[#17142b] shadow-[0_20px_60px_rgba(0,0,0,0.5)] ring-1 ring-[#e9b949]/40', className)}>
      <div ref={grid} className="boss-grid absolute inset-[3.5%] grid gap-[0.8%] [container-type:size]">
        {view.spaces.map((space) => {
          const here = lit === space.index
          const celebrate = settledSpace === space.index
          // While someone plays, the other spaces step back so the one with the $ stands out.
          const dim = focus && !here && !celebrate
          return (
            <div key={space.index} data-space={space.index} style={ringCell(space.index)} className={cn('relative min-h-0 min-w-0 transition-[opacity,filter] duration-500', dim && 'opacity-75 saturate-[0.6]', here && 'z-10', celebrate && 'boss-celebrate z-30')}>
              <SpaceTile space={space} shape={ringShape(space.index)} active={lit === space.index} onPick={onPick ? () => onPick(space.index) : undefined} className="size-full" />
              {view.deal?.spaceIndex === space.index && dealSlotButton && <div className="boss-tile-slots">{dealSlotButton}</div>}
            </div>
          )
        })}
        {/* Share the destination grid area, outside its dimming and bump transforms. */}
        {markerSpace !== null && (
          <div className="pointer-events-none relative z-40 min-h-0 min-w-0" style={ringCell(markerSpace)}>
            <span ref={marker} className="boss-marker absolute size-[11cqmin] -translate-x-1/2 -translate-y-1/2" style={markerSpot(markerSpace)}>
              <span className="boss-marker-ring absolute inset-0 rounded-full" aria-hidden="true" />
              <img src={fxArt('pawn')} alt="$" className="boss-pawn relative size-full drop-shadow-[0_6px_4px_rgba(0,0,0,0.55)]" />
            </span>
          </div>
        )}
        <div className="relative col-[2/5] row-[2/5] min-h-0 min-w-0 overflow-hidden rounded-[6%] bg-[#241b4b] ring-1 ring-[#e9b949]/35">
          {centerArt ? (
            <>
              <img src={centerArt} alt="" className="absolute inset-0 size-full object-cover" aria-hidden="true" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(18_13_43/0.28)_0%,rgb(18_13_43/0.62)_80%)]" aria-hidden="true" />
            </>
          ) : (
            <div className="boss-center-felt absolute inset-0" aria-hidden="true">
              <span className="boss-center-title absolute inset-x-0 top-[6%] text-center text-[clamp(18px,5vmin,64px)] font-black italic">I&apos;m the Boss!</span>
            </div>
          )}
          {piles && (
            <>
              <PlacardStack view={view} className="absolute bottom-[6%] left-[5%] aspect-[3/4] w-[24%]" />
              <DeckPile count={view.deckCount} className="absolute bottom-[6%] right-[7%] aspect-[2/3] w-[16%]" />
            </>
          )}
          <div className="relative flex size-full flex-col items-center justify-center p-[1.2vmin]">{children}</div>
        </div>
      </div>
    </div>
  )
}
