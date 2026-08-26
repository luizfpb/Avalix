import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, CloudOff, RefreshCw } from 'lucide-react'
import {
  getHistoryForLink,
  getPlanForLink,
  getWorkoutForLink,
  submitSession,
  type StudentHistorySession,
  type StudentPlanDetail,
  type StudentWorkout,
} from '../features/workout/studentApi'
import {
  buildSets,
  flushQueue,
  isNetworkFailure,
  resolveStudentToken,
  studentScope,
} from '../features/workout/studentSession'
import {
  clearDraftSession,
  enqueueSession,
  forgetStudentDevice,
  readCachedHistory,
  readCachedPlan,
  readCachedWorkout,
  readDraft,
  readQueue,
  requestPersistentStorage,
  writeCachedHistory,
  writeCachedPlan,
  writeCachedWorkout,
  writeDraft,
  type QueuedSession,
} from '../features/workout/studentStore'
import { applyStudentManifest } from '../features/workout/studentPwa'
import { effectivePrescription, overrideFor, overrideIndex } from '../features/workout/effective'
import { SessionSets } from '../features/workout/SessionSets'
import { currentWeek } from '../features/workout/progress'
import type { WorkoutExerciseRow, WorkoutWeekOverrideRow } from '../features/workout/api'
import { BrandMark } from '../components/BrandLogo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { controlClass } from '@/lib/ui'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-6">{children}</div>
    </div>
  )
}

function Aviso({ titulo, texto, acao }: { titulo: string; texto: string; acao?: React.ReactNode }) {
  return (
    <Shell>
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <BrandMark size={40} />
        <h1 className="text-xl font-semibold">{titulo}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{texto}</p>
        {acao}
      </div>
    </Shell>
  )
}

