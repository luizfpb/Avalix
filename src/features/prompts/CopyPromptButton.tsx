import { useState } from 'react'
import { ChevronDown, ChevronUp, ClipboardCheck, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { controlClass } from '@/lib/ui'

// Botão de copiar prompt, compartilhado pelas quatro telas que geram um.
//
// Três decisões que não são cosméticas:
//
// - "Ver o texto" existe de propósito. O profissional está prestes a colar
//   dado de saúde num serviço de terceiros; esconder o conteúdo atrás de um
//   botão seria a versão errada disso. Ele precisa poder ler antes.
// - O texto é reconstruído a cada clique, não memorizado. É barato (função
//   pura sobre dados já em memória) e elimina a classe de bug em que a tela
//   atualiza e o botão copia o material anterior.
// - Clipboard bloqueado (permissão negada, contexto inseguro, WebView) abre o
//   textarea para seleção manual em vez de falhar em silêncio — mesmo caminho
//   já usado em IntakeLinkButtons e nas telas de link do avaliado.

const AVISO_PADRAO =
  'Contém dados de saúde. O nome vai abreviado, sem contato nem data de nascimento. Ao colar numa IA externa, o tratamento desses dados passa a ser responsabilidade sua.'

export function CopyPromptButton({
  build,
  label = 'Copiar prompt para IA',
  aviso = AVISO_PADRAO,
  onCopied,
}: {
  build: () => string
  label?: string
  aviso?: string
  // chamado só quando a cópia deu certo (trilha de auditoria)
  onCopied?: () => void
}) {
  const [text, setText] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)

  async function handleCopy() {
    const t = build()
    setText(t)
    setFailed(false)
    setCopied(false)
    try {
      await navigator.clipboard.writeText(t)
      setCopied(true)
      onCopied?.()
    } catch {
      setFailed(true)
      setOpen(true)
    }
  }

  function handleToggle() {
    if (!open) setText(build())
    setOpen(!open)
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/80 bg-card/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? <ClipboardCheck /> : <Copy />} {copied ? 'Copiado!' : label}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleToggle}>
          {open ? <ChevronUp /> : <ChevronDown />} {open ? 'Ocultar texto' : 'Ver o texto'}
        </Button>
        {text && open ? (
          <span className="text-xs text-muted-foreground">
            {text.length.toLocaleString('pt-BR')} caracteres
          </span>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Cole numa IA de sua preferência e peça o parecer. A resposta é rascunho para você revisar,
        nunca conduta pronta.
      </p>
      <p className="text-xs text-muted-foreground">{aviso}</p>

      {failed ? (
        <p role="alert" className="text-xs text-warning">
          Não foi possível copiar automaticamente. Selecione o texto abaixo e copie manualmente.
        </p>
      ) : null}

      {open && text ? (
        <textarea
          readOnly
          rows={12}
          value={text}
          aria-label="Prompt gerado"
          onFocus={(e) => e.currentTarget.select()}
          className={`${controlClass} font-mono text-xs leading-relaxed`}
        />
      ) : null}
    </div>
  )
}
