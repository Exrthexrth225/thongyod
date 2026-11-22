import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type RoundActionProps = {
  icon: LucideIcon
  label: string
  onClick: () => void
  /** A need this button fills (0–100): drawn as a ring around it, red-ish when low. */
  meter?: number
  active?: boolean
  disabled?: boolean
  /** Ring colour (a CSS colour / var). */
  tone?: string
}

// A round in-game button (#122, like Talking Tom / Pou): sits on the scene, icon + tiny label, and when it looks
// after a need its ring shows how full that need is, so the meters live on the buttons instead of a form below.
export function RoundAction({ icon: Icon, label, onClick, meter, active, disabled, tone = 'var(--mint)' }: RoundActionProps) {
  const low = meter !== undefined && meter < 30
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={meter !== undefined ? `${label} ${Math.round(meter)}%` : label} className="pressable flex w-16 flex-col items-center gap-1 disabled:opacity-50">
      <span
        className={cn('pet-hud-ring grid size-14 place-items-center rounded-full p-[4px]', low && 'animate-pulse')}
        style={meter !== undefined ? { background: `conic-gradient(${low ? 'var(--tangerine)' : tone} ${meter * 3.6}deg, var(--hud-track) 0)` } : undefined}
      >
        <span className={cn('pet-hud-face grid size-full place-items-center rounded-full', active && 'is-active')}>
          <Icon className="size-6" aria-hidden="true" />
        </span>
      </span>
      <span className="pet-hud-label rounded-full px-1.5 text-[11px] leading-4 font-bold">{label}</span>
    </button>
  )
}
