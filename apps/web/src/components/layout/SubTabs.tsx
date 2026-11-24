import { NavLink, useLocation } from 'react-router'
import { cn } from '@/lib/utils'

type SubTab = { to: string; label: string }

// Tabs inside a page that change the URL (e.g. แก๊ง | เพื่อน). Same pill track as SegmentedChoice (#127, #132).
export function SubTabs({ tabs, label }: { tabs: SubTab[]; label: string }) {
  const location = useLocation()
  return (
    <nav aria-label={label} className="mx-4 flex gap-1 rounded-full bg-muted p-1">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          // Switching sub-tabs replaces history and keeps the back button (if any) pointing to where you came from.
          replace
          state={location.state}
          end
          className={({ isActive }) =>
            cn(
              'flex min-h-10 flex-1 items-center justify-center rounded-full px-2 text-sm transition-[background-color,color] duration-150',
              isActive ? 'bg-primary font-semibold text-primary-foreground' : 'font-medium text-muted-foreground active:bg-background/60',
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
