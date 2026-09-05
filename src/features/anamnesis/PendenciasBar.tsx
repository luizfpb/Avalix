import { CheckCircle2, ListChecks } from 'lucide-react'
import { pendenciasDaAnamnese, totalPendente } from './pendencias'
import type { AnamnesisAnswers } from './spec'

// Barra fixa de pendências da anamnese.
//
// O formulário completo passa de oito mil pixels num celular de 360 px. Quem
// responde não tinha ideia de quanto faltava nem de onde: descobria a pendência
// só ao tocar em Enviar, e voltava a rolar procurando qual pergunta ficou em
// branco. A barra fica visível o tempo todo, diz quantas faltam, nomeia cada
// uma e leva até ela.
//
// Ela conta SÓ o obrigatório. A camada B (objetivo, hábitos, postural) é
// contexto opcional de propósito; medir "progresso" nela transformaria pergunta
// facultativa em cobrança e nunca chegaria a 100%.

export function PendenciasBar({ answers }: { answers: AnamnesisAnswers }) {
  const pendencias = pendenciasDaAnamnese(answers)
  const total = totalPendente(pendencias)

  if (total === 0) {
    return (
      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-success/10 px-4 py-2.5 backdrop-blur">
        <p className="flex items-center gap-2 text-sm font-medium text-success">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          Tudo o que é obrigatório já foi respondido.
        </p>
      </div>
    )
  }

  return (
    <div
      role="status"
      className="sticky bottom-0 z-10 -mx-4 space-y-1.5 border-t bg-background/95 px-4 py-2.5 backdrop-blur"
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <ListChecks className="size-4 shrink-0 text-warning" aria-hidden />
        {total === 1 ? 'Falta 1 resposta obrigatória' : `Faltam ${total} respostas obrigatórias`}
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {pendencias.map((p) => (
          <li key={p.secao}>
            <a
              href={`#${p.secao}`}
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {p.rotulo}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
