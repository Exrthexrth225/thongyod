import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { BossEvent, BossView } from '@/api/types'
import { cn } from '@/lib/utils'
import { fxArt, hopPath, ringCell, tableArt } from './meta'
import { SpaceTile } from './parts'

type Props = {
  view: BossView
  /** The latest dice roll to animate (marker hops tile by tile). */
  roll?: BossEvent | null
  /** pick_start: tap a space. */
  onPick?: (space: number) => void
  /** The middle of the table. */
  children?: ReactNode
  className?: string
}

/** The board: 16 deal spaces around a felt table, the $ marker, and whatever goes in the middle. */
export function BossBoard({ view, roll, onPick, children, className }: Props) {
  const grid = useRef<HTMLDivElement>(null)
  const marker = useRef<HTMLImageElement>(null)
  const markerSpace = view.markerSpace
  const rollKey = roll?.id

  // Hop the marker along its path. Positions are read from the tiles, so it follows any screen size.
  useLayoutEffect(() => {
    const root = grid.current, pawn = marker.current
    if (!root || !pawn || !roll || roll.fromSpace === undefined || roll.spaceIndex === undefined) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const closed = new Set(view.spaces.filter((s) => s.closedByDeal !== null).map((s) => s.index))
    const path = [roll.fromSpace, ...hopPath(roll.fromSpace, roll.spaceIndex, closed)]
    const end = pawn.getBoundingClientRect()
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
    pawn.animate(frames, { duration: 900 + path.length * 260, delay: 900, easing: 'linear', fill: 'backwards' })
    // only when a new roll arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollKey])

  return (
    <div className={cn('relative overflow-hidden rounded-[2.2vmin] bg-[#0f5a46] bg-cover bg-center', className)} style={{ backgroundImage: `url(${tableArt})` }}>
      <div ref={grid} className="absolute inset-[5.5%] grid grid-cols-5 grid-rows-5 gap-[0.8vmin]">
        {view.spaces.map((space) => {
          const { col, row } = ringCell(space.index)
          return (
            <div key={space.index} data-space={space.index} style={{ gridColumn: col, gridRow: row }} className="relative min-h-0 min-w-0">
              <SpaceTile space={space} active={markerSpace === space.index} onPick={onPick ? () => onPick(space.index) : undefined} className="size-full" />
              <span className="absolute -left-1 -top-1 flex size-[2.4vmin] min-h-4 min-w-4 items-center justify-center rounded-full bg-[#5a3420] text-[clamp(8px,1.2vmin,12px)] font-bold text-[#fff4dc]">{space.index + 1}</span>
              {markerSpace === space.index && (
                <img ref={marker} src={fxArt('pawn')} alt="$" className="boss-pawn pointer-events-none absolute left-1/2 top-1/2 z-20 size-[7vmin] min-h-10 min-w-10 -translate-x-1/2 -translate-y-[70%] drop-shadow-[0_6px_4px_rgba(0,0,0,0.45)]" />
              )}
            </div>
          )
        })}
        <div className="col-[2/5] row-[2/5] flex min-h-0 min-w-0 flex-col items-center justify-center p-[1vmin]">{children}</div>
      </div>
    </div>
  )
}
