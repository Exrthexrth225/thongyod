import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { BANDS, valueFromPoint } from '@/features/spectrum/logic'
import { cn } from '@/lib/utils'

type SpectrumDialProps = {
  /** Text at the left (0) and right (100) ends. */
  left: string
  right: string
  /** Needle position 0–100; null hides the needle. */
  value: number | null
  /** Target centre 0–100; null keeps it hidden. */
  target: number | null
  /** When given, the needle can be dragged / moved with the arrow keys. */
  onChange?: (value: number) => void
  label: string
  className?: string
}

const CX = 100
const CY = 100
const R = 92
const angle = (v: number) => Math.PI * (1 - v / 100)
const at = (v: number, r = R) => [CX + r * Math.cos(angle(v)), CY - r * Math.sin(angle(v))] as const

/** Pie slice of the half circle from value a to value b (a < b). */
function wedge(a: number, b: number) {
  const [x1, y1] = at(Math.max(0, a))
  const [x2, y2] = at(Math.min(100, b))
  return `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2} Z`
}

const BAND_FILL = ['fill-primary/30', 'fill-primary/60', 'fill-primary'] as const

// Half-circle scale for คลื่นความคิด: the hidden target (2 / 3 / 4-point bands) and a needle the team turns.
// Drag anywhere on the dial, or focus it and use the arrow keys.
export function SpectrumDial({ left, right, value, target, onChange, label, className }: SpectrumDialProps) {
  const svg = useRef<SVGSVGElement>(null)

  function move(e: PointerEvent<SVGSVGElement>) {
    const box = svg.current?.getBoundingClientRect()
    if (!box || !onChange) return
    const x = ((e.clientX - box.left) / box.width) * 200
    const y = ((e.clientY - box.top) / box.height) * 108
    onChange(valueFromPoint(x - CX, y - CY))
  }

  function key(e: KeyboardEvent<SVGSVGElement>) {
    if (!onChange || value === null) return
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 }[e.key]
    if (step === undefined) return
    e.preventDefault()
    onChange(Math.min(100, Math.max(0, Math.round(value + step))))
  }

  const [nx, ny] = value === null ? [CX, CY] : at(value, R - 10)

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <svg
        ref={svg}
        viewBox="0 0 200 108"
        className={cn('w-full touch-none rounded-xl outline-none select-none focus-visible:ring-2 focus-visible:ring-ring', onChange && 'cursor-pointer')}
        role={onChange ? 'slider' : 'img'}
        aria-label={label}
        aria-valuemin={onChange ? 0 : undefined}
        aria-valuemax={onChange ? 100 : undefined}
        aria-valuenow={onChange && value !== null ? Math.round(value) : undefined}
        aria-valuetext={onChange && value !== null ? `${Math.round(value)} / 100` : undefined}
        tabIndex={onChange ? 0 : undefined}
        onPointerDown={(e) => {
          if (!onChange) return
          e.currentTarget.setPointerCapture(e.pointerId)
          move(e)
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e)
        }}
        onKeyDown={key}
      >
        <path d={wedge(0, 100)} className="fill-muted" />
        {target !== null && (
          <g className="spectrum-target">
            {BANDS.map((band, i) => (
              <path key={band.points} d={wedge(target - band.half, target + band.half)} className={BAND_FILL[i]} />
            ))}
            {BANDS.map((band, i) => {
              const inner = BANDS[i + 1]?.half ?? 0
              const mid = (band.half + inner) / 2
              return [-1, 1].map((side) => {
                if (i === BANDS.length - 1 && side === 1) return null
                const v = i === BANDS.length - 1 ? target : target + side * mid
                const [tx, ty] = at(v, R - 9)
                return (
                  <text key={`${band.points}${side}`} x={tx} y={ty} textAnchor="middle" dominantBaseline="central" className={cn('text-[7px] font-medium', i === 2 ? 'fill-primary-foreground' : 'fill-foreground')}>
                    {band.points}
                  </text>
                )
              })
            })}
          </g>
        )}
        {value !== null && (
          <g className="spectrum-needle">
            <line x1={CX} y1={CY} x2={nx} y2={ny} strokeWidth={3} strokeLinecap="round" className="stroke-foreground" />
            <circle cx={nx} cy={ny} r={5} className="fill-foreground" />
          </g>
        )}
        <circle cx={CX} cy={CY} r={7} className="fill-foreground" />
      </svg>
      <div className="flex items-start justify-between gap-3 text-sm font-medium">
        <span className="max-w-[45%] rounded-xl bg-card px-3 py-1.5 shadow-xs ring-1 ring-border">← {left}</span>
        <span className="max-w-[45%] rounded-xl bg-card px-3 py-1.5 text-right shadow-xs ring-1 ring-border">{right} →</span>
      </div>
    </div>
  )
}
