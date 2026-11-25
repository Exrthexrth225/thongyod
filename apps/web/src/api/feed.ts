import { useQuery } from '@tanstack/react-query'
import type { ActivityFeedItem, ListFeedResponse } from '@thongyod/shared'
import { apiFetch } from './client'
import { useCursorList } from './paging'

export const feedKeys = { preview: ['feed', 'preview'] as const, list: ['feed', 'list'] as const }

export function useFeedPreview() {
  return useQuery({ queryKey: feedKeys.preview, queryFn: ({ signal }) => apiFetch<ListFeedResponse>('/feed?limit=3', { signal }) })
}

export function useFeedList() {
  return useCursorList<ActivityFeedItem>(feedKeys.list, '/feed')
}
