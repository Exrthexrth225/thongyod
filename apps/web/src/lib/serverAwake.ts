/** True when the API answers with our health JSON (Render's own loading page is HTML). */
export async function serverAwake(fetcher: typeof fetch = fetch, timeoutMs = 5000): Promise<boolean> {
  try {
    const response = await fetcher('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('application/json')) return false
    return ((await response.json()) as { status?: string }).status === 'ok'
  } catch { return false }
}
