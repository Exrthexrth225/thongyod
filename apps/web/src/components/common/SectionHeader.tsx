import type { ReactNode } from 'react'
import { usePop } from '@/lib/usePop'
import { cn } from '@/lib/utils'

type SectionHeaderProps = {
  title: string
  /** Optional element on the right, e.g. a "ดูทั้งหมด" link. */
  action?: ReactNode
  /** Quieter text: a sub-heading (h3) inside a bigger zone (Home). */
  muted?: boolean
  /** Small number pill next to the title (e.g. how many invites wait). Hidden at 0. */
  count?: number | string
}

// Heading above a group of cards on a page. Big and bold (Kanit): the page's structure reads from these.
export function SectionHeader({ title, action, muted = false, count }: SectionHeaderProps) {
  const pop = usePop(count)
  return (
    <div className="flex items-center gap-2 px-4 pt-3 pb-2">
      {muted ? (
        <h3 className="text-base font-medium text-pretty">{title}</h3>
      ) : (
        <h2 className="text-[22px] leading-tight font-bold text-balance">{title}</h2>
      )}
      {count !== undefined && count !== 0 && (
        <span key={pop.key} className={cn('rounded-full bg-tangerine px-2.5 text-[13px] leading-6 font-semibold text-on-slab tabular-nums', pop.className)}>
          {count}
        </span>
      )}
      {action && <span className="ml-auto shrink-0">{action}</span>}
    </div>
  )
}
