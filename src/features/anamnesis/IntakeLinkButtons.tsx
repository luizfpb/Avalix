import { useMemo, useState } from 'react'
import { Copy, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { loadIntakeLinkLocal } from './linkStore'

// Ações de um convite pendente na lista (v2.1): reexibe Copiar/WhatsApp se a
// URL estiver salva NESTE aparelho (linkStore). Em outro aparelho o segredo
// nunca existiu — mostra a dica e o caminho é cancelar e gerar novo.
export function IntakeLinkButtons({
  intakeId,
  waMessage,
}: {
  intakeId: string
  // texto completo da mensagem do WhatsApp; a URL é acrescentada no fim
  waMessage: string
}) {
  const url = useMemo(() => loadIntakeLinkLocal(intakeId), [intakeId])
  const [copied, setCopied] = useState(false)

  if (!url) {
    return (
      <span
        className="text-xs text-muted-foreground"
        title="Por segurança, a URL fica salva só no aparelho onde o link foi gerado. Se precisar dela aqui, cancele e gere um novo."
      >
        copie no aparelho onde foi gerado
      </span>
    )
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url as string)
      setCopied(true)
    } catch {
      // clipboard bloqueado (permissão): sem feedback, o botão segue clicável
    }
  }

  const waHref = `https://wa.me/?text=${encodeURIComponent(`${waMessage} ${url}`)}`

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Button size="xs" variant="outline" onClick={copyLink}>
        <Copy /> {copied ? 'Copiado!' : 'Copiar'}
      </Button>
      <Button asChild size="xs" variant="outline">
        <a href={waHref} target="_blank" rel="noreferrer" aria-label="Enviar link no WhatsApp">
          <MessageCircle /> WhatsApp
        </a>
      </Button>
    </span>
  )
}
