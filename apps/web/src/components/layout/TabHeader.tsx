import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { wantsBack } from '@/lib/nav'

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
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const showBack = wantsBack(location.state)
  return (
    <header className="flex items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
      {showBack && (
        <Button variant="ghost" size="icon" className="-ml-3 shrink-0" aria-label={t('common.back')}
          onClick={() => {
            if (location.key === 'default') void navigate('/')
            else void navigate(-1)
          }}>
          <ChevronLeft className="size-6" aria-hidden="true" />
        </Button>
      )}
      <div className="min-w-0 flex-1">
        {overline && <p className="text-sm text-muted-foreground">{overline}</p>}
        <h1 className="truncate text-[30px] leading-tight font-extrabold">{title}</h1>
      </div>
      {children}
    </header>
  )
}
