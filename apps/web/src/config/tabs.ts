import { CalendarDays, Gamepad2, Home, User, Users, type LucideIcon } from 'lucide-react'

export type TabKey = 'home' | 'plan' | 'games' | 'gangs' | 'me'
export type Tab = { to: string; key: TabKey; icon: LucideIcon }

// The five jobs of the app (#132): today, plan a meetup, play, the people, me.
// Every path here must be a route under AppShell in routes.tsx, or the tab bar disappears on that tab (routes.test.ts).
export const TABS: Tab[] = [
  { to: '/', key: 'home', icon: Home },
  { to: '/plan', key: 'plan', icon: CalendarDays },
  { to: '/games', key: 'games', icon: Gamepad2 },
  { to: '/gangs', key: 'gangs', icon: Users },
  { to: '/me', key: 'me', icon: User },
]
