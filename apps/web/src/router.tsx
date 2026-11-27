import { createBrowserRouter, createHashRouter } from 'react-router'
import type { RouteObject } from 'react-router'
import { RouteError } from '@/components/common/RouteError'
import { routes } from '@/routes'

// The public demo (GitHub Pages) uses hash links (/#/...); the real app uses normal paths.
const createRouter = import.meta.env.VITE_DEPLOY_MOCKS === 'true' ? createHashRouter : createBrowserRouter
// every top-level route gets a friendly crash screen with a reload button
const guarded: RouteObject[] = routes.map((r) => ({ ...r, errorElement: r.errorElement ?? <RouteError /> }) as RouteObject)
export const router = createRouter(guarded)
