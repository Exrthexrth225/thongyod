import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

type HeroHeaderProps = {
  title: string
  subtitle?: string
  /** Slab colour + text colour, e.g. "bg-lilac text-on-lilac" (#97). */
  tone: string
  /** Picture on the right (usually the pet); it may hang over the bottom edge. */
  art?: ReactNode
  /** Small buttons on the top right. */
  action?: ReactNode
}

// Big colour-slab title for a tab page (ทำอะไรดี, …): the page name in huge type with the pet beside it.
// Sub-pages keep the slim sticky PageHeader with its back button.
export function HeroHeader({ title, subtitle, tone, art, action }: HeroHeaderProps) {
  const { t } = useTranslation()
  useEffect(() => {
    document.title = t('app.pageTitle', { page: title })
  }, [t, title])
  return (
    <header className={cn('relative overflow-hidden rounded-b-[36px] px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]', tone)}>
      <div className="flex min-h-11 items-center justify-end gap-2">{action}</div>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 pb-5">
          <h1 className="text-[clamp(2.3rem,12vw,3rem)] leading-[1.1] font-extrabold text-balance">{title}</h1>
          {subtitle && <p className="mt-1 text-base text-pretty opacity-85">{subtitle}</p>}
        </div>
        {art}
      </div>
    </header>
  )
}
