import { createBrowserRouter, createHashRouter } from 'react-router'
import { routes } from '@/routes'

// The public demo (GitHub Pages) uses hash links (/#/...); the real app uses normal paths.
const createRouter = import.meta.env.VITE_DEPLOY_MOCKS === 'true' ? createHashRouter : createBrowserRouter
export const router = createRouter(routes)
