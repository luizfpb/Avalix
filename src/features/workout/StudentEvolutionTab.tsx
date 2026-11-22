import { Trophy, Activity, Scale } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { StudentEvolution } from './studentApi'

function formatDateBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

function fmtNum(value: number | null | undefined, suffix = ''): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 10) / 10
  return `${String(rounded).replace('.', ',')}${suffix}`
}

function fmtDelta(current: number | null | undefined, first: number | null | undefined, suffix: string): string | null {
  if (current == null || first == null) return null
  const diff = Math.round((current - first) * 10) / 10
  if (diff === 0) return `0${suffix}`
  const sign = diff > 0 ? '+' : '−'
  return `${sign}${String(Math.abs(diff)).replace('.', ',')}${suffix}`
}

export function StudentEvolutionTab({ evolution }: { evolution?: StudentEvolution | null }) {
  if (!evolution) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Seu resumo de evolução aparecerá aqui assim que o aplicativo sincronizar com a internet.
        </CardContent>
      </Card>
    )
  }

  const assessments = evolution.assessments ?? []
  const prs = evolution.prs ?? []
  const latest = assessments.at(-1) ?? null
  const first = assessments.length > 1 ? assessments[0] : null
  const hasAnyData =
    evolution.sessions_total > 0 || assessments.length > 0 || prs.length > 0

  if (!hasAnyData) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Conclua seus treinos ou aguarde a primeira avaliação física para acompanhar sua evolução aqui.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Activity className="size-3.5" /> Últimos 30 dias
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{evolution.sessions_30d}</p>
            <p className="text-xs text-muted-foreground">
              {evolution.sessions_30d === 1 ? 'treino concluído' : 'treinos concluídos'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Trophy className="size-3.5" /> Total registrado
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{evolution.sessions_total}</p>
            <p className="text-xs text-muted-foreground">
              {evolution.sessions_total === 1 ? 'sessão no histórico' : 'sessões no histórico'}
            </p>
          </CardContent>
        </Card>
      </div>

      {latest ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="size-4 text-muted-foreground" /> Composição corporal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border bg-muted/30 p-2.5">
                <p className="text-[11px] text-muted-foreground">Peso</p>
                <p className="mt-0.5 text-base font-semibold tabular-nums">
                  {fmtNum(latest.weight_kg, ' kg')}
                </p>
                {first ? (
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {fmtDelta(latest.weight_kg, first.weight_kg, ' kg') ?? ''}
                  </p>
                ) : null}
              </div>
              <div className="rounded-md border bg-muted/30 p-2.5">
                <p className="text-[11px] text-muted-foreground">Gordura</p>
                <p className="mt-0.5 text-base font-semibold tabular-nums">
                  {fmtNum(latest.body_fat_pct, '%')}
                </p>
                {first ? (
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {fmtDelta(latest.body_fat_pct, first.body_fat_pct, ' pp') ?? ''}
                  </p>
                ) : null}
              </div>
              <div className="rounded-md border bg-muted/30 p-2.5">
                <p className="text-[11px] text-muted-foreground">Massa magra</p>
                <p className="mt-0.5 text-base font-semibold tabular-nums">
                  {fmtNum(latest.lean_mass_kg, ' kg')}
                </p>
                {first ? (
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {fmtDelta(latest.lean_mass_kg, first.lean_mass_kg, ' kg') ?? ''}
                  </p>
                ) : null}
              </div>
            </div>

            {assessments.length > 1 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-1.5 font-medium">Data</th>
                      <th className="py-1.5 text-right font-medium">Peso</th>
                      <th className="py-1.5 text-right font-medium">% Gord.</th>
                      <th className="py-1.5 text-right font-medium">M. Magra</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y tabular-nums">
                    {[...assessments].reverse().map((a) => (
                      <tr key={a.assessed_at}>
                        <td className="py-1.5">{formatDateBr(a.assessed_at)}</td>
                        <td className="py-1.5 text-right">{fmtNum(a.weight_kg, ' kg')}</td>
                        <td className="py-1.5 text-right">{fmtNum(a.body_fat_pct, '%')}</td>
                        <td className="py-1.5 text-right">{fmtNum(a.lean_mass_kg, ' kg')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Última avaliação em {formatDateBr(latest.assessed_at)}.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {prs.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="size-4 text-muted-foreground" /> Maiores cargas registradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {prs.map((pr) => (
                <li key={pr.exercise_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{pr.exercise_name}</p>
                    <p className="text-xs text-muted-foreground">{formatDateBr(pr.performed_at)}</p>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <span className="font-semibold">{fmtNum(pr.best_weight_kg, ' kg')}</span>
                    {pr.reps != null ? (
                      <span className="block text-xs text-muted-foreground">× {pr.reps} reps</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
