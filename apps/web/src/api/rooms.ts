// Game rooms: each friend plays on their own phone (PROVISIONAL contract, DECISIONS #76, docs/HANDOFF.md).
import { useEffect, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, ApiError } from './client'
import { identityKey } from './auth'
import type { BossActionPayload, BossRoomSettings, PartyRoomSettings, Room, RoomCommandType, RoomGame, SpyRoomSettings } from './types'
import { newActionId, newerRoom, seatLink } from './roomLink'

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

/** My live link to this room: is the socket up, and does this tab act for my seat? */
export function useRoomLink() {
  return useSyncExternalStore(seatLink.subscribe, seatLink.getState)
}

/** One room. Live over the socket; polls every 1.5 s only while the socket is down (or in the demo). */
export function useRoom(code: string) {
  const client = useQueryClient()
  const link = useRoomLink()
  const live = link.connected && link.watching === code
  useEffect(() => {
    if (!isRoomCode(code)) return
    return seatLink.watch(code, {
      onView: (room) => client.setQueryData<Room>(roomKeys.room(code), (current) => newerRoom(current, room)),
      onClosed: () => void client.invalidateQueries({ queryKey: roomKeys.room(code) }),
    })
  }, [client, code])
  return useQuery({
    queryKey: roomKeys.room(code),
    queryFn: async () => {
      try { return await apiFetch<Room>(`/rooms/${code}`, {}, false) }
      catch (error) { if (error instanceof ApiError && error.status === 401) void client.invalidateQueries({ queryKey: identityKey }); throw error }
    },
    enabled: isRoomCode(code),
    refetchInterval: live ? false : 1500,
    retry: (count, error) => count < 2 && !(error instanceof Error && 'status' in error && [401, 404].includes((error as { status: number }).status)),
  })
}

/** Commands that act inside a match send the phase they were made in (STALE_PHASE otherwise). */
const PHASED: RoomCommandType[] = ['start', 'reveal', 'lobby', 'vote']

type RestRoute = { url: string; method?: string }
function useRoomAction<V = void>(code: string, type: RoomCommandType, payload: (v: V) => unknown = () => undefined, rest: RestRoute = { url: `/rooms/${code}/${type}` }) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (v: V): Promise<Room | undefined> => {
      const body = payload(v)
      if (seatLink.ready(code)) {
        const current = client.getQueryData<Room>(roomKeys.room(code))
        const result = await seatLink.command({ code, actionId: newActionId(), type, ...(PHASED.includes(type) && current ? { phase: current.phase } : {}), ...(body === undefined ? {} : { payload: body }) })
        if (!result.ok) throw new ApiError(result.status, result.code)
        await seatLink.waitFor(code, result.revision)
        return client.getQueryData<Room>(roomKeys.room(code))
      }
      return apiFetch<Room>(rest.url, { method: rest.method ?? 'POST', body: body === undefined ? undefined : JSON.stringify(body) }, false)
    },
    onSuccess: (room) => { if (room) client.setQueryData<Room>(roomKeys.room(code), (current) => newerRoom(current, room)) },
    onError: (error) => { if (error instanceof ApiError && error.status === 401) void client.invalidateQueries({ queryKey: identityKey }) },
  })
}

export function useCreateRoom() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: { game: RoomGame; settings: Partial<SpyRoomSettings> | Partial<PartyRoomSettings> | Partial<BossRoomSettings> }) => apiFetch<Room>('/rooms', { method: 'POST', body: JSON.stringify(body) }, false),
    onError: (error) => { if (error instanceof ApiError && error.status === 401) void client.invalidateQueries({ queryKey: identityKey }) },
  })
}

export const useJoinRoom = (code: string) => useRoomAction(code, 'join')
export const useLeaveRoom = (code: string) => useRoomAction(code, 'leave')
export const useStartRound = (code: string) => useRoomAction(code, 'start')
export const useRevealRound = (code: string) => useRoomAction(code, 'reveal')
export const useBackToLobby = (code: string) => useRoomAction(code, 'lobby')
export const useClaimHost = (code: string) => useRoomAction(code, 'claimHost')
export const useRoomSettings = (code: string) =>
  useRoomAction<Partial<SpyRoomSettings> | Partial<PartyRoomSettings> | Partial<BossRoomSettings>>(code, 'settings', (settings) => settings, { url: `/rooms/${code}/settings`, method: 'PATCH' })
/** Answer the current party card (ใครน่าจะ…: a player id, ไม่เคย…: 'have' | 'never'). */
export function useRoomVote(code: string) {
  const client = useQueryClient()
  return useRoomAction<string>(code, 'vote', (choice) => ({ choice, roundNumber: (client.getQueryData<Room>(roomKeys.room(code)) as { round?: { number: number } | null } | undefined)?.round?.number }))
}
/** Owner: answer a Board Screen's pairing request, or unpair it. */
export const useBoardDecision = (code: string, type: 'boardApprove' | 'boardReject' | 'boardRevoke') =>
  useRoomAction<string>(code, type, (boardId) => ({ boardId }))

/** I'm the Boss! move. Socket only in practice; REST has no route for it, so it needs a live connection. */
export const useBossAction = (code: string) => useRoomAction<BossActionPayload>(code, 'boss', (action) => ({ action }), { url: `/rooms/${code}/boss` })
/** Owner: carry on without / remove an offline player who holds the game up. */
export const useBossHost = (code: string, type: 'bossSkip' | 'bossKick') => useRoomAction<string>(code, type, (targetId) => ({ targetId }), { url: `/rooms/${code}/${type}` })

/** Invite friends: they get a "ชวนเล่น" notification that opens the room. */
export function useInviteToRoom(code: string) {
  return useMutation({ mutationFn: (userIds: string[]) => apiFetch<void>(`/rooms/${code}/invite`, { method: 'POST', body: JSON.stringify({ userIds }) }) })
}
