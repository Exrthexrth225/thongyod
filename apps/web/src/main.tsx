import { StrictMode } from 'react'
import { watchAppVersion } from '@/lib/appVersion'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { queryClient } from './api/queryClient'
import { Toaster } from './components/ui/toaster'
import { ErrorState } from './components/common/ErrorState'
import { ServerWake } from './components/common/ServerWake'
import './i18n' // must load before any component renders text
import './index.css'
import { router } from './router'

async function mount() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ServerWake>
          <RouterProvider router={router} />
        </ServerWake>
        <Toaster />
      </QueryClientProvider>
    </StrictMode>,
  )
}

// Real app only: keeps the app shell on the phone so it opens while the free server wakes up.
// The Pages demo registers MSW's worker instead (src/mocks/browser.ts).
if (import.meta.env.PROD && import.meta.env.VITE_DEPLOY_MOCKS !== 'true' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined) })
  watchAppVersion()
}

void mount().catch((error: unknown) => {
  console.error('Unable to start the frontend demo', error)
  createRoot(document.getElementById('root')!).render(<ErrorState onRetry={() => window.location.reload()} />)
})
