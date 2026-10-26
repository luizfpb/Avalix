// A "última vez" que a Execução e a página do aluno mostram: a melhor série da
// sessão mais recente (0044) e, desde a 0048, cada série daquela sessão, com o
// descanso realizado desde a 0054. As regras ficam aqui; LastLoadLine e SetRowFields só desenham.

export function kg(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

export type LastLoad = {
  weightKg: number | null
  reps: number | null
  rir: number | null
  date: string | null
  reachedFailure?: boolean | null
  // cada série daquela mesma sessão, em ordem (0048); vazio antes dela
  sets?: PreviousSet[]
}

// Uma série da última sessão, para mostrar embaixo da série de mesmo número.
export type PreviousSet = {
  setNumber: number
  weightKg: number | null
  reps: number | null
  rir: number | null
  // descanso realizado depois da série (0054); null = não informado
  restSeconds: number | null
  reachedFailure: boolean
}

type RawPreviousSet = {
  set_number: number
  weight_kg: number | null
  reps: number | null
  rir: number | null
  rest_seconds?: number | null
  reached_failure?: boolean | null
}

// O que o servidor manda (app.workout_last_sets) -> LastLoad. Uma regra só
// para a Execução e para a página do aluno.
export function lastLoadFromServer(s: {
  weight_kg: number | null
  reps: number | null
  rir: number | null
  performed_at: string | null
  reached_failure?: boolean | null
  sets?: RawPreviousSet[] | null
}): LastLoad {
  return {
    weightKg: s.weight_kg,
    reps: s.reps,
    rir: s.rir,
    date: s.performed_at,
    reachedFailure: s.reached_failure,
    sets: (s.sets ?? []).map((x) => ({
      setNumber: x.set_number,
      weightKg: x.weight_kg,
      reps: x.reps,
      rir: x.rir,
      restSeconds: x.rest_seconds ?? null,
      reachedFailure: x.reached_failure === true,
    })),
  }
}

// A série de mesmo número da última sessão: o app grava as séries numeradas
// sem buraco, então a linha i da tela é a set_number i + 1.
export function previousSetAt(last: LastLoad | null | undefined, index: number): PreviousSet | null {
  return last?.sets?.find((s) => s.setNumber === index + 1) ?? null
}

// "55 kg × 8, RIR 1 · descanso 90s" / "20 reps" / "50 kg × 10, falha"
export function previousSetText(p: PreviousSet): string | null {
  if (p.weightKg == null && p.reps == null) return null
  const carga = p.weightKg != null
    ? `${kg(p.weightKg)} kg${p.reps != null ? ` × ${p.reps}` : ''}`
    : `${p.reps} reps`
  const esforco = p.reachedFailure ? ', falha' : p.rir != null ? `, RIR ${kg(p.rir)}` : ''
  const descanso = p.restSeconds == null ? ''
    : p.restSeconds === 0 ? ' · sem descanso' : ` · descanso ${p.restSeconds}s`
  return carga + esforco + descanso
}
