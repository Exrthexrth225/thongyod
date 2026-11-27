import { cn } from '@/lib/utils'

/** Game lettering (gold by default) for titles, banners and status lines. */
export function Word({ text, tone = 'gold', className, style }: { text: string; tone?: 'gold' | 'red' | 'green' | 'white' | 'gray'; className?: string; style?: React.CSSProperties }) {
  return <span className={cn('boss-word', tone !== 'gold' && `boss-word-${tone}`, className)} style={style} data-text={text}>{text}</span>
}
