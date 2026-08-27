import { Link } from 'react-router'
import { useAnamneses } from '../anamnesis/hooks'
import {
  anamneseAlerta,
  declaracaoFromAnswers,
  liberacaoFromRow,
  ALERTA_CLASSES,
  ALERTA_ICON_CLASSES,
} from '../anamnesis/clearance'
import { parseAnswers } from '../anamnesis/parse'
import { ALERTA_ICONE } from '../anamnesis/alertaIcone'
import { gateFromRow } from '../anamnesis/gate'

// Banner de atenção no builder: o que a última anamnese aponta, já cruzado com
// o parecer médico registrado sobre ela. Não bloqueia nada — o treinador
// decide.
//
// Com liberação vigente o banner não some por completo: vira uma linha
// discreta. Some, o profissional não saberia se a triagem estava limpa ou se
// alguém resolveu a pendência — e é justamente essa a informação que ele
// precisa antes de prescrever.
export function AnamneseFlag({ subjectId }: { subjectId: string }) {
  const { data } = useAnamneses(subjectId)
  const latest = data?.[0]
  if (!latest) return null

  const liberacao = liberacaoFromRow(latest)
  const alerta = anamneseAlerta({
    gate: gateFromRow(latest),
    liberacao,
    declaracao: declaracaoFromAnswers(parseAnswers(latest.payload)),
    assessedAt: latest.assessed_at,
    updatedAt: latest.updated_at,
  })

  // triagem limpa e sem parecer registrado: nada a dizer
  if (!alerta.pedeLiberacao && liberacao.status === 'pendente') return null

  const href = `/avaliados/${subjectId}/anamnese/${latest.id}`
  const Icon = ALERTA_ICONE[alerta.nivel]

  if (alerta.nivel === 'ok') {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <Icon className={`size-4 ${ALERTA_ICON_CLASSES.ok}`} />
        <span>
          {alerta.pedeLiberacao ? 'A anamnese pedia avaliação médica. ' : ''}
          {alerta.titulo}
          {alerta.linhas[0] ? ` · ${alerta.linhas[0]}` : ''}
        </span>
        <Link to={href} className="underline-offset-4 hover:underline">
          Ver anamnese
        </Link>
      </p>
    )
  }

  const acao =
    alerta.pedeLiberacao && liberacao.status === 'pendente'
      ? 'Registrar liberação médica'
      : 'Ver anamnese'

  return (
    <div className={['space-y-1 rounded-md border p-3 text-sm', ALERTA_CLASSES[alerta.nivel]].join(' ')}>
      <p className="flex items-center gap-1.5 font-medium">
        <Icon className={`size-4 ${ALERTA_ICON_CLASSES[alerta.nivel]}`} /> {alerta.titulo}
      </p>
      {alerta.linhas.map((linha, i) => (
        <p key={i}>{linha}</p>
      ))}
      {alerta.destacarMotivos && alerta.pedeLiberacao ? (
        <p>Revise antes de prescrever.</p>
      ) : null}
      {alerta.ressalvas.map((r, i) => (
        <p key={i} className="text-xs text-muted-foreground">
          {r}
        </p>
      ))}
      <Link to={href} className="inline-block text-xs underline-offset-4 hover:underline">
        {acao}
      </Link>
    </div>
  )
}
