import type { ReactNode } from 'react'

/** Round button beside a tab title (scan, bell, calendar...). Same size everywhere so headers line up. */
export const ROUND_BUTTON = 'pressable relative grid size-11 shrink-0 place-items-center rounded-full bg-card'

type TabHeaderProps = {
  title: string
  /** Small line above the title, e.g. today's date on Home. */
  overline?: ReactNode
  /** Round buttons on the right. */
  children?: ReactNode
}

// Top of every bottom-bar tab (#132): big title on the left, round buttons on the right. No colour slab.
export function TabHeader({ title, overline, children }: TabHeaderProps) {
  return (
    <header className="flex items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
      <div className="min-w-0 flex-1">
        {overline && <p className="text-sm text-muted-foreground">{overline}</p>}
        <h1 className="truncate text-[30px] leading-tight font-extrabold">{title}</h1>
      </div>
      {children}
    </header>
  )
}
