import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { X } from 'lucide-react'

// Atualização do PWA sem F12. Problema que isto resolve: o service worker
// cacheia o shell; uma aba/instalação aberta por muito tempo nunca percebia o
// deploy novo e ficava na versão velha (precisava limpar o cache na mão).
//
// Escolha de UX: NÃO recarregar sozinho. Este é um app de coleta de dado —
// um reload no meio de uma avaliação perderia o formulário. Em vez disso,
// detectamos a versão nova (ao abrir, ao focar a aba, ao reconectar e a cada
// hora) e mostramos um aviso discreto; um toque em "Atualizar" recarrega num
// momento seguro escolhido pela pessoa. (Por isso registerType: 'prompt' no
// vite.config: o SW novo espera, não assume controle sozinho.)

const UPDATE_INTERVAL_MS = 60 * 60 * 1000 // 1h

export function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | null>(null)
  const registered = useRef(false)

  useEffect(() => {
    // guarda contra o duplo-mount do StrictMode (dev); registra uma vez só
    if (registered.current) return
    registered.current = true

    updateRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true)
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return
        // o plugin não checa sozinho: forçamos o update() ao voltar pro app,
        // ao reconectar e periodicamente, pra uma aba aberta pegar o deploy.
        const check = () => {
          if (document.visibilityState === 'visible') registration.update()
        }
        document.addEventListener('visibilitychange', check)
        window.addEventListener('online', check)
        setInterval(check, UPDATE_INTERVAL_MS)
      },
    })
  }, [])

  if (!needRefresh) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-3">
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5 shadow-lg">
        <span className="text-sm">Nova versão disponível</span>
        <button
          onClick={() => updateRef.current?.(true)}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Atualizar
        </button>
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
