import { useEffect, useRef } from 'react'
import { SPIN_CURVE } from '@/features/wheel/logic'
import { cn } from '@/lib/utils'

// Light brand slab colours with ink text (#97, no pink): readable in light and dark mode.
const SLICE_COLORS = ['#FFD35C', '#FFA66B', '#6FDDBE', '#8DBBFF', '#B9A0FF', '#BDE57A', '#6ED3DD', '#A9B3FF']
const TEXT_COLOR = '#17142B'
const R = 96
const LABEL_CHARS = 10

type SpinWheelProps = {
  options: string[]
  /** Clockwise rotation in degrees. Change it to spin; the wheel animates there. */
  rotation: number
  /** Animate to `rotation` over this many ms (0 = jump). */
  durationMs: number
  /** Fires when the spin animation ends. */
  onSpinEnd?: () => void
  /** Tap on the wheel (spin, or skip the animation while spinning). */
  onTap?: () => void
  label: string
  className?: string
  /** ms after the spin starts when the pointer knocks a slice border: it flaps there (#36). */
  flapAt?: number[]
  /** After the spin: this slice stays bright, the others dim, and the wheel gives a little pop. */
  winner?: number | null
}

/** Wheel of names. It only draws; who wins is decided outside (features/wheel/logic). */
export function SpinWheel({ options, rotation, durationMs, onSpinEnd, onTap, label, className, flapAt, winner = null }: SpinWheelProps) {
  const pointer = useRef<SVGSVGElement>(null)
  // The pointer flaps every time it passes a border; the flaps follow the wheel's slowing down.
  useEffect(() => {
    if (!flapAt?.length || !pointer.current?.animate) return
    const el = pointer.current
    const ids = flapAt.map((ms) =>
      window.setTimeout(
        () =>
          el.animate([{ transform: 'translate(-50%, -0.25rem) rotate(0deg)' }, { transform: 'translate(-50%, -0.25rem) rotate(-22deg)', offset: 0.3 }, { transform: 'translate(-50%, -0.25rem) rotate(0deg)' }], {
            duration: 160,
            easing: 'ease-out',
          }),
        ms,
      ),
    )
    return () => ids.forEach((id) => window.clearTimeout(id))
  }, [flapAt])

  const count = Math.max(options.length, 1)
  const size = 360 / count
  const fontSize = count <= 4 ? 12 : count <= 8 ? 10 : 8.5

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={label}
      className={cn('relative aspect-square w-full touch-manipulation select-none active:scale-[0.99]', winner !== null && 'wheel-pop', className)}
    >
      {/* Pointer: fixed at the top, does not rotate. */}
      <svg
        ref={pointer}
        viewBox="0 0 40 34"
        className="absolute top-0 left-1/2 z-10 w-10 drop-shadow"
        style={{ transform: 'translate(-50%, -0.25rem)', transformOrigin: '50% 15%' }}
        aria-hidden="true"
      >
        <path d="M4 3 H36 L20 31 Z" fill="var(--ink)" stroke="var(--yolk)" strokeWidth="3" strokeLinejoin="round" />
      </svg>
      {/* Rotate an HTML box (not an SVG group) so the pivot is always the exact center. */}
      <div
        className="size-full"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: durationMs > 0 ? `transform ${durationMs}ms cubic-bezier(${SPIN_CURVE.join(', ')})` : 'none',
        }}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget) onSpinEnd?.()
        }}
      >
        <svg viewBox="-100 -100 200 200" className="size-full" aria-hidden="true">
          <circle r={R + 3} fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
          {options.map((option, i) => {
            const start = i * size
            const center = start + size / 2
            const text = option.length > LABEL_CHARS ? `${option.slice(0, LABEL_CHARS - 1)}…` : option
            // Left half: turn the text around so it never reads upside down.
            const flip = center > 180
            return (
              <g key={i} style={{ opacity: winner !== null && winner !== i ? 0.35 : 1, transition: 'opacity 0.4s ease-out' }}>
                {count === 1 ? (
                  <circle r={R} fill={SLICE_COLORS[0]} />
                ) : (
                  <path d={slicePath(start, start + size)} fill={sliceColor(i, count)} stroke="#ffffff" strokeWidth="1.2" />
                )}
                {/* Text runs from the rim toward the middle, along the slice center. */}
                <text
                  transform={`rotate(${flip ? center + 90 : center - 90})`}
                  x={flip ? -(R - 8) : R - 8}
                  y={0}
                  textAnchor={flip ? 'start' : 'end'}
                  dominantBaseline="central"
                  fill={TEXT_COLOR}
                  fontSize={fontSize}
                  fontWeight={600}
                >
                  {text}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <svg viewBox="-100 -100 200 200" className="absolute inset-0 size-full" aria-hidden="true">
        <circle r={16} fill="var(--ink)" stroke="var(--yolk)" strokeWidth="3" />
        <circle r={5} fill="var(--yolk)" />
      </svg>
    </button>
  )
}

function point(angle: number, radius: number): string {
  const rad = (angle * Math.PI) / 180
  return `${(Math.sin(rad) * radius).toFixed(3)} ${(-Math.cos(rad) * radius).toFixed(3)}`
}

function slicePath(from: number, to: number): string {
  const large = to - from > 180 ? 1 : 0
  return `M0 0 L${point(from, R)} A${R} ${R} 0 ${large} 1 ${point(to, R)} Z`
}

/** Cycles the palette, but never paints the last slice like the first one (they touch). */
function sliceColor(i: number, count: number): string {
  const color = SLICE_COLORS[i % SLICE_COLORS.length]
  if (i === count - 1 && i % SLICE_COLORS.length === 0) return SLICE_COLORS[3]
  return color
}
