import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// Basic surface for grouped content: a soft filled block, no border (DECISIONS #97).
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn('rounded-3xl bg-card text-card-foreground', className)}
      {...props}
    />
  )
}
