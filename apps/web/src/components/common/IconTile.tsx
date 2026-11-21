import type { LucideIcon } from 'lucide-react'
import { tintClass } from '@/lib/tones'
import { cn } from '@/lib/utils'

type IconTileProps = {
  icon: LucideIcon
  /** accent = group / important items, neutral = solo / secondary items. */
  tone?: 'accent' | 'neutral'
  /** A full colour block (lib/tones tint 1–8). Wins over `tone`. */
  tint?: number
  className?: string
}

// Rounded square with an icon, used at the start of rows and tool cards.
export function IconTile({ icon: Icon, tone = 'accent', tint, className }: IconTileProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-2xl',
        tint !== undefined ? tintClass(tint) : tone === 'accent' ? 'bg-accent text-accent-foreground' : 'bg-background text-muted-foreground',
        className,
      )}
    >
      <Icon className="size-[22px]" strokeWidth={2.2} />
    </span>
  )
}
