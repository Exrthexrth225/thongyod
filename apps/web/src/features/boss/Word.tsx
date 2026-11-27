import { cn } from '@/lib/utils'

/** Game lettering (gold by default) for titles, banners and status lines. */
export function Word({ text, tone = 'gold', className }: { text: string; tone?: 'gold' | 'red' | 'green' | 'white' | 'gray'; className?: string }) {
  return <span className={cn('boss-word', tone !== 'gold' && `boss-word-${tone}`, className)} data-text={text}>{text}</span>
}
