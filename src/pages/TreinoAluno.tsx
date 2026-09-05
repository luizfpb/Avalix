import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, CloudOff, RefreshCw, TriangleAlert, X } from 'lucide-react'
import {
  getHistoryPageForLink,
  getPlanForLink,
  getWorkoutForLink,
  submitSession,
  type StudentExercise,
  type StudentHistoryCursor,
  type StudentHistorySession,
  type StudentPlanDetail,
  type StudentWorkout,
} from '../features/workout/studentApi'
import {
  buildSets,
  flushQueue,
  isInvalidStudentLinkError,
  isNetworkFailure,
  isStudentLinkExpired,
  queuedSessionLabel,
  reconcileSetRows,
  resolveStudentToken,
  studentScope,
  suggestedWorkoutDayId,
  withStudentSyncLock,
} from '../features/workout/studentSession'
import {
  clearDraftSession,
  dequeueSession,
  enqueueSession,
  forgetStudentDevice,
  purgeRevokedStudentDevice,
  readCachedHistory,
  readCachedPlan,
  readCachedWorkout,
  readDraft,
  readQueue,
  removeCachedPlan,
  reserveDraftRevision,
  requestPersistentStorage,
  writeCachedHistory,
  writeCachedPlan,
  writeCachedWorkout,
  writeDraft,
  STUDENT_TOKEN_KEY,
  type QueuedSession,
} from '../features/workout/studentStore'
import { identidadeDaSessao, reconciliarRascunho } from '../features/workout/studentDraft'
import { applyStudentManifest } from '../features/workout/studentPwa'
import {
  effectivePrescription,
  formatSetsReps,
  overrideFor,
  overrideIndex,
} from '../features/workout/effective'
import { GroupBlock } from '../features/workout/GroupBlock'
import { groupLabel, techniqueLabel, toRowBlocks } from '../features/workout/groups'
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

