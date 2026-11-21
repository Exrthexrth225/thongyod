import { NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Home, PawPrint, Sparkles, User, Users, type LucideIcon } from 'lucide-react'
import { useWaitingCount } from '@/features/meetups/useWaiting'
import { CountBadge } from '@/components/common/CountBadge'
import { cn } from '@/lib/utils'

type TabKey = 'home' | 'gangs' | 'explore' | 'pet' | 'me'
type Tab = { to: string; key: TabKey; icon: LucideIcon; center?: boolean }

const TABS: Tab[] = [
  { to: '/', key: 'home', icon: Home },
  { to: '/gangs', key: 'gangs', icon: Users },
  { to: '/explore', key: 'explore', icon: Sparkles, center: true },
  { to: '/pet', key: 'pet', icon: PawPrint },
  { to: '/me', key: 'me', icon: User },
]

// Bottom tab bar: a floating dark pill (DECISIONS #97). The center tab ("ทำอะไรดี") is a raised yolk button.
// The tab you land on gives a small hop; the sparkle spins (motion plan #5).
export function BottomNav() {
  const { t } = useTranslation()
  const waiting = useWaitingCount()
  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.625rem)] z-40 px-3"
    >
      <ul className="mx-auto flex h-16 max-w-md items-end justify-around rounded-[26px] bg-ink px-1 text-ink-muted shadow-[0_8px_24px_-8px_rgb(23_20_43/0.45)]">
        {TABS.map(({ to, key, icon: Icon, center }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'pressable flex h-16 flex-col items-center justify-end gap-0.5 pb-2 text-[11px]',
                  isActive ? 'font-semibold text-ink-foreground' : 'text-ink-muted',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {center ? (
                    <span className="-mt-7 mb-0.5 flex size-14 items-center justify-center rounded-full border-4 border-background bg-yolk text-on-slab">
                      <Icon key={String(isActive)} className={cn('size-6', isActive && 'tab-spin')} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                  ) : (
                    <span key={String(isActive)} className={cn('relative', isActive && 'tab-hop')}>
                      <Icon className="size-6" strokeWidth={isActive ? 2.4 : 1.9} aria-hidden="true" />
                      {key === 'home' && <CountBadge dot count={waiting} className="ring-ink" />}
                    </span>
                  )}
                  <span>
                    {t(`nav.${key}`)}
                    {key === 'home' && waiting > 0 && <span className="sr-only">{t('home.waitingTitle', { count: waiting })}</span>}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
