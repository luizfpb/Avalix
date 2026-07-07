import { Link } from 'react-router'
import { AlertTriangle } from 'lucide-react'
import { useAnamneses } from '../anamnesis/hooks'

// Banner de atenção no builder: última anamnese não liberada ou com flag de
// encaminhamento. Não bloqueia nada — o treinador decide (extraído de
// TreinoNovo na v2.0, sem mudança de comportamento).
export function AnamneseFlag({ subjectId }: { subjectId: string }) {
  const { data } = useAnamneses(subjectId)
  const latest = data?.[0]
  if (!latest || (latest.liberado && !latest.flag_encaminhamento)) return null
  const nivel =
    latest.nivel_encaminhamento === 'antes_iniciar'
      ? 'Avaliação médica recomendada antes de iniciar exercício.'
      : latest.nivel_encaminhamento === 'antes_vigorosa'
        ? 'Avaliação médica recomendada antes de atividade vigorosa.'
        : null
  return (
    <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-400/30 dark:bg-amber-400/10">
      <p className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
        <AlertTriangle className="size-4" /> Anamnese sinaliza atenção
      </p>
      {nivel ? <p className="text-amber-900 dark:text-amber-100">{nivel}</p> : null}
      {latest.flag_encaminhamento ? (
        <p className="text-amber-900 dark:text-amber-100">
          Há sinais que pedem encaminhamento profissional. Revise antes de prescrever.
        </p>
      ) : null}
      <Link
        to={`/avaliados/${subjectId}/anamnese/${latest.id}`}
        className="inline-block text-xs text-amber-800 underline-offset-4 hover:underline dark:text-amber-300"
      >
        Ver anamnese
      </Link>
    </div>
  )
}