function errorMessage(error: unknown, fallback: string): string {
  return error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message ?? fallback)
    : fallback
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
  const [erroLimpeza, setErroLimpeza] = useState(false)
  const [fila, setFila] = useState<QueuedSession[]>([])
  const [erroFila, setErroFila] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('treino')
  const accessEpoch = useRef(0)

  const invalidarAcesso = useCallback(async (limpar = true) => {
    const epoch = ++accessEpoch.current
    setPacote(null)
    setFila([])
    setInvalido(true)
    if (!limpar) return
    try {
      await purgeRevokedStudentDevice()
      if (epoch === accessEpoch.current) setErroLimpeza(false)
    } catch {
      if (epoch === accessEpoch.current) setErroLimpeza(true)
    }
  }, [])

  useEffect(() => {
    if (!token) return
    void studentScope(token).then(setScope)
    void requestPersistentStorage()
  }, [token])

  // manifest próprio enquanto a página do aluno está aberta
  useEffect(() => applyStudentManifest(), [])

  const recarregarFila = useCallback(async (expectedEpoch = accessEpoch.current) => {
    if (!scope) return
    try {
      const next = await readQueue(scope)
      if (expectedEpoch !== accessEpoch.current) return
      setFila(next)
      setErroFila(null)
    } catch (error) {
      if (expectedEpoch !== accessEpoch.current) return
      setErroFila(errorMessage(error, 'Não foi possível ler os treinos salvos neste aparelho.'))
    }
  }, [scope])

  // Cache primeiro, rede depois: dentro da academia a página abre com o treino
  // na tela antes de saber se há internet.
  useEffect(() => {
    if (!token || !scope) return
    let vivo = true
    const epoch = accessEpoch.current

    void (async () => {
      const cache = await readCachedWorkout(scope)
      if (!vivo || epoch !== accessEpoch.current) return
      const cacheLegado = cache && !cache.data.link_expires_at
      if (cache && isStudentLinkExpired(cache.data.link_expires_at)) {
        await invalidarAcesso()
        if (vivo) setCarregando(false)
        return
      }
      if (vivo && cache && !cacheLegado) {
        setPacote(cache.data)
        setSincronizadoEm(cache.at)
        setCarregando(false)
      }
      await recarregarFila(epoch)

      try {
        const fresco = await getWorkoutForLink(token)
        if (!vivo || epoch !== accessEpoch.current) return
        if (!fresco) {
          // O servidor respondeu que o link não vale mais. Aí o cache também
          // não vale: seria mostrar um treino que o profissional revogou.
          await invalidarAcesso()
        } else if (isStudentLinkExpired(fresco.link_expires_at)) {
          await invalidarAcesso()
        } else {
          await writeCachedWorkout(scope, fresco)
          if (!vivo || epoch !== accessEpoch.current) {
            await purgeRevokedStudentDevice()
            return
          }
          setInvalido(false)
          setErroLimpeza(false)
          setPacote(fresco)
          setSincronizadoEm(new Date().toISOString())
          setSemRede(false)
        }
      } catch (error) {
        if (!vivo || epoch !== accessEpoch.current) return
        if (isNetworkFailure(error)) setSemRede(true)
        else if (isInvalidStudentLinkError(error)) await invalidarAcesso()
        else setInvalido(!cache || Boolean(cacheLegado))
      } finally {
        if (vivo && epoch === accessEpoch.current) setCarregando(false)
      }
    })()

    return () => {
      vivo = false
    }
  }, [token, scope, recarregarFila, invalidarAcesso])

  // Sobe a fila quando a rede volta e quando o app volta ao primeiro plano.
  const enviando = useRef(false)
  const enviarFila = useCallback(async () => {
    if (!token || !scope || enviando.current) return
    enviando.current = true
    try {
      const r = await withStudentSyncLock(scope, () => flushQueue(token, scope))
      if (r.sent > 0) setSemRede(false)
      await recarregarFila()
    } catch (error) {
      if (isInvalidStudentLinkError(error)) await invalidarAcesso()
      else setErroFila(errorMessage(error, 'Não foi possível sincronizar os treinos salvos.'))
    } finally {
      enviando.current = false
    }
  }, [token, scope, recarregarFila, invalidarAcesso])

  // Expiração local, retorno ao primeiro plano e outras abas convergem para a
  // mesma invalidação. A revalidação online também detecta revogação antecipada.
  const revalidando = useRef(false)
  const revalidarAcesso = useCallback(async () => {
    if (!token || !scope || invalido || revalidando.current) return
    if (pacote && isStudentLinkExpired(pacote.link_expires_at)) {
      await invalidarAcesso()
      return
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    revalidando.current = true
    const epoch = accessEpoch.current
    try {
      const fresco = await getWorkoutForLink(token)
      if (epoch !== accessEpoch.current) return
      if (!fresco || isStudentLinkExpired(fresco.link_expires_at)) {
        await invalidarAcesso()
        return
      }
      await writeCachedWorkout(scope, fresco)
      if (epoch !== accessEpoch.current) {
        await purgeRevokedStudentDevice()
        return
      }
      setPacote(fresco)
      setSincronizadoEm(new Date().toISOString())
      setSemRede(false)
    } catch (error) {
      if (isInvalidStudentLinkError(error)) await invalidarAcesso()
    } finally {
      revalidando.current = false
    }
  }, [invalido, invalidarAcesso, pacote, scope, token])

  useEffect(() => {
    if (!pacote?.link_expires_at || invalido) return
    let timer: number | undefined
    const schedule = () => {
      const remaining = Date.parse(pacote.link_expires_at) - Date.now()
      if (remaining <= 0) {
        void invalidarAcesso()
        return
      }
      timer = window.setTimeout(schedule, Math.min(remaining, 2_000_000_000))
    }
    schedule()
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [invalido, invalidarAcesso, pacote?.link_expires_at])

  useEffect(() => {
    if (!token || !scope) return
    const aoVoltar = () => void revalidarAcesso()
    const aoFocar = () => {
      if (document.visibilityState === 'visible') void revalidarAcesso()
    }
    const outraAba = (event: StorageEvent) => {
      if (event.key === STUDENT_TOKEN_KEY && event.newValue !== token) {
        void invalidarAcesso(false)
      }
    }
    window.addEventListener('online', aoVoltar)
    document.addEventListener('visibilitychange', aoFocar)
    window.addEventListener('storage', outraAba)
    return () => {
      window.removeEventListener('online', aoVoltar)
      document.removeEventListener('visibilitychange', aoFocar)
      window.removeEventListener('storage', outraAba)
    }
  }, [invalidarAcesso, revalidarAcesso, scope, token])

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
        texto={
          erroLimpeza
            ? 'Este link não vale mais. Não foi possível apagar o treino salvo neste aparelho; libere o armazenamento e tente limpar novamente.'
            : 'Este link não vale mais. Peça um novo ao seu treinador.'
        }
        acao={
          erroLimpeza ? (
            <Button
              variant="outline"
              onClick={() => {
                void purgeRevokedStudentDevice()
                  .then(() => window.location.replace('/t'))
                  .catch(() => setErroLimpeza(true))
              }}
            >
              Limpar dados deste aparelho
            </Button>
          ) : undefined
        }
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
        erro={erroFila}
        onEnviar={() => void enviarFila()}
        onDescartar={(clientRef) => {
          if (!scope) return
          void dequeueSession(scope, clientRef).then(() => recarregarFila()).catch((error) => {
            setErroFila(errorMessage(error, 'Não foi possível remover este aviso.'))
          })
        }}
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
            key={`${pacote.plan.id}:${pacote.days.map((day) => day.id).join(',')}`}
            token={token}
            scope={scope}
            pacote={pacote}
            onFilaMudou={recarregarFila}
            onSemRede={() => setSemRede(true)}
            onLinkInvalid={invalidarAcesso}
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

      {aba === 'historico' ? (
        <Historico token={token} scope={scope} onLinkInvalid={invalidarAcesso} />
      ) : null}

      {aba === 'anteriores' ? (
        <Anteriores
          token={token}
          scope={scope}
          pacote={pacote}
          onLinkInvalid={invalidarAcesso}
        />
      ) : null}

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

// RIR e cadência são abreviações de quem prescreve, não de quem treina. Elas
// aparecem na ficha do aluno desde sempre; quem está começando lia "RIR 2" sem
// nenhuma pista do que fazer com aquilo. A explicação é curta, fica recolhida e
// SÓ aparece quando a prescrição do dia realmente usa o termo — glossário que
// aparece sem ter o que explicar vira ruído e ensina a fechar sem ler.
function GlossarioDoDia({
  exercicios,
  indice,
  semana,
}: {
  exercicios: StudentExercise[]
  indice: ReturnType<typeof overrideIndex>
  semana: number | null
}) {
  const temRir = exercicios.some(
    (ex) =>
      effectivePrescription(ex as unknown as WorkoutExerciseRow, overrideFor(indice, semana, ex.id))
        .rir != null
  )
  const temCadencia = exercicios.some((ex) => !!ex.tempo)
  if (!temRir && !temCadencia) return null

  return (
    <details className="rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer">
        O que significa {temRir ? 'RIR' : ''}
        {temRir && temCadencia ? ' e cadência' : temCadencia ? 'cadência' : ''}?
      </summary>
      <div className="mt-2 space-y-1.5">
        {temRir ? (
          <p>
            <strong>RIR</strong> é quantas repetições você ainda conseguiria fazer ao parar a
            série. RIR 2 significa terminar sentindo que daria para fazer mais duas — não é para
            ir até não conseguir mais. RIR 0 é o limite.
          </p>
        ) : null}
        {temCadencia ? (
          <p>
            <strong>Cadência</strong> é o ritmo do movimento em segundos, na ordem descida ·
            pausa · subida · pausa. Em "3010": desce em 3 segundos, sobe em 1, sem pausas.
          </p>
        ) : null}
      </div>
    </details>
  )
}

function StatusBar({
  semRede,
  sincronizadoEm,
  fila,
  erro,
  onEnviar,
  onDescartar,
}: {
  semRede: boolean
  sincronizadoEm: string | null
  fila: QueuedSession[]
  erro: string | null
  onEnviar: () => void
  onDescartar: (clientRef: string) => void
}) {
  const pendentes = fila.filter((item) => !item.error)
  const rejeitados = fila.filter((item) => item.error)

  if (fila.length === 0 && !semRede && !erro) {
    return sincronizadoEm ? (
      <p className="mb-3 text-[11px] text-muted-foreground">
        Atualizado em {new Date(sincronizadoEm).toLocaleString('pt-BR')}
      </p>
    ) : null
  }

  return (
    <div className="mb-3 space-y-2" aria-live="polite">
      {pendentes.length > 0 || semRede ? (
        <div className="flex items-center gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
          <CloudOff className="size-4 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            {pendentes.length > 0 ? (
              <p>
                {pendentes.length === 1
                  ? '1 treino salvo no aparelho, aguardando internet.'
                  : `${pendentes.length} treinos salvos no aparelho, aguardando internet.`}
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
          {pendentes.length > 0 ? (
            <Button size="xs" variant="outline" onClick={onEnviar}>
              <RefreshCw /> Enviar
            </Button>
          ) : null}
        </div>
      ) : null}

      {erro ? (
        <div role="alert" className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          <p>{erro}</p>
        </div>
      ) : null}

      {rejeitados.map((item) => (
        <div
          key={item.clientRef}
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{queuedSessionLabel(item)} não foi enviado.</p>
            <p className="mt-0.5 break-words opacity-90">{item.error}</p>
          </div>
          <button
            type="button"
            onClick={() => onDescartar(item.clientRef)}
            aria-label={`Descartar aviso de ${queuedSessionLabel(item)}`}
            className="rounded p-1 hover:bg-destructive/10"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}
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
  onLinkInvalid,
}: {
  token: string
  scope: string
  pacote: StudentWorkout
  onFilaMudou: () => Promise<void>
  onSemRede: () => void
  onLinkInvalid: () => Promise<void>
}) {
  const plano = pacote.plan!
  const dias = useMemo(
    () => pacote.days.slice().sort((a, b) => a.position - b.position),
    [pacote.days]
  )
  const semanaSugerida = currentWeek(plano.weeks, plano.starts_on, new Date())
  const divisaoSugerida = suggestedWorkoutDayId(
    plano.weekly_schedule,
    dias,
    pacote.current_plan_sessions
  )

  const [dayId, setDayId] = useState(divisaoSugerida)
  const [semana, setSemana] = useState<number | null>(semanaSugerida)
  const [data, setData] = useState(hoje())
  const [notas, setNotas] = useState('')
  const [linhas, setLinhas] = useState<Record<string, Linha[]>>({})
  // Exercícios de outra divisão do plano feitos nesta sessão: equipamento
  // ocupado, dor no dia, troca combinada na hora. Guardamos o id do exercício
  // DO PLANO — é a mesma chave de `linhas` e o buildSets já sabe traduzir para
  // o exercício do catálogo.
  const [extras, setExtras] = useState<string[]>([])
  const [escolhaExtra, setEscolhaExtra] = useState('')
  const [clientRef, setClientRef] = useState<string>(() => crypto.randomUUID())
  const [revision, setRevision] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<'progresso' | 'concluir' | null>(null)
  const [rascunhoLido, setRascunhoLido] = useState(false)
  // aviso de "o plano foi regravado e o rascunho foi remapeado"
  const [planoMudou, setPlanoMudou] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [switchingSession, setSwitchingSession] = useState(false)
  const [resetEpoch, setResetEpoch] = useState(0)
  const draftReadKey = useRef<string | null>(null)
  const switchGeneration = useRef(0)
  const localConclusions = useRef(0)

  const exerciciosDoDia = useMemo(
    () =>
      pacote.exercises
        .filter((e) => e.day_id === dayId)
        .slice()
        .sort((a, b) => a.position - b.position),
    [pacote.exercises, dayId]
  )

  // Um plano editado pode ter perdido o exercício que estava no rascunho; o
  // filter é o que impede a tela de quebrar nesse caso.
  const exerciciosExtras = useMemo(
    () =>
      extras
        .map((id) => pacote.exercises.find((e) => e.id === id))
        .filter((e): e is StudentExercise => e != null),
    [extras, pacote.exercises]
  )

  // Só exercícios de OUTRAS divisões, e nenhum movimento repetido na sessão: o
  // mesmo exercício duas vezes faria as duas grades numerarem a série 1 e o
  // servidor recusaria o envio inteiro por série repetida.
  const opcoesExtras = useMemo(() => {
    const usados = new Set([
      ...exerciciosDoDia.map((e) => e.exercise_id),
      ...exerciciosExtras.map((e) => e.exercise_id),
    ])
    return pacote.exercises
      .filter((e) => e.day_id !== dayId && !usados.has(e.exercise_id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [pacote.exercises, dayId, exerciciosDoDia, exerciciosExtras])

  const indice = useMemo(
    () => overrideIndex(pacote.overrides as unknown as WorkoutWeekOverrideRow[]),
    [pacote.overrides]
  )

  const ultimaPorExercicio = useMemo(
    () => new Map(pacote.last_sets.map((s) => [s.exercise_id, s])),
    [pacote.last_sets]
  )

  // Rascunho: fechar a aba no meio do treino não pode custar o que já foi
  // marcado. Lido uma vez, e reconciliado com a prescrição vigente — o
  // treinador pode ter regravado o plano (o que troca TODOS os ids filhos)
  // enquanto o aluno treinava. Ver features/workout/studentDraft.ts.
  useEffect(() => {
    const planDraftKey = `${scope}:${plano.id}`
    if (draftReadKey.current === planDraftKey) return
    draftReadKey.current = planDraftKey
    let vivo = true
    void (async () => {
      const rascunho = await readDraft(scope, plano.id)
      if (!vivo) return
      const ageInDays = rascunho
        ? Math.floor((Date.parse(`${hoje()}T00:00:00`) - Date.parse(`${rascunho.performedAt}T00:00:00`)) / 86_400_000)
        : -1
      const conciliado =
        rascunho && ageInDays >= 0 && ageInDays <= 7
          ? reconciliarRascunho(rascunho, { days: dias, exercises: pacote.exercises })
          : null
      if (conciliado) {
        const d = conciliado.draft
        if (d.dayId) setDayId(d.dayId)
        setSemana(d.weekNumber)
        setData(d.performedAt)
        setNotas(d.notes)
        setLinhas(d.rows)
        setExtras(d.extras ?? [])
        setClientRef(d.clientRef)
        setRevision(d.revision ?? 0)
        setDirty(true)
        // O aviso só aparece quando houve remapeamento de verdade: dizer "o
        // treino mudou" a cada abertura ensinaria a ignorar o recado.
        if (conciliado.remapeado || conciliado.perdidas > 0) {
          setPlanoMudou(
            conciliado.perdidas > 0
              ? `Seu treinador atualizou este treino. O que você já tinha marcado foi mantido, menos ${conciliado.perdidas === 1 ? '1 série de um exercício que saiu' : `${conciliado.perdidas} séries de exercícios que saíram`} do plano.`
              : 'Seu treinador atualizou este treino. O que você já tinha marcado foi mantido.'
          )
        }
      }
      setRascunhoLido(true)
    })()
    return () => {
      vivo = false
    }
  }, [dias, pacote.exercises, plano.id, scope])

  // Garante uma linha por série prescrita ao trocar de divisão/semana.
  useEffect(() => {
    if (!rascunhoLido) return
    setLinhas((anterior) => {
      const proximo = { ...anterior }
      for (const ex of exerciciosDoDia) {
        const efetiva = effectivePrescription(
          ex as unknown as WorkoutExerciseRow,
          overrideFor(indice, semana, ex.id)
        )
        proximo[ex.id] = reconcileSetRows(proximo[ex.id] ?? [], efetiva.sets)
      }
      // O avulso usa as séries prescritas na divisão de origem como ponto de
      // partida; override de semana não se aplica, porque ele não está sendo
      // feito no dia para o qual foi prescrito.
      for (const ex of exerciciosExtras) {
        proximo[ex.id] = reconcileSetRows(proximo[ex.id] ?? [], ex.sets)
      }
      return proximo
    })
  }, [exerciciosDoDia, exerciciosExtras, indice, semana, rascunhoLido, resetEpoch])

  // Autosave do rascunho. Grava exatamente o mesmo objeto do caminho explícito
  // (`draftAtual`): montar o payload à mão aqui já custou os `extras` — quem
  // adicionava um exercício avulso e fechava a aba antes de "Salvar progresso"
  // perdia a escolha na retomada, porque o campo simplesmente não era gravado.
  const draftRef = useRef(draftAtual)
  draftRef.current = draftAtual
  useEffect(() => {
    if (!rascunhoLido || !dirty) return
    const id = setTimeout(() => {
      void writeDraft(scope, draftRef.current())
    }, 500)
    return () => clearTimeout(id)
  }, [scope, clientRef, revision, plano.id, dayId, semana, data, notas, linhas, extras, rascunhoLido, dirty])

  // Descarga ao desmontar: o pacote novo que chega do servidor remonta esta
  // tela (a `key` acompanha os ids das divisões), e o debounce de 500 ms acima
  // podia ser cancelado antes de gravar. Sem isto, a reconciliação do rascunho
  // não teria o que reconciliar. `dirty` é o guarda: sessão concluída zera o
  // sinalizador em `reiniciar()`, então nada é ressuscitado.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    return () => {
      if (dirtyRef.current) void writeDraft(scope, draftRef.current())
    }
  }, [scope])

  function setCelula(exId: string, i: number, campo: keyof Linha, valor: string) {
    setDirty(true)
    setLinhas((anterior) => {
      const rows = (anterior[exId] ?? []).slice()
      rows[i] = { ...rows[i], [campo]: valor }
      return { ...anterior, [exId]: rows }
    })
  }

  function addLinha(exId: string) {
    setDirty(true)
    setLinhas((anterior) => ({
      ...anterior,
      [exId]: [...(anterior[exId] ?? []), { weight: '', reps: '', rir: '' }],
    }))
  }

  function adicionarExtra(exId: string) {
    if (!exId) return
    setDirty(true)
    setExtras((anterior) => (anterior.includes(exId) ? anterior : [...anterior, exId]))
    setEscolhaExtra('')
  }

  function removerExtra(exId: string) {
    setDirty(true)
    setExtras((anterior) => anterior.filter((id) => id !== exId))
    setLinhas((anterior) => {
      const proximo = { ...anterior }
      delete proximo[exId]
      return proximo
    })
  }

  const dia = dias.find((d) => d.id === dayId)

  function draftAtual(nextRevision = revision) {
    return {
      clientRef,
      revision: nextRevision,
      planId: plano.id,
      dayId,
      weekNumber: semana,
      performedAt: data,
      notes: notas,
      rows: linhas,
      extras,
      // rótulo da divisão + exercício do catálogo de cada linha: é o que
      // permite reencontrar esta sessão depois de o plano ser regravado
      identity: identidadeDaSessao(dias, dayId, linhas, pacote.exercises),
    }
  }

  async function trocarSessao(nextDayId: string, nextDate: string) {
    if (nextDayId === dayId && nextDate === data) return
    const generation = ++switchGeneration.current
    setSwitchingSession(true)
    try {
      if (dirty) await writeDraft(scope, draftAtual())
      const target = await readDraft(scope, plano.id, nextDayId, nextDate)
      if (generation !== switchGeneration.current) return
      setDayId(nextDayId)
      setData(nextDate)
      setSemana(target?.weekNumber ?? semanaSugerida)
      setNotas(target?.notes ?? '')
      setLinhas(target?.rows ?? {})
      setExtras(target?.extras ?? [])
      setEscolhaExtra('')
      setClientRef(target?.clientRef ?? crypto.randomUUID())
      setRevision(target?.revision ?? 0)
      setDirty(Boolean(target))
      setErro(null)
      setOk(null)
      setPlanoMudou(null)
      setResetEpoch((value) => value + 1)
    } finally {
      if (generation === switchGeneration.current) setSwitchingSession(false)
    }
  }

  async function salvar(concluir: boolean) {
    if (switchingSession) return
    setErro(null)
    setOk(null)
    const sets = buildSets(linhas, [...exerciciosDoDia, ...exerciciosExtras])
    if (sets.length === 0) {
      setErro('Marque ao menos uma série com carga ou repetições.')
      return
    }

    setSalvando(concluir ? 'concluir' : 'progresso')
    try {
      // A reserva é uma transação IndexedDB: duas abas nunca recebem a mesma
      // revisão. No progresso ela é obrigatória, pois a mensagem promete que a
      // sessão poderá ser retomada mesmo se a aba fechar logo depois.
      const allocatedRevision = await reserveDraftRevision(
        scope,
        draftAtual(),
        !concluir
      )
      setRevision(allocatedRevision)

      const sessao: QueuedSession = {
        clientRef,
        revision: allocatedRevision,
        planId: plano.id,
        dayLabel: dia?.label ?? null,
        weekNumber: semana,
        performedAt: data,
        notes: notas.trim() || null,
        sets,
        queuedAt: new Date().toISOString(),
      }

      const result = await withStudentSyncLock(scope, async () => {
        let durableOutbox = false
        try {
          await enqueueSession(scope, sessao)
          durableOutbox = true
        } catch {
          // IndexedDB indisponível não impede o uso online. Se a rede também
          // falhar, o bloco abaixo exige a fila antes de confirmar o salvamento.
        }

        try {
          await submitSession({
            token,
            clientRef: sessao.clientRef,
            revision: sessao.revision,
            planId: sessao.planId,
            dayLabel: sessao.dayLabel,
            weekNumber: sessao.weekNumber,
            performedAt: sessao.performedAt,
            notes: sessao.notes,
            sets,
          })
          if (durableOutbox) await dequeueSession(scope, sessao.clientRef, false)
          return { offline: false }
        } catch (error) {
          if (!isNetworkFailure(error)) {
            if (durableOutbox) await dequeueSession(scope, sessao.clientRef, false)
            throw error
          }
          if (!durableOutbox) {
            await enqueueSession(scope, sessao)
            durableOutbox = true
          }
          return { offline: true }
        }
      })

      if (result.offline) {
        await onFilaMudou()
        onSemRede()
        setOk(
          concluir
            ? 'Treino concluído e salvo no aparelho. Vai subir sozinho quando houver internet.'
            : 'Progresso salvo no aparelho. Você pode continuar o treino.'
        )
      } else {
        await onFilaMudou()
        setOk(
          concluir
            ? 'Treino concluído! Seu treinador já consegue ver.'
            : 'Progresso salvo. Você pode continuar o treino.'
        )
      }
      if (concluir) {
        await clearDraftSession(scope, plano.id, dayId, data)
        reiniciar()
      }
    } catch (error) {
      if (isInvalidStudentLinkError(error)) await onLinkInvalid()
      else setErro(errorMessage(error, 'Não foi possível salvar o treino no servidor nem neste aparelho. Mantenha esta tela aberta e tente novamente.'))
    } finally {
      setSalvando(null)
    }
  }

  function reiniciar() {
    localConclusions.current += 1
    const nextDayId = suggestedWorkoutDayId(
      plano.weekly_schedule,
      dias,
      pacote.current_plan_sessions + localConclusions.current
    )
    setDayId(nextDayId)
    setData(hoje())
    setSemana(semanaSugerida)
    setClientRef(crypto.randomUUID())
    setRevision(0)
    setNotas('')
    setLinhas({})
    setExtras([])
    setEscolhaExtra('')
    setDirty(false)
    setPlanoMudou(null)
    setResetEpoch((value) => value + 1)
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
      {planoMudou ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 p-2.5 text-xs"
        >
          <RefreshCw className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="flex-1">{planoMudou}</p>
          <button
            type="button"
            onClick={() => setPlanoMudou(null)}
            className="text-muted-foreground"
            aria-label="Fechar aviso de treino atualizado"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div>
        <p className="mb-1 text-sm font-medium">{plano.name}</p>
        <div className="flex flex-wrap gap-1.5">
          {dias.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => void trocarSessao(d.id, data)}
              disabled={switchingSession || salvando !== null}
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
            disabled={switchingSession || salvando !== null}
            onChange={(e) => void trocarSessao(dayId, e.target.value)}
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
            disabled={switchingSession || salvando !== null}
            onChange={(e) => {
              setDirty(true)
              setSemana(e.target.value ? Number(e.target.value) : null)
            }}
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
        {/* Quem executa o treino é esta tela: se ela listar os exercícios de uma
            super-série soltos, a super-série não acontece. */}
        <GlossarioDoDia exercicios={exerciciosDoDia} indice={indice} semana={semana} />

        {toRowBlocks(exerciciosDoDia).map((block) => {
          const cartoes = block.items.map((ex) => {
          const override = overrideFor(indice, semana, ex.id)
          const efetiva = effectivePrescription(ex as unknown as WorkoutExerciseRow, override)
          const ultima = ultimaPorExercicio.get(ex.exercise_id)
          const tecnica = techniqueLabel(ex.technique)
          return (
            <div key={ex.id} className="rounded-md border bg-muted/20 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">
                  {ex.name}
                  {tecnica ? (
                    <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {tecnica}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatSetsReps(efetiva.sets, efetiva.reps)}
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
                          placeholder={efetiva.reps ?? '—'}
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
          })
          return block.kind == null ? (
            cartoes
          ) : (
            <GroupBlock key={block.key} kind={block.kind} size={block.items.length}>
              {cartoes}
            </GroupBlock>
          )
        })}

        {exerciciosExtras.map((ex) => {
          const ultima = ultimaPorExercicio.get(ex.exercise_id)
          const origem = dias.find((d) => d.id === ex.day_id)
          return (
            <div key={ex.id} className="rounded-md border border-dashed bg-muted/20 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">
                  {ex.name}
                  <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    trocado{origem ? ` · do treino ${origem.label}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removerExtra(ex.id)}
                  className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Tirar ${ex.name} deste treino`}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
              {ultima ? (
                <p className="mt-1 text-[11px] text-primary">
                  última vez: {ultima.weight_kg ?? '—'} kg × {ultima.reps ?? '—'}
                  {ultima.rir != null ? ` (RIR ${ultima.rir})` : ''} em {dataBr(ultima.performed_at)}
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
                    <span className="w-6 text-center text-xs text-muted-foreground">{i + 1}</span>
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
                      placeholder={ex.reps ?? '—'}
                      value={row.reps}
                      onChange={(e) => setCelula(ex.id, i, 'reps', e.target.value)}
                    />
                    <Input
                      aria-label={`RIR da série ${i + 1} de ${ex.name}`}
                      className="h-9 w-14"
                      type="number"
                      inputMode="numeric"
                      placeholder={ex.rir != null ? String(ex.rir) : '—'}
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
            </div>
          )
        })}
      </div>

      {/* Trocar de exercício na hora é rotina de academia: aparelho ocupado,
          dor no dia, fila. Sem esta saída, o que foi feito de verdade ficava
          fora do registro — ou pior, digitado na linha do exercício errado. */}
      {opcoesExtras.length > 0 ? (
        <div className="space-y-1.5 rounded-md border border-dashed p-2.5">
          <Label htmlFor="aluno-extra" className="text-xs">
            Trocou algum exercício?
          </Label>
          <p className="text-[11px] text-muted-foreground">
            Escolha o que você fez no lugar. A lista traz os exercícios das outras divisões do seu
            treino.
          </p>
          <div className="flex gap-2">
            <select
              id="aluno-extra"
              className={controlClass}
              value={escolhaExtra}
              disabled={switchingSession || salvando !== null}
              onChange={(e) => setEscolhaExtra(e.target.value)}
            >
              <option value="">Escolher exercício...</option>
              {opcoesExtras.map((e) => {
                const origem = dias.find((d) => d.id === e.day_id)
                return (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {origem ? ` — treino ${origem.label}` : ''}
                  </option>
                )
              })}
            </select>
            <Button
              variant="outline"
              disabled={!escolhaExtra || switchingSession || salvando !== null}
              onClick={() => adicionarExtra(escolhaExtra)}
            >
              Adicionar
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="aluno-notas" className="text-xs">
          Como foi o treino? (opcional)
        </Label>
        <textarea
          id="aluno-notas"
          className={`${controlClass} min-h-16`}
          maxLength={600}
          value={notas}
          onChange={(e) => {
            setDirty(true)
            setNotas(e.target.value)
          }}
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
          {ok}
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          variant="outline"
          onClick={() => void salvar(false)}
          disabled={salvando !== null || switchingSession}
        >
          {salvando === 'progresso' ? 'Salvando...' : 'Salvar progresso'}
        </Button>
        <Button onClick={() => void salvar(true)} disabled={salvando !== null || switchingSession}>
          {salvando === 'concluir' ? 'Concluindo...' : 'Concluir treino'}
        </Button>
      </div>
    </div>
  )
}

function Historico({
  token,
  scope,
  onLinkInvalid,
}: {
  token: string
  scope: string
  onLinkInvalid: () => Promise<void>
}) {
  const [sessoes, setSessoes] = useState<StudentHistorySession[] | null>(null)
  const [cursor, setCursor] = useState<StudentHistoryCursor | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [refreshing, setRefreshing] = useState(true)
  const [offline, setOffline] = useState(false)
  const [erroMais, setErroMais] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      const cache = await readCachedHistory(scope)
      if (vivo && cache) {
        setSessoes(cache.sessions)
        setCursor(cache.nextCursor)
        setCarregando(false)
      }
      try {
        const fresco = await getHistoryPageForLink(token, { limit: 30 })
        if (!vivo) return
        if (!fresco) {
          await onLinkInvalid()
          return
        }
        setSessoes(fresco.items)
        setCursor(fresco.next_cursor)
        await writeCachedHistory(scope, fresco.items, fresco.next_cursor)
        setOffline(false)
      } catch (error) {
        if (!vivo) return
        if (isInvalidStudentLinkError(error)) await onLinkInvalid()
        else setOffline(true)
      } finally {
        if (vivo) {
          setCarregando(false)
          setRefreshing(false)
        }
      }
    })()
    return () => {
      vivo = false
    }
  }, [token, scope, onLinkInvalid])

  async function carregarMais() {
    if (!cursor || carregandoMais || refreshing || !sessoes) return
    setCarregandoMais(true)
    setErroMais(null)
    try {
      const pagina = await getHistoryPageForLink(token, { limit: 30, cursor })
      if (!pagina) {
        await onLinkInvalid()
        return
      }
      const ids = new Set(sessoes.map((sessao) => sessao.id))
      const merged = [...sessoes, ...pagina.items.filter((sessao) => !ids.has(sessao.id))]
      setSessoes(merged)
      setCursor(pagina.next_cursor)
      setOffline(false)
      await writeCachedHistory(scope, merged, pagina.next_cursor)
    } catch (error) {
      if (isInvalidStudentLinkError(error)) await onLinkInvalid()
      else {
        setOffline(true)
        setErroMais(errorMessage(error, 'Não foi possível carregar sessões mais antigas.'))
      }
    } finally {
      setCarregandoMais(false)
    }
  }

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
      {erroMais ? (
        <p role="alert" className="text-xs text-destructive">
          {erroMais}
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
      {cursor && !refreshing ? (
        <Button
          className="w-full"
          variant="outline"
          disabled={carregandoMais}
          onClick={() => void carregarMais()}
        >
          {carregandoMais ? 'Carregando...' : 'Carregar sessões anteriores'}
        </Button>
      ) : null}
    </div>
  )
}

function Anteriores({
  token,
  scope,
  pacote,
  onLinkInvalid,
}: {
  token: string
  scope: string
  pacote: StudentWorkout
  onLinkInvalid: () => Promise<void>
}) {
  const [aberto, setAberto] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<StudentPlanDetail | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const pedidoAtual = useRef(0)

  async function abrir(planId: string) {
    if (aberto === planId) {
      pedidoAtual.current += 1
      setAberto(null)
      return
    }
    const pedido = ++pedidoAtual.current
    setAberto(planId)
    setDetalhe(null)
    setErro(null)
    setCarregando(true)
    const cache = await readCachedPlan(scope, planId)
    if (pedido !== pedidoAtual.current) return
    if (cache) setDetalhe(cache)
    let planUnavailable = false
    try {
      const fresco = await getPlanForLink(token, planId)
      if (pedido !== pedidoAtual.current) return
      if (fresco) {
        setDetalhe(fresco)
        await writeCachedPlan(scope, planId, fresco)
      } else {
        planUnavailable = true
        setDetalhe(null)
        await removeCachedPlan(scope, planId)
        const acesso = await getWorkoutForLink(token)
        if (!acesso || isStudentLinkExpired(acesso.link_expires_at)) {
          await onLinkInvalid()
          return
        }
        setErro('Este treino anterior não está mais disponível.')
      }
    } catch (error) {
      if (isInvalidStudentLinkError(error)) await onLinkInvalid()
      else if (pedido === pedidoAtual.current && (planUnavailable || !cache)) {
        setErro(
          planUnavailable
            ? 'Este treino deixou de estar disponível; tente novamente quando houver internet.'
            : 'Sem internet para abrir este treino agora.'
        )
      }
    } finally {
      if (pedido === pedidoAtual.current) setCarregando(false)
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
      {dias.map((d) => {
        const blocos = toRowBlocks(
          detalhe.exercises
            .filter((e) => e.day_id === d.id)
            .sort((a, b) => a.position - b.position)
        )
        return (
          <div key={d.id}>
            <p className="text-xs font-medium">
              Treino {d.label}
              {d.name ? ` — ${d.name}` : ''}
            </p>
            <ul className="mt-0.5 space-y-0.5">
              {blocos.map((bloco) => (
                <li key={bloco.items[0].id} className="text-xs text-muted-foreground">
                  {/* Resumo de plano antigo: o rótulo do bloco entra uma vez, na
                      frente dos membros, em vez de repetir por linha. */}
                  {bloco.kind ? (
                    <span className="font-medium text-primary">
                      {groupLabel(bloco.kind, bloco.items.length)}:{' '}
                    </span>
                  ) : null}
                  {bloco.items
                    .map(
                      (e) =>
                        `${e.name} — ${formatSetsReps(e.sets, e.reps)}${
                          e.rir != null ? ` · RIR ${e.rir}` : ''
                        }`
                    )
                    .join(' + ')}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
