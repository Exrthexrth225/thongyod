import { cn } from '@/lib/utils'

// Small tangerine number on an icon (the bell). Hidden at 0; shows "9+" above 9. `dot` = just a small dot, no number
// (tab bar: "something is waiting" without a second count next to the bell, #94).
// Put it inside a `relative` wrapper around the icon.
export function CountBadge({ count, className, dot = false }: { count: number; className?: string; dot?: boolean }) {
  if (count <= 0) return null
  if (dot) return <span aria-hidden="true" className={cn('absolute -top-0.5 -right-1 size-2.5 rounded-full bg-tangerine ring-2 ring-background', className)} />
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute -top-1 -right-2 grid h-4 min-w-4 place-items-center rounded-full bg-tangerine px-1 text-[10px] leading-none font-semibold text-on-slab',
        className,
      )}
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}
