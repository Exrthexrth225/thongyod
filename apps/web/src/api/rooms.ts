// Game rooms: each friend plays on their own phone (PROVISIONAL contract, DECISIONS #76, #134, docs/HANDOFF.md).
import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { randomId } from '@/lib/id'
import { apiFetch, ApiError } from './client'
import { identityKey } from './auth'
import type { BossActionPayload, BossRoomSettings, PartyRoomSettings, Room, RoomGame, SpyRoomSettings } from './types'

export const roomKeys = { room: (code: string) => ['rooms', code] as const }

/** Room codes are 6 digits. */
export const isRoomCode = (code: string) => /^\d{6}$/.test(code)

/** Pull a room code out of a typed code, a pasted link or a scanned QR. */
export function roomCodeFrom(text: string): string | null {
  const trimmed = text.trim()
  if (isRoomCode(trimmed)) return trimmed
  const match = trimmed.match(/games\/rooms\/(\d{6})(?:\D|$)/)
  return match ? match[1] : null
}

/** One room, refreshed via SSE (when available) + polling fallback while open. */
export function useRoom(code: string) {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: roomKeys.room(code),
    queryFn: async () => {
      try {
        return await apiFetch<Room>(`/rooms/${code}`, {}, false)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) void client.invalidateQueries({ queryKey: identityKey })
        throw error
      }
    },
    enabled: isRoomCode(code),
    refetchInterval: (q) => (q.state.data?.game === 'boss' ? 800 : 1500),
    retry: (count, error) => count < 2 && !(error instanceof Error && 'status' in error && [401, 404].includes((error as { status: number }).status)),
  })

  useEffect(() => {
    if (!isRoomCode(code) || import.meta.env.VITE_DEPLOY_MOCKS === 'true' || typeof EventSource === 'undefined') return
    if (query.data?.game !== 'boss') return
    const source = new EventSource(`/api/rooms/${code}/events`, { withCredentials: true })
    source.onmessage = () => {
      void client.invalidateQueries({ queryKey: roomKeys.room(code) })
    }
    return () => source.close()
  }, [client, code, query.data?.game])

  return query
}

function useRoomAction<V = void>(code: string, path: (v: V) => { url: string; body?: unknown; method?: string }) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (v: V) => {
      const { url, body, method = 'POST' } = path(v)
      return apiFetch<Room>(url, { method, body: body === undefined ? undefined : JSON.stringify(body) }, false)
    },
    onSuccess: (room) => client.setQueryData(roomKeys.room(code), room),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) void client.invalidateQueries({ queryKey: identityKey })
      if (error instanceof ApiError && error.status === 409) void client.invalidateQueries({ queryKey: roomKeys.room(code) })
    },
  })
}

export function useCreateRoom() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: { game: RoomGame; settings: Partial<SpyRoomSettings> | Partial<PartyRoomSettings> | Partial<BossRoomSettings> }) =>
      apiFetch<Room>('/rooms', { method: 'POST', body: JSON.stringify(body) }, false),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) void client.invalidateQueries({ queryKey: identityKey })
    },
  })
}

export const useJoinRoom = (code: string) => useRoomAction(code, () => ({ url: `/rooms/${code}/join` }))
export const useLeaveRoom = (code: string) => useRoomAction(code, () => ({ url: `/rooms/${code}/leave` }))
export const useStartRound = (code: string) => useRoomAction(code, () => ({ url: `/rooms/${code}/start` }))
export const useRevealRound = (code: string) => useRoomAction(code, () => ({ url: `/rooms/${code}/reveal` }))
export const useBackToLobby = (code: string) => useRoomAction(code, () => ({ url: `/rooms/${code}/lobby` }))
export const useRoomSettings = (code: string) =>
  useRoomAction<Partial<SpyRoomSettings> | Partial<PartyRoomSettings> | Partial<BossRoomSettings>>(code, (settings) => ({
    url: `/rooms/${code}/settings`,
    method: 'PATCH',
    body: settings,
  }))

export function useBossAction(code: string) {
  const client = useQueryClient()
  return useRoomAction<BossActionPayload>(code, (action) => {
    const current = client.getQueryData<Room>(roomKeys.room(code))
    const expectedRevision = current?.game === 'boss' ? current.boss?.revision : undefined
    return {
      url: `/rooms/${code}/boss`,
      body: { actionId: randomId(), expectedRevision, action },
    }
  })
}

/** Answer the current party card (ใครน่าจะ…: a player id, ไม่เคย…: 'have' | 'never'). */
export function useRoomVote(code: string) {
  const client = useQueryClient()
  return useRoomAction<string>(code, (choice) => {
    const cur = client.getQueryData<Room>(roomKeys.room(code))
    const roundNumber = cur && cur.game !== 'boss' ? cur.round?.number : undefined
    return { url: `/rooms/${code}/vote`, body: { choice, roundNumber } }
  })
}

/** Invite friends: they get a "ชวนเล่น" notification that opens the room. */
export function useInviteToRoom(code: string) {
  return useMutation({ mutationFn: (userIds: string[]) => apiFetch<void>(`/rooms/${code}/invite`, { method: 'POST', body: JSON.stringify({ userIds }) }) })
}
