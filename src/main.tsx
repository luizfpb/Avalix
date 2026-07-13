import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { ErrorBoundary } from './components/ErrorBoundary'
import { RouteError } from './components/RouteError'
import { AppProviders } from './features/auth/AppProviders'
import { ThemeProvider } from './features/theme/ThemeProvider'
import { installGlobalErrorLog } from './lib/errlog'

const queryClient = new QueryClient()
const router = createBrowserRouter([
  { path: '*', element: <AppProviders />, errorElement: <RouteError /> },
])

installGlobalErrorLog()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
)
