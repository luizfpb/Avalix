// Como uma sessão executada é lida — no histórico do aluno e no detalhe da
// sessão na tela do treinador. Um componente só, porque os dois leem a MESMA
// coisa e discordar aqui seria o mesmo defeito que o texto de WhatsApp já teve
// contra o PDF.
//
// O formato antigo era "5×10 · 5×9 · 5×7", e no aparelho ninguém sabia dizer o
// que era carga e o que era repetição — ambiguidade real relatada em uso. Agora
// cada série é uma linha com a unidade escrita: "5 kg × 10 reps".

export type SessionSet = {
  exerciseName: string
  setNumber: number
  weightKg: number | null
  reps: number | null
  rir: number | null
  restSeconds?: number | null
  reachedFailure?: boolean | null
}

// numeric(6,2) pode chegar como 40 ou como "40.00" dependendo da rota (jsonb da
// RPC do aluno x PostgREST na consulta do treinador). Normaliza os dois para a
// forma que se lê numa ficha: 40, 42.5 — nunca 40.00.
function fmtNumero(n: number): string {
  const v = Number(n)
  return Number.isFinite(v) ? String(Number(v.toFixed(2))) : String(n)
}

function agrupar(sets: SessionSet[]): [string, SessionSet[]][] {
  const mapa = new Map<string, SessionSet[]>()
  for (const s of sets) {
    const atual = mapa.get(s.exerciseName) ?? []
    atual.push(s)
    mapa.set(s.exerciseName, atual)
  }
  for (const lista of mapa.values()) lista.sort((a, b) => a.setNumber - b.setNumber)
  return [...mapa.entries()]
}

export function SessionSets({ sets }: { sets: SessionSet[] }) {
  if (sets.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhuma série registrada nesta sessão.</p>
  }

  return (
    <div className="space-y-2">
      {agrupar(sets).map(([nome, doExercicio]) => (
        <div key={nome}>
          <p className="text-xs font-medium">{nome}</p>
          <ul className="mt-0.5">
            {doExercicio.map((s) => (
              <li key={s.setNumber} className="flex items-baseline gap-2 text-xs tabular-nums">
                <span className="w-8 shrink-0 text-muted-foreground">{s.setNumber}ª</span>
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-4 gap-y-0.5">
                  <span className="w-16 shrink-0">
                    {s.weightKg != null ? `${fmtNumero(s.weightKg)} kg` : '— kg'}
                  </span>
                  <span className="w-16 shrink-0">
                    {s.reps != null ? `${s.reps} reps` : '— reps'}
                  </span>
                  {s.rir != null && (
                    <span className="text-muted-foreground">RIR {fmtNumero(s.rir)}</span>
                  )}
                  {s.reachedFailure === true && (
                    <span className="font-medium">Falha</span>
                  )}
                  {s.restSeconds != null && (
                    <span className="text-muted-foreground">Descanso {s.restSeconds} s</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
