import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ThemeProvider } from './features/theme/ThemeProvider'
import { AuthProvider } from './features/auth/AuthProvider'
import { OrganizationProvider } from './features/organization/OrganizationProvider'
import { PwaUpdatePrompt } from './features/pwa/PwaUpdatePrompt'
import { installGlobalErrorLog } from './lib/errlog'

const queryClient = new QueryClient()

// erros de runtime não capturados (fora do React) também vão pro client_errors
installGlobalErrorLog()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <OrganizationProvider>
                <App />
                {/* aviso de versão nova do PWA (registro manual do SW) */}
                <PwaUpdatePrompt />
              </OrganizationProvider>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
)
