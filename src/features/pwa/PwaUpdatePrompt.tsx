import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import { X } from 'lucide-react'
import { isPublicIntakeLocation, verifyPublishedShell } from './updateCheck'

const UPDATE_INTERVAL_MS = 60 * 60 * 1000
type UpdateStatus = 'checking' | 'ready' | 'failed' | 'updating'

// Páginas públicas (treino e anamnese do aluno) nunca mostram o aviso de
// versão nova, e o aluno não visita a área do profissional, onde ele seria
// aplicado: a correção publicada não chegava ao aparelho dele enquanto houvesse
// uma aba aberta — no iPhone, semanas. Agora a versão que já está esperando é
// aplicada ao abrir a página, antes de qualquer toque. Depois que a pessoa
// começa a mexer, nada recarrega sozinho.
const PUBLIC_AUTO_UPDATE_WINDOW_MS = 10_000
const AUTO_UPDATE_KEY = 'avalix:pwa:auto-update-at'
const AUTO_UPDATE_COOLDOWN_MS = 5 * 60 * 1000

function recentlyAutoUpdated(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(AUTO_UPDATE_KEY))
    return Number.isFinite(last) && now - last < AUTO_UPDATE_COOLDOWN_MS
  } catch {
    return false
  }
}

function markAutoUpdated(now = Date.now()): void {
  try {
    sessionStorage.setItem(AUTO_UPDATE_KEY, String(now))
  } catch {
    // sem sessionStorage, o prazo de 10 s ainda impede recarregar em ciclo
  }
}

export function PwaUpdatePrompt() {
  const location = useLocation()
  const isPublicIntake = isPublicIntakeLocation(location.pathname)
  const [needRefresh, setNeedRefresh] = useState(false)
  const [status, setStatus] = useState<UpdateStatus>('checking')
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    let active = true
    let registration: ServiceWorkerRegistration | undefined
    let interval: number | undefined
    const startedAt = Date.now()
    let touched = false
    const onTouch = () => {
      touched = true
    }
    window.addEventListener('pointerdown', onTouch, true)
    window.addEventListener('keydown', onTouch, true)

    const check = () => {
      if (document.visibilityState === 'visible') void registration?.update()
    }

    updateRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        if (!active) return
        // As paginas publicas tambem precisam registrar o SW para abrir offline,
        // mas nunca interrompem um formulario ou treino com prompt de update.
        if (isPublicIntake) {
          if (touched || Date.now() - startedAt > PUBLIC_AUTO_UPDATE_WINDOW_MS || recentlyAutoUpdated()) return
          void verifyPublishedShell().then((valid) => {
            if (!active || !valid || touched) return
            markAutoUpdated()
            void updateRef.current?.(true)
          })
          return
        }
        setNeedRefresh(true)
        setStatus('checking')
        void verifyPublishedShell().then((valid) => {
          if (active) setStatus(valid ? 'ready' : 'failed')
        })
      },
      onRegisteredSW(_swUrl, nextRegistration) {
        if (!active || !nextRegistration) return
        registration = nextRegistration
        document.addEventListener('visibilitychange', check)
        window.addEventListener('online', check)
        interval = window.setInterval(check, UPDATE_INTERVAL_MS)
      },
    })

    return () => {
      active = false
      updateRef.current = null
      window.removeEventListener('pointerdown', onTouch, true)
      window.removeEventListener('keydown', onTouch, true)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('online', check)
      if (interval !== undefined) window.clearInterval(interval)
    }
  }, [isPublicIntake])

  if (isPublicIntake || !needRefresh) return null

  async function handleUpdate() {
    setStatus('checking')
    const valid = await verifyPublishedShell()
    if (!valid) {
      setStatus('failed')
      return
    }
    setStatus('updating')
    await updateRef.current?.(true)
  }

  const message =
    status === 'failed'
      ? 'Atualização incompleta no servidor. Continue nesta versão.'
      : status === 'checking'
        ? 'Verificando a nova versão…'
        : status === 'updating'
          ? 'Atualizando…'
          : 'Nova versão disponível'

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-3">
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5 shadow-lg">
        <span className="text-sm">{message}</span>
        {status !== 'failed' ? (
          <button
            onClick={handleUpdate}
            disabled={status !== 'ready'}
            className="rounded-md bg-primary-solid px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {status === 'ready' ? 'Atualizar' : 'Aguarde'}
          </button>
        ) : null}
        <button
          onClick={() => setNeedRefresh(false)}
          aria-label="Agora não"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
