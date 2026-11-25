import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RoomIdentity } from '@thongyod/shared'
import { apiFetch } from './client'
import { appUrl } from '@/lib/share'

export const identityKey = ['auth', 'room-identity'] as const
export function useRoomIdentity() {
  return useQuery({ queryKey: identityKey, queryFn: () => apiFetch<RoomIdentity>('/auth/room-identity'), staleTime: 0 })
}

/** Guests return only to room routes; never trust an arbitrary returnTo query. */
export function guestReturnTo(value: string): string {
  try {
    const url = new URL(value, 'https://app.invalid')
    return value.startsWith('/') && url.origin === 'https://app.invalid' && /^\/games\/rooms(?:\/(?:new|\d{6}))?$/.test(url.pathname)
      ? url.pathname + url.search : '/games/rooms'
  } catch { return '/games/rooms' }
}

export function useCreateRoomGuest() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (displayName: string) => apiFetch<RoomIdentity>('/auth/room-guest', { method: 'POST', body: JSON.stringify({ displayName }) }),
    onSuccess: async (identity) => {
      await client.cancelQueries()
      client.clear()
      client.setQueryData(identityKey, identity)
    },
  })
}

export function useLogout() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
    onSuccess: async () => {
      await client.cancelQueries()
      client.clear()
      // A fresh document discards component state and in-flight account data, preserving device collections.
      window.location.replace(appUrl('/login'))
    },
  })
}
