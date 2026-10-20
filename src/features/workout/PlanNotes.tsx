// Observações do plano e da semana escolhida, na tela que conduz a sessão.
// Elas já iam no detalhe do plano e no PDF, mas quem está treinando não abre
// nenhum dos dois: a orientação geral ("aquecer 10 min antes", "semana de
// deload: reduzir a carga") precisa estar onde as séries são registradas.
// A da semana acompanha o campo Semana: trocar a semana troca a observação.
export function PlanNotes({
  planNotes,
  weekNumber,
  weekLabel,
  weekNotes,
}: {
  planNotes: string | null | undefined
  weekNumber: number | null
  weekLabel?: string | null
  weekNotes?: string | null
}) {
  const plano = planNotes?.trim() || null
  const semana = weekNumber != null ? weekNotes?.trim() || null : null
  if (!plano && !semana) return null
  return (
    <section aria-label="Observações do treino" className="space-y-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
      {plano ? (
        <div>
          <span className="block text-xs text-muted-foreground">Observações do plano</span>
          <p className="whitespace-pre-wrap">{plano}</p>
        </div>
      ) : null}
      {semana ? (
        <div>
          <span className="block text-xs text-muted-foreground">
            Semana {weekNumber}
            {weekLabel?.trim() ? ` · ${weekLabel.trim()}` : ''}
          </span>
          <p className="whitespace-pre-wrap">{semana}</p>
        </div>
      ) : null}
    </section>
  )
}
