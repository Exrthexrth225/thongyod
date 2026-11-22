import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, ApiError } from './client'

beforeEach(() => {
  vi.stubGlobal('window', { location: { origin: 'https://example.github.io' } })
  // No service worker, network, or backend is available in the deployed-demo cases.
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request') }))
  vi.stubEnv('VITE_DEPLOY_MOCKS', 'true')
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('deployed demo API without a service worker', () => {
  it('loads profile, gangs, and meetups without making network requests', async () => {
    const me = await apiFetch<{ userId: string; handle: string }>('/me')
    expect(me.handle).toBe('earth_buu')
    const profile = await apiFetch<{ userId: string }>('/users/me/profile')
    expect(profile.userId).toBe(me.userId)
    const gangs = await apiFetch<{ items: { id: string }[] }>('/gangs')
    expect(gangs.items.length).toBeGreaterThan(0)
    const from = new Date(); from.setDate(from.getDate() - 7)
    const to = new Date(); to.setDate(to.getDate() + 14)
    const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), visibility: 'visible', limit: '100' })
    const meetups = await apiFetch<{ items: { id: string }[] }>(`/meetups?${query}`)
    expect(meetups.items.length).toBeGreaterThan(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps mock writes and returns the established JSON and 204 responses', async () => {
    const original = await apiFetch<{ bio: string | null }>('/me')
    try {
      const updated = await apiFetch<{ bio: string }>('/me', { method: 'PATCH', body: JSON.stringify({ bio: 'Demo regression' }) })
      expect(updated.bio).toBe('Demo regression')
      expect((await apiFetch<{ bio: string }>('/me')).bio).toBe('Demo regression')
      expect(await apiFetch('/notifications/read', { method: 'POST', body: JSON.stringify({ ids: [] }) })).toBeUndefined()
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      await apiFetch('/me', { method: 'PATCH', body: JSON.stringify({ bio: original.bio }) })
    }
  })

  it('returns 501 for an unknown demo API and preserves handler errors', async () => {
    await expect(apiFetch('/not-implemented')).rejects.toMatchObject({ status: 501, code: 'DEMO_API_NOT_IMPLEMENTED' })
    await expect(apiFetch('/me', { method: 'PATCH', body: JSON.stringify({ displayName: 'A' }) })).rejects.toMatchObject({ status: 400, code: 'INVALID_DISPLAY_NAME' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('honors an aborted request without using the network', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(apiFetch('/me', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

it('keeps local/backend requests on the existing fetch path', async () => {
  vi.stubEnv('VITE_DEPLOY_MOCKS', 'false')
  const network = vi.fn().mockResolvedValue(new Response(JSON.stringify({ userId: 'real-user' }), { headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', network)
  expect(await apiFetch('/me')).toEqual({ userId: 'real-user' })
  expect(network).toHaveBeenCalledWith('/api/me', expect.objectContaining({ credentials: 'include' }))
  network.mockResolvedValue(new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }), { status: 401 }))
  await expect(apiFetch('/me')).rejects.toBeInstanceOf(ApiError)
})
