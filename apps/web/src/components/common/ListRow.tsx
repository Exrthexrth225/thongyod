import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type ListRowProps = {
  /** Left side: usually an <IconTile> or <Avatar>. */
  leading?: ReactNode
  title: string
  subtitle?: string
  /** Link target. Without `trailing` the whole row is a link with a chevron;
   *  with `trailing` only the left part (leading + text) is the link. */
  to?: string
  /** Right side: e.g. buttons. Never inside the link. */
  trailing?: ReactNode
  /** Router state for the link, e.g. SHOW_BACK so the page opened from here shows a back button. */
  linkState?: unknown
  /** Instead of a link: the whole row is a button (e.g. opens a sheet), with a chevron. */
  onClick?: () => void
}

// One row inside a list card. Rows separate themselves with a top border.
export function ListRow({ leading, title, subtitle, to, trailing, linkState, onClick }: ListRowProps) {
  const main = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{title}</span>
        {subtitle && <span className="block truncate text-[13px] text-muted-foreground">{subtitle}</span>}
      </span>
    </>
  )
  const row = 'flex min-h-16 items-center gap-3 py-2.5 [&+&]:border-t [&+&]:border-background'

  if (onClick && !to && !trailing) {
    return (
      <button type="button" onClick={onClick} className={cn(row, 'pressable w-full text-left')}>
        {main}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    )
  }
  if (to && !trailing) {
    return (
      <Link to={to} state={linkState} className={cn(row, 'pressable')}>
        {main}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    )
  }
  return (
    <div className={row}>
      {to ? (
        <Link to={to} state={linkState} className="pressable flex min-w-0 flex-1 items-center gap-3">
          {main}
        </Link>
      ) : (
        main
      )}
      {trailing && <span className="flex shrink-0 items-center gap-2">{trailing}</span>}
    </div>
  )
}
