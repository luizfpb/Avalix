import { Navigate, Route, Routes } from 'react-router-dom'
import { RouteGuard } from './routes/RouteGuard'
import { AppShell } from './components/AppShell'
import Login from './pages/Login'
import Cadastro from './pages/Cadastro'
import RecuperarSenha from './pages/RecuperarSenha'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Avaliados from './pages/Avaliados'
import Configuracoes from './pages/Configuracoes'

export default function App() {
  return (
    <RouteGuard>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/recuperar-senha" element={<RecuperarSenha />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/avaliados" element={<Avaliados />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
        </Route>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RouteGuard>
  )
}
