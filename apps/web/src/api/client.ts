// Small fetch wrapper for our API. All requests go to /api/* :
// - deployed demo: resolved in-page by the existing MSW handlers
// - development with mocks: answered by the Vite mock middleware
// - development without mocks: Vite proxies to the NestJS backend (vite.config.ts)

export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(status: number, code: string | undefined) {
    super(`API error ${status}${code ? ` (${code})` : ''}`)
    this.status = status
    this.code = code
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const options: RequestInit = {
    ...init,
    // JSON bodies get a JSON content type. FormData (file upload) must set its own boundary.
    headers: typeof init.body === 'string' ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
    credentials: 'include',
  }
  const response = import.meta.env.VITE_DEPLOY_MOCKS === 'true'
    ? await (await import('../mocks/browser')).demoResponse(new Request(new URL(`/api${path}`, window.location.origin), options))
    : await fetch(`/api${path}`, options)
  if (!response.ok) {
    let code: string | undefined
    try {
      const body = (await response.json()) as { error?: { code?: string } }
      code = body.error?.code
    } catch {
      // Body is not JSON; keep code undefined.
    }
    throw new ApiError(response.status, code)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
