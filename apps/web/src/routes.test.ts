import { describe, expect, it } from 'vitest'
import type { RouteObject } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { TABS } from '@/config/tabs'
import { routes } from '@/routes'

function shellOf(element: RouteObject['element']): unknown {
  return element && typeof element === 'object' && 'type' in element ? element.type : undefined
}

// Bug 2026-11-24: /games sat under SubPageShell, so tapping the เกม tab hid the tab bar
// and the tab page had no back button: no way out.
describe('tab routes', () => {
  const shell = routes.find((route) => shellOf(route.element) === AppShell)
  const tabPaths = new Set((shell?.children ?? []).map((child) => (child.index ? '/' : `/${child.path}`)))

  it.each(TABS.map((tab) => tab.to))('%s is a page inside AppShell, so the tab bar stays', (to) => {
    expect(tabPaths.has(to)).toBe(true)
  })
})
