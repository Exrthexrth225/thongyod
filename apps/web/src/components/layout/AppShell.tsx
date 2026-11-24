import { Outlet, ScrollRestoration, useLocation } from 'react-router'
import { BottomNav } from './BottomNav'
import { PetGrowthToast } from '@/components/pet/PetGrowthToast'
import { PETS_ENABLED } from '@/config/features'

// Page frame for every tab: content area + fixed bottom tab bar.
// Content is limited to phone width and centered on larger screens.
export function AppShell() {
  // Reset page state per path without hiding the new page during navigation.
  const { pathname } = useLocation()
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-background">
      {/* Bottom padding = tab bar height + phone safe area, so content is never hidden. */}
      <main className="pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <div key={pathname}>
          <Outlet />
        </div>
      {/* Back button returns to the same scroll position (decision #43). */}
      <ScrollRestoration />
      </main>
      <BottomNav />
      {PETS_ENABLED && <PetGrowthToast />}
    </div>
  )
}
