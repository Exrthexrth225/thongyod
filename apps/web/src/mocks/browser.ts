import { getResponse } from 'msw'
import { HttpResponse } from 'msw/http'
import { handlers } from './handlers'

// Resolve the deployed demo inside the page. A stopped/unsupported service worker
// must not send API requests to GitHub Pages, which has no backend.
export async function demoResponse(request: Request): Promise<Response> {
  request.signal.throwIfAborted()
  const response = await getResponse(handlers, request, { baseUrl: new URL(request.url).origin })
  request.signal.throwIfAborted()
  return response ?? HttpResponse.json(
    { error: { code: 'DEMO_API_NOT_IMPLEMENTED' } },
    { status: 501 },
  )
}
