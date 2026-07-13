import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { X } from 'lucide-react'
import { verifyPublishedShell } from './updateCheck'

const UPDATE_INTERVAL_MS = 60 * 60 * 1000
type UpdateStatus = 'checking' | 'ready' | 'failed' | 'updating'

export function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [status, setStatus] = useState<UpdateStatus>('checking')
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | null>(null)
  const registered = useRef(false)

  useEffect(() => {
    if (registered.current) return
    registered.current = true

    updateRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true)
        setStatus('checking')
        // O SW só pode assumir o controle se o HTML publicado apontar para JS
        // e CSS que realmente existem e têm o MIME correto.
        void verifyPublishedShell().then((valid) => setStatus(valid ? 'ready' : 'failed'))
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return
        const check = () => {
          if (document.visibilityState === 'visible') void registration.update()
        }
        document.addEventListener('visibilitychange', check)
        window.addEventListener('online', check)
        window.setInterval(check, UPDATE_INTERVAL_MS)
      },
    })
  }, [])

  if (!needRefresh) return null

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
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
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
