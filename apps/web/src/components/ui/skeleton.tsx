import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// Soft block with a light sweeping across, shown while data loads (shadcn/ui Skeleton, MIT; shimmer #98).
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('skeleton-shimmer rounded-md bg-muted', className)} {...props} />
}