function hoje(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dataBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}` : iso
}

// Captura o token uma vez por carga: o StrictMode monta duas vezes em dev, e a
// segunda leitura já encontraria a URL limpa. Mesmo cuidado da página pública
// da anamnese.
let tokenCapturado: string | null | undefined
function capturarTokenUmaVez(): string | null {
  if (tokenCapturado === undefined) tokenCapturado = resolveStudentToken()
  return tokenCapturado
}

type Aba = 'treino' | 'historico' | 'anteriores'

export default function TreinoAluno() {
  const [token] = useState(capturarTokenUmaVez)
  const [scope, setScope] = useState<string | null>(null)
  const [pacote, setPacote] = useState<StudentWorkout | null>(null)
  const [sincronizadoEm, setSincronizadoEm] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [semRede, setSemRede] = useState(false)
  const [invalido, setInvalido] = useState(false)
  const [fila, setFila] = useState<QueuedSession[]>([])
  const [aba, setAba] = useState<Aba>('treino')

  useEffect(() => {
    if (!token) return
    void studentScope(token).then(setScope)
    void requestPersistentStorage()
  }, [token])

  // manifest próprio enquanto a página do aluno está aberta
  useEffect(() => applyStudentManifest(), [])

  const recarregarFila = useCallback(async () => {
    if (!scope) return
    setFila(await readQueue(scope))
  }, [scope])

  // Cache primeiro, rede depois: dentro da academia a página abre com o treino
  // na tela antes de saber se há internet.
  useEffect(() => {
    if (!token || !scope) return
    let vivo = true

    void (async () => {
      const cache = await readCachedWorkout(scope)
      if (vivo && cache) {
        setPacote(cache.data)
        setSincronizadoEm(cache.at)
        setCarregando(false)
      }
      await recarregarFila()

      try {
        const fresco = await getWorkoutForLink(token)
        if (!vivo) return
        if (!fresco) {
          // O servidor respondeu que o link não vale mais. Aí o cache também
          // não vale: seria mostrar um treino que o profissional revogou.
          setInvalido(true)
          setPacote(null)
        } else {
          setPacote(fresco)
          setSincronizadoEm(new Date().toISOString())
          setSemRede(false)
          await writeCachedWorkout(scope, fresco)
        }
      } catch (error) {
        if (!vivo) return
        if (isNetworkFailure(error)) setSemRede(true)
        else setInvalido(!cache)
      } finally {
        if (vivo) setCarregando(false)
      }
    })()

    return () => {
      vivo = false
    }
  }, [token, scope, recarregarFila])

  // Sobe a fila quando a rede volta e quando o app volta ao primeiro plano.
  const enviando = useRef(false)
  const enviarFila = useCallback(async () => {
    if (!token || !scope || enviando.current) return
    enviando.current = true
    try {
      const r = await flushQueue(token, scope)
      if (r.sent > 0) setSemRede(false)
      await recarregarFila()
    } finally {
      enviando.current = false
    }
  }, [token, scope, recarregarFila])

  useEffect(() => {
    if (!token || !scope) return
    void enviarFila()
    const aoVoltar = () => void enviarFila()
    const aoFocar = () => {
      if (document.visibilityState === 'visible') void enviarFila()
    }
    window.addEventListener('online', aoVoltar)
    document.addEventListener('visibilitychange', aoFocar)
    return () => {
      window.removeEventListener('online', aoVoltar)
      document.removeEventListener('visibilitychange', aoFocar)
    }
  }, [token, scope, enviarFila])

  if (!token) {
    return (
      <Aviso
        titulo="Link inválido ou expirado"
        texto="Peça um link novo ao seu treinador. Se você abriu pelo atalho salvo, abra pelo link original uma vez."
      />
    )
  }

  if (invalido) {
    return (
      <Aviso
        titulo="Link inválido ou expirado"
        texto="Este link não vale mais. Peça um novo ao seu treinador."
      />
    )
  }

  if (carregando || !scope) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Carregando seu treino...</p>
      </Shell>
    )
  }

  if (!pacote) {
    return (
      <Aviso
        titulo="Não foi possível abrir o treino"
        texto="Confira sua conexão e tente de novo."
        acao={
          <Button variant="outline" onClick={() => window.location.reload()}>
            Tentar de novo
          </Button>
        }
      />
    )
  }

  return (
    <Shell>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{pacote.org_name}</p>
          <h1 className="text-xl font-semibold">Olá, {pacote.subject_first_name}</h1>
        </div>
        <BrandMark size={28} />
      </header>

      <StatusBar
        semRede={semRede}
        sincronizadoEm={sincronizadoEm}
        fila={fila}
        onEnviar={() => void enviarFila()}
      />

      <nav className="mb-4 flex gap-1 rounded-lg bg-muted p-1" aria-label="Seções">
        {(
          [
            ['treino', 'Treino'],
            ['historico', 'Histórico'],
            ['anteriores', 'Anteriores'],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            aria-current={aba === id ? 'page' : undefined}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm transition ${
              aba === id ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </nav>

      {aba === 'treino' ? (
        pacote.plan ? (
          <TreinoDoDia
            token={token}
            scope={scope}
            pacote={pacote}
            onFilaMudou={recarregarFila}
            onSemRede={() => setSemRede(true)}
          />
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Seu treinador ainda não publicou um treino para você. Assim que publicar, ele aparece
              aqui.
            </CardContent>
          </Card>
        )
      ) : null}

      {aba === 'historico' ? <Historico token={token} scope={scope} /> : null}

      {aba === 'anteriores' ? <Anteriores token={token} scope={scope} pacote={pacote} /> : null}

      <footer className="mt-8 border-t pt-4 text-center">
        <p className="text-[11px] text-muted-foreground">
          O que você registrar aqui fica visível para o profissional responsável pelo seu treino.
        </p>
        <button
          type="button"
          className="mt-2 text-[11px] text-muted-foreground underline"
          onClick={() => {
            void forgetStudentDevice().then(() => window.location.replace('/t'))
          }}
        >
          Sair deste aparelho
        </button>
      </footer>
    </Shell>
  )
}

function StatusBar({
  semRede,
  sincronizadoEm,
  fila,
  onEnviar,
}: {
  semRede: boolean
  sincronizadoEm: string | null
  fila: QueuedSession[]
  onEnviar: () => void
}) {
  if (fila.length === 0 && !semRede) {
    return sincronizadoEm ? (
      <p className="mb-3 text-[11px] text-muted-foreground">
        Atualizado em {new Date(sincronizadoEm).toLocaleString('pt-BR')}
      </p>
    ) : null
  }

  return (
    <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
      <CloudOff className="size-4 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        {fila.length > 0 ? (
          <p>
            {fila.length === 1
              ? '1 treino salvo no aparelho, aguardando internet.'
              : `${fila.length} treinos salvos no aparelho, aguardando internet.`}
          </p>
        ) : (
          <p>Sem internet. Você pode treinar e registrar normalmente.</p>
        )}
        {sincronizadoEm ? (
          <p className="opacity-80">
            Treino atualizado em {new Date(sincronizadoEm).toLocaleString('pt-BR')}
          </p>
        ) : null}
      </div>
      {fila.length > 0 ? (
        <Button size="xs" variant="outline" onClick={onEnviar}>
          <RefreshCw /> Enviar
        </Button>
      ) : null}
    </div>
  )
}

type Linha = { weight: string; reps: string; rir: string }

function TreinoDoDia({
  token,
  scope,
  pacote,
  onFilaMudou,
  onSemRede,
}: {
  token: string
  scope: string
  pacote: StudentWorkout
  onFilaMudou: () => Promise<void>
  onSemRede: () => void
}) {
  const plano = pacote.plan!
  const dias = useMemo(
    () => pacote.days.slice().sort((a, b) => a.position - b.position),
    [pacote.days]
  )
  const semanaSugerida = currentWeek(plano.weeks, plano.starts_on, new Date())

  const [dayId, setDayId] = useState(dias[0]?.id ?? '')
  const [semana, setSemana] = useState<number | null>(semanaSugerida)
  const [data, setData] = useState(hoje())
  const [notas, setNotas] = useState('')
  const [linhas, setLinhas] = useState<Record<string, Linha[]>>({})
  const [clientRef, setClientRef] = useState<string>(() => crypto.randomUUID())
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<'enviado' | 'guardado' | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [rascunhoLido, setRascunhoLido] = useState(false)

  const exerciciosDoDia = useMemo(
    () =>
      pacote.exercises
        .filter((e) => e.day_id === dayId)
        .slice()
        .sort((a, b) => a.position - b.position),
    [pacote.exercises, dayId]
  )

  const indice = useMemo(
    () => overrideIndex(pacote.overrides as unknown as WorkoutWeekOverrideRow[]),
    [pacote.overrides]
  )

  const ultimaPorExercicio = useMemo(
    () => new Map(pacote.last_sets.map((s) => [s.exercise_id, s])),
    [pacote.last_sets]
  )

  // Rascunho: fechar a aba no meio do treino não pode custar o que já foi
  // marcado. Lido uma vez, e só se for do mesmo dia.
  useEffect(() => {
    let vivo = true
    void (async () => {
      const rascunho = await readDraft(scope)
      if (!vivo) return
      if (rascunho && rascunho.performedAt === hoje()) {
        if (rascunho.dayId) setDayId(rascunho.dayId)
        setSemana(rascunho.weekNumber)
        setNotas(rascunho.notes)
        setLinhas(rascunho.rows)
        setClientRef(rascunho.clientRef)
      }
      setRascunhoLido(true)
    })()
    return () => {
      vivo = false
    }
  }, [scope])

  // Garante uma linha por série prescrita ao trocar de divisão/semana.
  useEffect(() => {
    if (!rascunhoLido) return
    setLinhas((anterior) => {
      const proximo = { ...anterior }
      for (const ex of exerciciosDoDia) {
        if (proximo[ex.id]) continue
        const efetiva = effectivePrescription(
          ex as unknown as WorkoutExerciseRow,
          overrideFor(indice, semana, ex.id)
        )
        proximo[ex.id] = Array.from({ length: Math.min(efetiva.sets, 12) }, () => ({
          weight: '',
          reps: '',
          rir: '',
        }))
      }
      return proximo
    })
  }, [exerciciosDoDia, indice, semana, rascunhoLido])

  // Autosave do rascunho.
  useEffect(() => {
    if (!rascunhoLido) return
    const id = setTimeout(() => {
      void writeDraft(scope, {
        clientRef,
        planId: plano.id,
        dayId,
        weekNumber: semana,
        performedAt: data,
        notes: notas,
        rows: linhas,
      })
    }, 500)
    return () => clearTimeout(id)
  }, [scope, clientRef, plano.id, dayId, semana, data, notas, linhas, rascunhoLido])

  function setCelula(exId: string, i: number, campo: keyof Linha, valor: string) {
    setLinhas((anterior) => {
      const rows = (anterior[exId] ?? []).slice()
      rows[i] = { ...rows[i], [campo]: valor }
      return { ...anterior, [exId]: rows }
    })
  }

  function addLinha(exId: string) {
    setLinhas((anterior) => ({
      ...anterior,
      [exId]: [...(anterior[exId] ?? []), { weight: '', reps: '', rir: '' }],
    }))
  }

  const dia = dias.find((d) => d.id === dayId)

  async function salvar() {
    setErro(null)
    setOk(null)
    const sets = buildSets(linhas, exerciciosDoDia)
    if (sets.length === 0) {
      setErro('Marque ao menos uma série com carga ou repetições.')
      return
    }

    const sessao: QueuedSession = {
      clientRef,
      planId: plano.id,
      dayLabel: dia?.label ?? null,
      weekNumber: semana,
      performedAt: data,
      notes: notas.trim() || null,
      sets,
      queuedAt: new Date().toISOString(),
    }

    setSalvando(true)
    try {
      await submitSession({
        token,
        clientRef: sessao.clientRef,
        planId: sessao.planId,
        dayLabel: sessao.dayLabel,
        weekNumber: sessao.weekNumber,
        performedAt: sessao.performedAt,
        notes: sessao.notes,
        sets,
      })
      setOk('enviado')
      await clearDraftSession(scope)
      reiniciar()
    } catch (error) {
      if (isNetworkFailure(error)) {
        // sem rede: guarda e sobe depois. O client_ref garante que subir duas
        // vezes não vira duas sessões.
        await enqueueSession(scope, sessao)
        await onFilaMudou()
        onSemRede()
        setOk('guardado')
        await clearDraftSession(scope)
        reiniciar()
      } else {
        setErro(
          error && typeof error === 'object' && 'message' in error
            ? String((error as { message?: unknown }).message ?? '')
            : 'Não foi possível registrar o treino.'
        )
      }
    } finally {
      setSalvando(false)
    }
  }

  function reiniciar() {
    setClientRef(crypto.randomUUID())
    setNotas('')
    setLinhas({})
  }

  if (dias.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Este treino ainda não tem divisões.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-sm font-medium">{plano.name}</p>
        <div className="flex flex-wrap gap-1.5">
          {dias.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDayId(d.id)}
              aria-pressed={dayId === d.id}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                dayId === d.id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background'
              }`}
            >
              {d.label}
              {d.name ? <span className="ml-1 opacity-80">{d.name}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="aluno-data" className="text-xs">
            Data
          </Label>
          <Input
            id="aluno-data"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="aluno-semana" className="text-xs">
            Semana
          </Label>
          <select
            id="aluno-semana"
            className={controlClass}
            value={semana ?? ''}
            onChange={(e) => setSemana(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">—</option>
            {Array.from({ length: plano.weeks }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                Semana {n}
                {pacote.weeks.find((w) => w.week_number === n)?.is_deload ? ' (deload)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {exerciciosDoDia.map((ex) => {
          const override = overrideFor(indice, semana, ex.id)
          const efetiva = effectivePrescription(ex as unknown as WorkoutExerciseRow, override)
          const ultima = ultimaPorExercicio.get(ex.exercise_id)
          return (
            <div key={ex.id} className="rounded-md border bg-muted/20 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">{ex.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {efetiva.sets}×{efetiva.reps}
                  {efetiva.rir != null ? ` · RIR ${efetiva.rir}` : ''}
                </span>
              </div>
              {efetiva.restSeconds != null || ex.tempo ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {efetiva.restSeconds != null ? `descanso ${efetiva.restSeconds}s` : ''}
                  {efetiva.restSeconds != null && ex.tempo ? ' · ' : ''}
                  {ex.tempo ? `cadência ${ex.tempo}` : ''}
                </p>
              ) : null}
              {efetiva.notes ? (
                <p className="mt-1 text-[11px] text-muted-foreground">{efetiva.notes}</p>
              ) : null}

              {efetiva.skipped ? (
                <p className="mt-2 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                  Nesta semana, não executar.
                </p>
              ) : (
                <>
                  {ultima ? (
                    <p className="mt-1 text-[11px] text-primary">
                      última vez: {ultima.weight_kg ?? '—'} kg × {ultima.reps ?? '—'}
                      {ultima.rir != null ? ` (RIR ${ultima.rir})` : ''} em{' '}
                      {dataBr(ultima.performed_at)}
                    </p>
                  ) : null}

                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
                      <span className="w-6" />
                      <span className="w-20 text-center">carga (kg)</span>
                      <span className="w-16 text-center">reps</span>
                      <span className="w-14 text-center">RIR</span>
                    </div>
                    {(linhas[ex.id] ?? []).map((row, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-6 text-center text-xs text-muted-foreground">
                          {i + 1}
                        </span>
                        <Input
                          aria-label={`Carga da série ${i + 1} de ${ex.name}`}
                          className="h-9 w-20"
                          type="number"
                          inputMode="decimal"
                          placeholder="kg"
                          value={row.weight}
                          onChange={(e) => setCelula(ex.id, i, 'weight', e.target.value)}
                        />
                        <Input
                          aria-label={`Repetições da série ${i + 1} de ${ex.name}`}
                          className="h-9 w-16"
                          type="number"
                          inputMode="numeric"
                          placeholder={efetiva.reps}
                          value={row.reps}
                          onChange={(e) => setCelula(ex.id, i, 'reps', e.target.value)}
                        />
                        <Input
                          aria-label={`RIR da série ${i + 1} de ${ex.name}`}
                          className="h-9 w-14"
                          type="number"
                          inputMode="numeric"
                          placeholder={efetiva.rir != null ? String(efetiva.rir) : '—'}
                          value={row.rir}
                          onChange={(e) => setCelula(ex.id, i, 'rir', e.target.value)}
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      className="px-1 text-xs text-muted-foreground underline"
                      onClick={() => addLinha(ex.id)}
                    >
                      + série
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="aluno-notas" className="text-xs">
          Como foi o treino? (opcional)
        </Label>
        <textarea
          id="aluno-notas"
          className={`${controlClass} min-h-16`}
          maxLength={600}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Dor, cansaço, algo que mudou..."
        />
      </div>

      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}

      {ok ? (
        <p className="flex items-center gap-1.5 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {ok === 'enviado'
            ? 'Treino registrado! Seu treinador já consegue ver.'
            : 'Treino salvo no aparelho. Vai subir sozinho quando houver internet.'}
        </p>
      ) : null}

      <Button className="w-full" onClick={() => void salvar()} disabled={salvando}>
        {salvando ? 'Salvando...' : 'Salvar treino'}
      </Button>
    </div>
  )
}

function Historico({ token, scope }: { token: string; scope: string }) {
  const [sessoes, setSessoes] = useState<StudentHistorySession[] | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    let vivo = true
    void (async () => {
      const cache = await readCachedHistory(scope)
      if (vivo && cache) {
        setSessoes(cache)
        setCarregando(false)
      }
      try {
        const fresco = await getHistoryForLink(token, { limit: 30 })
        if (!vivo) return
        setSessoes(fresco)
        await writeCachedHistory(scope, fresco)
        setOffline(false)
      } catch {
        if (vivo) setOffline(true)
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [token, scope])

  if (carregando) return <p className="text-sm text-muted-foreground">Carregando...</p>

  if (!sessoes || sessoes.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {offline
            ? 'Sem internet e sem histórico salvo neste aparelho.'
            : 'Nenhum treino registrado ainda. O primeiro aparece aqui.'}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {offline ? (
        <p className="text-[11px] text-muted-foreground">
          Sem internet: mostrando o que estava salvo no aparelho.
        </p>
      ) : null}
      {sessoes.map((s) => (
        <div key={s.id} className="rounded-md border p-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">
              {s.day_label ? `Treino ${s.day_label}` : 'Treino'} · {dataBr(s.performed_at)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {s.source === 'trainer' ? 'registrado pelo treinador' : null}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {s.plan_name}
            {s.week_number != null ? ` · semana ${s.week_number}` : ''}
          </p>
          <div className="mt-1.5">
            <SessionSets
              sets={s.sets.map((x) => ({
                exerciseName: x.exercise_name,
                setNumber: x.set_number,
                weightKg: x.weight_kg,
                reps: x.reps,
                rir: x.rir,
              }))}
            />
          </div>
          {s.notes ? <p className="mt-1 text-[11px] italic text-muted-foreground">{s.notes}</p> : null}
        </div>
      ))}
    </div>
  )
}

function Anteriores({
  token,
  scope,
  pacote,
}: {
  token: string
  scope: string
  pacote: StudentWorkout
}) {
  const [aberto, setAberto] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<StudentPlanDetail | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function abrir(planId: string) {
    if (aberto === planId) {
      setAberto(null)
      return
    }
    setAberto(planId)
    setDetalhe(null)
    setErro(null)
    setCarregando(true)
    const cache = await readCachedPlan(scope, planId)
    if (cache) setDetalhe(cache)
    try {
      const fresco = await getPlanForLink(token, planId)
      if (fresco) {
        setDetalhe(fresco)
        await writeCachedPlan(scope, planId, fresco)
      }
    } catch {
      if (!cache) setErro('Sem internet para abrir este treino agora.')
    } finally {
      setCarregando(false)
    }
  }

  if (pacote.history_plans.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Você ainda não tem treinos anteriores.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      {pacote.history_plans.map((p) => (
        <div key={p.id} className="rounded-md border">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 p-2.5 text-left"
            onClick={() => void abrir(p.id)}
            aria-expanded={aberto === p.id}
          >
            <span>
              <span className="block text-sm font-medium">{p.name}</span>
              <span className="block text-[11px] text-muted-foreground">
                {p.starts_on ? `início ${dataBr(p.starts_on)} · ` : ''}
                {p.weeks} {p.weeks === 1 ? 'semana' : 'semanas'} · {p.sessions}{' '}
                {p.sessions === 1 ? 'treino registrado' : 'treinos registrados'}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">{aberto === p.id ? '−' : '+'}</span>
          </button>

          {aberto === p.id ? (
            <div className="border-t p-2.5">
              {carregando && !detalhe ? (
                <p className="text-xs text-muted-foreground">Carregando...</p>
              ) : erro ? (
                <p className="text-xs text-muted-foreground">{erro}</p>
              ) : detalhe ? (
                <PlanoResumo detalhe={detalhe} />
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function PlanoResumo({ detalhe }: { detalhe: StudentPlanDetail }) {
  const dias = detalhe.days.slice().sort((a, b) => a.position - b.position)
  return (
    <div className="space-y-2.5">
      {dias.map((d) => (
        <div key={d.id}>
          <p className="text-xs font-medium">
            Treino {d.label}
            {d.name ? ` — ${d.name}` : ''}
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {detalhe.exercises
              .filter((e) => e.day_id === d.id)
              .sort((a, b) => a.position - b.position)
              .map((e) => (
                <li key={e.id} className="text-xs text-muted-foreground">
                  {e.name} — {e.sets}×{e.reps}
                  {e.rir != null ? ` · RIR ${e.rir}` : ''}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
