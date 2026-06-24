import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RouteGuard } from './routes/RouteGuard'
import { AppShell } from './components/AppShell'

// Telas carregadas sob demanda: cada rota vira um chunk separado, deixando o
// bundle inicial enxuto (importante no celular).
const Login = lazy(() => import('./pages/Login'))
const Cadastro = lazy(() => import('./pages/Cadastro'))
const RecuperarSenha = lazy(() => import('./pages/RecuperarSenha'))
const DesafioMfa = lazy(() => import('./pages/DesafioMfa'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Avaliados = lazy(() => import('./pages/Avaliados'))
const AvaliadoForm = lazy(() => import('./pages/AvaliadoForm'))
const AvaliadoDetalhe = lazy(() => import('./pages/AvaliadoDetalhe'))
const AvaliacaoNova = lazy(() => import('./pages/AvaliacaoNova'))
const AvaliacaoDetalhe = lazy(() => import('./pages/AvaliacaoDetalhe'))
const AnamneseNova = lazy(() => import('./pages/AnamneseNova'))
const AnamneseDetalhe = lazy(() => import('./pages/AnamneseDetalhe'))
const TreinoNovo = lazy(() => import('./pages/TreinoNovo'))
const TreinoDetalhe = lazy(() => import('./pages/TreinoDetalhe'))
const Execucao = lazy(() => import('./pages/Execucao'))
const ExerciciosBiblioteca = lazy(() => import('./pages/ExerciciosBiblioteca'))
const Calculadora1RM = lazy(() => import('./pages/Calculadora1RM'))
const Evolucao = lazy(() => import('./pages/Evolucao'))
const PosturaSessaoNova = lazy(() => import('./pages/PosturaSessaoNova'))
const PosturaSessaoDetalhe = lazy(() => import('./pages/PosturaSessaoDetalhe'))
const PosturaFoto = lazy(() => import('./pages/PosturaFoto'))
const PosturaComparar = lazy(() => import('./pages/PosturaComparar'))
const Configuracoes = lazy(() => import('./pages/Configuracoes'))
const Agenda = lazy(() => import('./pages/Agenda'))

function PageFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <span className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  )
}

export default function App() {
  return (
    <RouteGuard>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/cadastro" element={<Cadastro />} />
          <Route path="/recuperar-senha" element={<RecuperarSenha />} />
          <Route path="/mfa" element={<DesafioMfa />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/avaliados" element={<Avaliados />} />
            <Route path="/avaliados/novo" element={<AvaliadoForm />} />
            <Route path="/avaliados/:id" element={<AvaliadoDetalhe />} />
            <Route path="/avaliados/:id/editar" element={<AvaliadoForm />} />
            <Route path="/avaliados/:id/evolucao" element={<Evolucao />} />
            <Route path="/avaliados/:id/anamnese/nova" element={<AnamneseNova />} />
            <Route path="/avaliados/:id/anamnese/:anamneseId" element={<AnamneseDetalhe />} />
            <Route path="/avaliados/:id/avaliacoes/nova" element={<AvaliacaoNova />} />
            <Route
              path="/avaliados/:id/avaliacoes/:assessmentId"
              element={<AvaliacaoDetalhe />}
            />
            <Route
              path="/avaliados/:id/avaliacoes/:assessmentId/editar"
              element={<AvaliacaoNova />}
            />
            <Route path="/avaliados/:id/treinos/nova" element={<TreinoNovo />} />
            <Route path="/avaliados/:id/treinos/:planId" element={<TreinoDetalhe />} />
            <Route path="/avaliados/:id/treinos/:planId/editar" element={<TreinoNovo />} />
            <Route path="/avaliados/:id/treinos/:planId/execucao" element={<Execucao />} />
            <Route path="/avaliados/:id/postural/nova" element={<PosturaSessaoNova />} />
            <Route path="/avaliados/:id/postural/comparar" element={<PosturaComparar />} />
            <Route
              path="/avaliados/:id/postural/:sessionId/foto/:photoId"
              element={<PosturaFoto />}
            />

            <Route
              path="/avaliados/:id/postural/:sessionId"
              element={<PosturaSessaoDetalhe />}
            />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/exercicios" element={<ExerciciosBiblioteca />} />
            <Route path="/ferramentas/1rm" element={<Calculadora1RM />} />
          </Route>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </RouteGuard>
  )
}
