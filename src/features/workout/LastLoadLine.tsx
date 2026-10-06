import { suggestProgression, type ProgressionKind, type RepRange } from './progression'

// A última vez que a pessoa fez o exercício: a melhor série da sessão mais
// recente, em qualquer plano e registrada por quem for (app.workout_last_sets,
// 0043). A tela do aluno e a Execução mostram a mesma linha, com a mesma
// sugestão — antes cada uma escolhia a "última" por um critério diferente e só
// a do profissional sugeria carga.
export type LastLoad = {
  weightKg: number | null
  reps: number | null
  rir: number | null
  date: string | null
  reachedFailure?: boolean | null
}

const KIND_LABEL: Record<ProgressionKind, string> = {
  increase_load: 'subir carga',
  add_reps: '+1 rep',
  hold: 'manter',
  reduce: 'reduzir',
  insufficient: '',
}

function kg(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function dataBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}` : iso
}

export function LastLoadLine({
  last,
  repRange = null,
  targetRir = null,
  suggest = true,
  className = 'mt-1 text-xs text-primary',
}: {
  last: LastLoad | null | undefined
  repRange?: RepRange | null
  targetRir?: number | null
  // Exercício trocado de outra divisão: a prescrição não é a dele, então só a
  // última vez, sem sugestão.
  suggest?: boolean
  className?: string
}) {
  if (!last || (last.weightKg == null && last.reps == null)) return null
  const s = suggest ? suggestProgression({ last, repRange, targetRir }) : null
  const sugestao = s && s.kind !== 'insufficient' ? s : null
  const carga = last.weightKg != null
    ? `${kg(last.weightKg)} kg${last.reps != null ? ` × ${last.reps}` : ''}`
    : `${last.reps} reps`
  return (
    <p className={className} title={sugestao?.reason}>
      última vez: {carga}
      {last.rir != null ? ` (RIR ${last.rir})` : ''}
      {last.date ? ` em ${dataBr(last.date)}` : ''}
      {last.reachedFailure === true ? ' · Falha' : ''}
      {sugestao ? (
        <>
          {' → sugestão: '}
          {sugestao.suggestedWeightKg != null ? `${kg(sugestao.suggestedWeightKg)} kg` : ''}
          {sugestao.suggestedReps != null ? ` × ${sugestao.suggestedReps}` : ''}
          {` (${KIND_LABEL[sugestao.kind]})`}
        </>
      ) : null}
    </p>
  )
}
