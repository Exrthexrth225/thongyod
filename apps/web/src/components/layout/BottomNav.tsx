import { NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Gamepad2, Home, User, Users, type LucideIcon } from 'lucide-react'
import { useWaitingCount } from '@/features/meetups/useWaiting'
import { CountBadge } from '@/components/common/CountBadge'
import { cn } from '@/lib/utils'

type TabKey = 'home' | 'plan' | 'games' | 'gangs' | 'me'
type Tab = { to: string; key: TabKey; icon: LucideIcon }

// The five jobs of the app (#132): today, plan a meetup, play, the people, me.
const TABS: Tab[] = [
  { to: '/', key: 'home', icon: Home },
  { to: '/plan', key: 'plan', icon: CalendarDays },
  { to: '/games', key: 'games', icon: Gamepad2 },
  { to: '/gangs', key: 'gangs', icon: Users },
  { to: '/me', key: 'me', icon: User },
]

// Bottom tab bar (#132): a flat full-width bar in the card colour, never floating over content.
// The current tab sits in a yolk pill; the tab you land on gives a small hop (motion plan #5).
export function BottomNav() {
  const { t } = useTranslation()
  const waiting = useWaitingCount()
  return (
    <nav aria-label={t('nav.label')} className="fixed inset-x-0 bottom-0 z-40 bg-card pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid h-16 max-w-md grid-cols-5 px-1.5">
        {TABS.map(({ to, key, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'pressable flex h-16 flex-col items-center justify-center gap-0.5 text-xs',
                  isActive ? 'font-bold text-foreground' : 'font-medium text-muted-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    key={String(isActive)}
                    className={cn('relative flex h-8 w-14 items-center justify-center rounded-full', isActive && 'tab-hop bg-primary text-primary-foreground')}
                  >
                    <Icon className="size-[22px]" strokeWidth={isActive ? 2.3 : 1.9} aria-hidden="true" />
                    {key === 'home' && <CountBadge dot count={waiting} className="top-0.5 right-2.5 ring-card" />}
                  </span>
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
