import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { GangActivitySummary, ListGangsResponse, ReadGangActivityResponse } from '@thongyod/shared'
import i18n from '@/i18n'
import { showErrorToast } from '@/lib/toast'
import { apiFetch } from './client'
import { useCursorList } from './paging'
import type { CursorPage, GangDetail, GangSummary } from './types'

export const gangKeys = {
  mine: ['gangs', 'mine'] as const,
  list: (q: string) => ['gangs', 'list', q] as const,
  detail: (id: string) => ['gangs', 'detail', id] as const,
}

/** My gangs page by page, `q` = part of the name (#43). For the gangs tab. */
export function useGangList(q: string) {
  return useCursorList<GangActivitySummary>(gangKeys.list(q), '/gangs', { q })
}

/** Capture the read boundary BEFORE loading gang content, including on a direct link. */
async function gangSnapshot(id: string, signal: AbortSignal): Promise<GangActivitySummary | null> {
  let cursor: string | null = null
  do {
    const page: ListGangsResponse = await apiFetch(`/gangs?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal })
    const gang = page.items.find(g => g.id === id)
    if (gang) return gang
    cursor = page.nextCursor
  } while (cursor)
  return null
}

/** Only the gang screen acknowledges activity; member previews and list impressions do not. */
export function useOpenGang(id: string) {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: [...gangKeys.detail(id), 'open'],
    enabled: id !== '',
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const activity = await gangSnapshot(id, signal)
      const detail = await apiFetch<GangDetail>(`/gangs/${encodeURIComponent(id)}`, { signal })
      return { ...detail, activity }
    },
  })
  const cursor = query.data?.activity?.readCursor
  const ready = query.isSuccess && !query.isFetching
  useEffect(() => {
    if (!ready || !cursor || document.visibilityState !== 'visible') return
    let active = true
    // Once a successfully viewed snapshot is acknowledged, let the write finish even
    // if the user goes back; its result must still refresh the shared badge caches.
    void apiFetch<ReadGangActivityResponse>(`/gangs/${encodeURIComponent(id)}/activity/read`, {
      method: 'PUT', body: JSON.stringify({ readThrough: cursor }),
    }).then(() => {
      // Never invalidate the open query here: that would generate a new cursor/read loop.
      void client.invalidateQueries({ queryKey: ['gangs', 'list'] })
      void client.invalidateQueries({ queryKey: gangKeys.mine })
    }).catch(() => {
      if (active) showErrorToast(i18n.t('common.saveError'))
    })
    return () => { active = false }
  }, [id, cursor, ready, client])
  return query
}

/** One gang: members, upcoming meetups, titles (provisional contract, see GangDetail). */
export function useGang(id: string) {
  return useQuery({ queryKey: gangKeys.detail(id), queryFn: () => apiFetch<GangDetail>(`/gangs/${id}`), enabled: id !== '' })
}

/** All my gangs (follows every page; people are in a few gangs). For long gang lists use useCursorList. */
export function useMyGangs() {
  return useQuery({
    queryKey: gangKeys.mine,
    queryFn: async () => {
      const all: GangSummary[] = []
      let cursor: string | null = null
      do {
        const page: CursorPage<GangSummary> = await apiFetch<CursorPage<GangSummary>>(
          `/gangs?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        )
        all.push(...page.items)
        cursor = page.nextCursor
      } while (cursor)
      return all
    },
  })
}
