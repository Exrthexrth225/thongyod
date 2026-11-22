import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { queryClient } from './api/queryClient'
import { Toaster } from './components/ui/toaster'
import { ErrorState } from './components/common/ErrorState'
import './i18n' // must load before any component renders text
import './index.css'
import { router } from './router'

async function mount() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </StrictMode>,
  )
}

void mount().catch((error: unknown) => {
  console.error('Unable to start the frontend demo', error)
  createRoot(document.getElementById('root')!).render(<ErrorState onRetry={() => window.location.reload()} />)
})
