import { Outlet, ScrollRestoration, useLocation, useNavigationType } from 'react-router'

// Frame for full-screen pages opened from a tab (tools, details).
// No bottom tab bar, so the page gets the whole screen; pages show a back button instead.
export function SubPageShell() {
  // Re-keyed per path so each page fades in (search params like ?tab keep the page).
  const { pathname } = useLocation()
  // Opening a page slides it in from the right like an iPhone app; going back just fades (motion plan #5).
  const pushed = useNavigationType() !== 'POP'
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-background pb-[env(safe-area-inset-bottom)]">
      <div key={pathname} className={pushed ? 'page-push' : 'page-enter'}>
        <Outlet />
      </div>
      {/* Back button returns to the same scroll position (decision #43). */}
      <ScrollRestoration />
    </div>
  )
}
