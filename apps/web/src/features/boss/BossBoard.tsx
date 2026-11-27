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
  /** pick_start: tap a space. */
  onPick?: (space: number) => void
  /** The middle of the table. */
  children?: ReactNode
  /** A space whose deal just closed: it flips over big. */
  settledSpace?: number | null
  /** Show the placard stack and the draw pile in the middle. */
  piles?: boolean
  className?: string
}

/** The board: 16 deal spaces around a felt table, the $ marker, and whatever goes in the middle. */
export function BossBoard({ view, roll, onPick, children, piles, settledSpace = null, className }: Props) {
  const grid = useRef<HTMLDivElement>(null)
  const marker = useRef<HTMLSpanElement>(null)
  const markerSpace = view.markerSpace
  const focus = markerSpace !== null && view.phase !== 'pick_start' && view.phase !== 'game_over'
  const rollKey = roll?.id

  // Hop the marker along its path. Positions are read from the tiles, so it follows any screen size.
  useLayoutEffect(() => {
    const root = grid.current, pawn = marker.current
    if (!root || !pawn || !roll || roll.fromSpace === undefined || roll.spaceIndex === undefined) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const closed = new Set(view.spaces.filter((s) => s.closedByDeal !== null).map((s) => s.index))
    // step by step, over closed spaces too (they just don't count)
    const path = [roll.fromSpace, ...(roll.path ?? hopPath(roll.fromSpace, roll.spaceIndex, closed))]
    // Offsets from the end space (the marker keeps the same spot on every tile, so tile centre to tile centre works).
    const end = root.querySelector<HTMLElement>(`[data-space="${roll.spaceIndex}"]`)!.getBoundingClientRect()
    const at = (i: number) => {
      const tile = root.querySelector<HTMLElement>(`[data-space="${i}"]`)!.getBoundingClientRect()
      return { x: tile.left + tile.width / 2 - (end.left + end.width / 2), y: tile.top + tile.height / 2 - (end.top + end.height / 2) }
    }
    const frames: Keyframe[] = []
    path.forEach((space, i) => {
      const p = at(space)
      const offset = path.length === 1 ? 1 : i / (path.length - 1)
      frames.push({ transform: `translate(${p.x}px, ${p.y}px) scale(1)`, offset: Math.min(1, offset) })
      if (i < path.length - 1) {
        const q = at(path[i + 1])
        frames.push({ transform: `translate(${(p.x + q.x) / 2}px, ${(p.y + q.y) / 2 - 28}px) scale(1.15)`, offset: Math.min(1, (i + 0.5) / (path.length - 1)) })
      }
    })
    // after the die has tumbled and shown its face
    pawn.animate(frames, { duration: Math.max(1, path.length - 1) * ROLL.step, delay: ROLL.tumble + ROLL.hold, easing: 'linear', fill: 'backwards' })
    // only when a new roll arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollKey])

  return (
    <div className={cn('relative aspect-square max-h-full max-w-full overflow-hidden rounded-[3%] bg-[#17142b] shadow-[0_20px_60px_rgba(0,0,0,0.5)] ring-1 ring-[#e9b949]/40', className)}>
      <div ref={grid} className="boss-grid absolute inset-[3.5%] grid gap-[0.8%] [container-type:size]">
        {view.spaces.map((space) => {
          const here = markerSpace === space.index
          const celebrate = settledSpace === space.index
          // While someone plays, the other spaces step back so the one with the $ stands out.
          const dim = focus && !here && !celebrate
          return (
            <div key={space.index} data-space={space.index} style={ringCell(space.index)} className={cn('relative min-h-0 min-w-0 transition-[opacity,filter] duration-500', dim && 'opacity-75 saturate-[0.6]', here && 'z-10', celebrate && 'boss-celebrate z-30')}>
              <SpaceTile space={space} shape={ringShape(space.index)} active={markerSpace === space.index} onPick={onPick ? () => onPick(space.index) : undefined} className="size-full" />
              {markerSpace === space.index && (
                <span ref={marker} className="boss-marker pointer-events-none absolute z-20 size-[11cqmin] -translate-x-1/2 -translate-y-1/2" style={markerSpot(space.index)}>
                  <span className="boss-marker-ring absolute inset-0 rounded-full" aria-hidden="true" />
                  <img src={fxArt('pawn')} alt="$" className="boss-pawn relative size-full drop-shadow-[0_6px_4px_rgba(0,0,0,0.55)]" />
                </span>
              )}
            </div>
          )
        })}
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
