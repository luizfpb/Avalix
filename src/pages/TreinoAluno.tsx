import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, CloudOff, RefreshCw, TriangleAlert, X } from 'lucide-react'
import {
  getHistoryPageForLink,
  getPlanForLink,
  getWorkoutForLink,
  submitSession,
  updateSessionForLink,
  type StudentExercise,
  type StudentHistoryCursor,
  type StudentHistorySession,
  type StudentPlanDetail,
  type StudentWorkout,
} from '../features/workout/studentApi'
import {
  buildSets,
  CORRECTED_SESSION_MESSAGE,
  flushQueue,
  isInvalidStudentLinkError,
  isNetworkFailure,
  isTransientStudentError,
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
  captureStudentStorageAccess,
  invalidateStudentStorageAccess,
  isStudentStorageAccessCurrent,
  dequeueSession,
  enqueueSession,
  forgetStudentDevice,
  purgeRevokedStudentDevice,
  readCachedHistory,
  readCachedPlan,
  readCachedWorkout,
  readReconciledDraft,
  readQueue,
  removeCachedPlan,
  reserveDraftRevision,
  requestPersistentStorage,
  writeCachedHistory,
  writeCachedPlan,
  writeCachedWorkout,
  writeDraft,
  STUDENT_TOKEN_KEY,
  StudentStorageError,
  type QueuedSession,
  type StudentStorageAccess,
  type DraftSession,
} from '../features/workout/studentStore'
import { identidadeDaSessao } from '../features/workout/studentDraft'
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
import { updateLogRow, validateLogRows, type LogRow } from '../features/workout/logRows'
import { SetRowFields } from '../features/workout/SetRowFields'
import { SessionEditForm, type SessionEditValues } from '../features/workout/SessionEditForm'
import {
  currentWeek,
  sessionsPerWeek,
  suggestedPlanWeek,
  type PlanWeekSuggestion,
  type WeekLogPoint,
} from '../features/workout/progress'
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
  const storageAccess = useRef<StudentStorageAccess | null>(null)
  const [registrando, setRegistrando] = useState(false)
  const savingActive = useRef(false)
  const pendingPackage = useRef<StudentWorkout | null>(null)
  const receberPacote = useCallback((next: StudentWorkout) => {
    if (savingActive.current) pendingPackage.current = next
    else setPacote(next)
  }, [])
  const aoRegistrar = useCallback((busy: boolean) => {
    savingActive.current = busy
    setRegistrando(busy)
    if (!busy && pendingPackage.current) {
      setPacote(pendingPackage.current)
      pendingPackage.current = null
    }
  }, [])

  const invalidarAcesso = useCallback(async (limpar = true) => {
    // Esta montagem nunca reativa outro token. Respostas antigas não podem
    // executar uma segunda purga depois de outra aba ter aberto um novo link.
    if (accessEpoch.current > 0 || (storageAccess.current && !isStudentStorageAccessCurrent(storageAccess.current))) return
    const epoch = ++accessEpoch.current
    if (storageAccess.current) invalidateStudentStorageAccess(storageAccess.current)
    pendingPackage.current = null
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
    let mounted = true
    const epoch = accessEpoch.current
    void Promise.all([studentScope(token), captureStudentStorageAccess()]).then(([nextScope, access]) => {
      if (!mounted || epoch !== accessEpoch.current) { invalidateStudentStorageAccess(access); return }
      storageAccess.current = access
      setScope(nextScope)
    })
    void requestPersistentStorage()
    return () => {
      mounted = false
      if (storageAccess.current) invalidateStudentStorageAccess(storageAccess.current)
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    const outraAba = (event: StorageEvent) => {
      if (event.key === STUDENT_TOKEN_KEY && event.newValue !== token) void invalidarAcesso(false)
    }
    window.addEventListener('storage', outraAba)
    return () => window.removeEventListener('storage', outraAba)
  }, [token, invalidarAcesso])

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
    const access = storageAccess.current
    if (!token || !scope || !access) return
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
          await writeCachedWorkout(scope, fresco, access)
          if (!vivo || epoch !== accessEpoch.current) return
          setInvalido(false)
          setErroLimpeza(false)
          receberPacote(fresco)
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
  }, [token, scope, recarregarFila, invalidarAcesso, receberPacote])

  // Sobe a fila quando a rede volta e quando o app volta ao primeiro plano.
  const enviando = useRef(false)
  const enviarFila = useCallback(async (force = false) => {
    const access = storageAccess.current
    if (!token || !scope || !access || !isStudentStorageAccessCurrent(access) || enviando.current) return
    const epoch = accessEpoch.current
    enviando.current = true
    try {
      const r = await withStudentSyncLock(scope, () => flushQueue(token, scope, access, force))
      if (epoch !== accessEpoch.current) return
      if (r.sent > 0) setSemRede(false)
      await recarregarFila()
    } catch (error) {
      if (epoch !== accessEpoch.current) return
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
    const access = storageAccess.current
    if (!token || !scope || !access || invalido || revalidando.current) return
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
      await writeCachedWorkout(scope, fresco, access)
      if (epoch !== accessEpoch.current) return
      receberPacote(fresco)
      setSincronizadoEm(new Date().toISOString())
      setSemRede(false)
    } catch (error) {
      if (isInvalidStudentLinkError(error)) await invalidarAcesso()
    } finally {
      revalidando.current = false
    }
  }, [invalido, invalidarAcesso, pacote, scope, token, receberPacote])

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
    window.addEventListener('online', aoVoltar)
    document.addEventListener('visibilitychange', aoFocar)
    return () => {
      window.removeEventListener('online', aoVoltar)
      document.removeEventListener('visibilitychange', aoFocar)
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

  useEffect(() => {
    if (!fila.some((item) => !item.error || isTransientStudentError({ message: item.error }))) return
    const timer = window.setInterval(() => { void enviarFila() }, 30_000)
    return () => window.clearInterval(timer)
  }, [fila, enviarFila])

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
        onEnviar={() => void enviarFila(true)}
        onDescartar={(clientRef) => {
          if (!scope) return
          void dequeueSession(scope, clientRef, true, storageAccess.current ?? undefined).then(() => recarregarFila()).catch((error) => {
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
            disabled={registrando}
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
            access={storageAccess.current!}
            onSavingChange={aoRegistrar}
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
        <Historico token={token} scope={scope} access={storageAccess.current!} onLinkInvalid={invalidarAcesso}
          planId={pacote.plan?.id ?? null}
          exerciseOptions={pacote.exercises.map((ex) => ({ id: ex.exercise_id, name: ex.name }))}
          onEdited={async () => {
            const epoch = accessEpoch.current
            try {
              const next = await getWorkoutForLink(token)
              if (epoch !== accessEpoch.current) return
              if (!next || isStudentLinkExpired(next.link_expires_at)) {
                await invalidarAcesso()
                return
              }
              receberPacote(next)
              await writeCachedWorkout(scope, next, storageAccess.current!)
            } catch {
              // A correção já foi salva; a referência de carga pode ser
              // atualizada na próxima conexão sem desfazer esse sucesso.
            }
          }} />
      ) : null}

      {aba === 'anteriores' ? (
        <Anteriores
          token={token}
          scope={scope}
          access={storageAccess.current!}
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
          disabled={registrando}
          onClick={() => {
            void invalidarAcesso(false).then(() => forgetStudentDevice())
              .then(() => window.location.replace('/t')).catch(() => setErroLimpeza(true))
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
            ir até não conseguir mais. RIR 0 significa que você estimou não conseguir outra repetição.
            Marque Falha se tentou continuar e não conseguiu completar a repetição.
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
                  ? '1 treino salvo no aparelho, aguardando sincronização.'
                  : `${pendentes.length} treinos salvos no aparelho, aguardando sincronização.`}
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

type Linha = LogRow
const studentDraftOperations = new Map<string, Promise<unknown>>()

// Explica na língua do aluno de onde saiu a semana pré-selecionada. A regra é
// a mesma da tela do profissional (`suggestedPlanWeek`); só o texto muda.
function dicaSemanaAluno(s: PlanWeekSuggestion): string {
  const feitos =
    `${s.sessionsInCurrentPass} de ${s.sessionsPerWeek} ` +
    `${s.sessionsPerWeek === 1 ? 'treino' : 'treinos'}`
  switch (s.basis) {
    case 'first':
      return 'Primeiro treino deste plano: você começa pela semana 1.'
    case 'continue':
      return s.sessionsPerWeek > 0
        ? `Semana ${s.lastLoggedWeek} em andamento: ${feitos} feitos.`
        : `Continuando na semana ${s.lastLoggedWeek}, a do seu último treino.`
    case 'advance':
      return `Você fechou a semana ${s.lastLoggedWeek} (${feitos}). Agora começa a semana ${s.week}.`
    case 'end':
      return `A semana ${s.lastLoggedWeek} era a última do plano e já fechou — fale com seu treinador sobre o próximo.`
  }
}

function TreinoDoDia({
  token,
  scope,
  pacote,
  access,
  onSavingChange,
  onFilaMudou,
  onSemRede,
  onLinkInvalid,
}: {
  token: string
  scope: string
  pacote: StudentWorkout
  access: StudentStorageAccess
  onSavingChange: (saving: boolean) => void
  onFilaMudou: () => Promise<void>
  onSemRede: () => void
  onLinkInvalid: () => Promise<void>
}) {
  const plano = pacote.plan!
  const dias = useMemo(
    () => pacote.days.slice().sort((a, b) => a.position - b.position),
    [pacote.days]
  )
  const divisaoSugerida = suggestedWorkoutDayId(
    plano.weekly_schedule,
    dias,
    pacote.current_plan_sessions
  )

  // Treinos concluídos nesta tela que o pacote ainda não conhece: ele só é
  // rebuscado ao reabrir a página, então sem isto a semana sugerida ficaria
  // parada até lá — o aluno que fecha a semana de manhã e volta à tarde
  // continuaria vendo a semana anterior.
  const [logsLocais, setLogsLocais] = useState<WeekLogPoint[]>([])
  const sessoesNoPacote = useRef(pacote.current_plan_sessions)
  useEffect(() => {
    const antes = sessoesNoPacote.current
    const agora = pacote.current_plan_sessions
    sessoesNoPacote.current = agora
    // Pacote novo já contabilizou parte do que estava aqui: as mais antigas
    // saem da lista local para não contarem duas vezes.
    if (agora > antes) {
      const contabilizadas = agora - antes
      setLogsLocais((atuais) => atuais.slice(0, Math.max(0, atuais.length - contabilizadas)))
    }
  }, [pacote.current_plan_sessions])

  const sessoesPorSemana = sessionsPerWeek(plano.weekly_schedule, dias.length)
  // A semana vem do que o aluno REALMENTE registrou, não da data: ele pode ter
  // recebido o plano semanas antes de começar, faltado, ou estar repetindo a
  // semana de propósito. `plan_week_log` é opcional porque um pacote guardado
  // no aparelho antes da 0037 não tem o campo — aí não há o que derivar, e a
  // tela volta ao palpite antigo pelo calendário em vez de ficar sem semana.
  const sugerirSemana = useCallback(
    (locais: WeekLogPoint[]): PlanWeekSuggestion | null => {
      const doServidor = pacote.plan_week_log
      if (!doServidor) return null
      return suggestedPlanWeek({
        weeks: plano.weeks,
        sessionsPerWeek: sessoesPorSemana,
        logs: [...locais, ...doServidor],
      })
    },
    [pacote.plan_week_log, plano.weeks, sessoesPorSemana]
  )
  const sugestao = useMemo(() => sugerirSemana(logsLocais), [sugerirSemana, logsLocais])
  const semanaSugerida = sugestao?.week ?? currentWeek(plano.weeks, plano.starts_on, new Date())

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
  const revision = useRef(0)
  const revisions = useRef(new Map<string, number>())
  const draftOperations = useRef<Promise<unknown>>(Promise.resolve())
  const saving = useRef(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<'progresso' | 'concluir' | null>(null)
  const [rascunhoLido, setRascunhoLido] = useState(false)
  // aviso de "o plano foi regravado e o rascunho foi remapeado"
  const [planoMudou, setPlanoMudou] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [switchingSession, setSwitchingSession] = useState(false)
  const [resetEpoch, setResetEpoch] = useState(0)
  const draftPlan = useRef({ days: dias, exercises: pacote.exercises })
  draftPlan.current = { days: dias, exercises: pacote.exercises }
  const switchGeneration = useRef(0)
  const switchAccess = useRef<StudentStorageAccess | null>(null)
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
    let vivo = true
    const readAccess = { ...access, parent: access }
    void (async () => {
      await studentDraftOperations.get(`${scope}:${plano.id}`)
      const conciliado = await readReconciledDraft(scope, plano.id, draftPlan.current, readAccess)
      if (!vivo) return
      if (conciliado) {
        const d = conciliado.draft
        if (d.dayId) setDayId(d.dayId)
        setSemana(d.weekNumber)
        setData(d.performedAt)
        setNotas(d.notes)
        setLinhas(d.rows)
        setExtras(d.extras ?? [])
        setClientRef(d.clientRef)
        revision.current = d.revision ?? 0
        revisions.current.set(d.clientRef, revision.current)
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
    })().catch((error) => {
      if (vivo && isStudentStorageAccessCurrent(access)) setErro(errorMessage(error, 'Não foi possível recuperar o rascunho. Reabra esta tela.'))
    })
    return () => {
      vivo = false
      invalidateStudentStorageAccess(readAccess)
    }
  }, [plano.id, scope, access])

  // O pacote guardado no aparelho é exibido primeiro e o do servidor chega
  // depois: se o aluno ainda não escolheu semana nenhuma, o campo passa a
  // acompanhar a sugestão em vez de ficar em "—" com a explicação ao lado.
  // Só age sobre campo vazio e sem rascunho recuperado — escolha dele manda.
  useEffect(() => {
    if (semana != null || dirty || !rascunhoLido || sugestao == null) return
    setSemana(sugestao.week)
  }, [semana, dirty, rascunhoLido, sugestao])

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
        proximo[ex.id] = reconcileSetRows(proximo[ex.id] ?? [], efetiva.skipped ? 0 : efetiva.sets)
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
  const persistRef = useRef(persistDraft)
  persistRef.current = persistDraft
  useEffect(() => {
    if (!rascunhoLido || !dirty || salvando !== null) return
    const id = setTimeout(() => {
      void persistRef.current(draftRef.current()).catch((error) => {
        if (isStudentStorageAccessCurrent(access)) setErro(errorMessage(error, 'Não foi possível guardar o rascunho neste aparelho.'))
      })
    }, 500)
    return () => clearTimeout(id)
  }, [scope, clientRef, plano.id, dayId, semana, data, notas, linhas, extras, rascunhoLido, dirty, salvando, access])

  // Descarga ao desmontar: o pacote novo que chega do servidor remonta esta
  // tela (a `key` acompanha os ids das divisões), e o debounce de 500 ms acima
  // podia ser cancelado antes de gravar. Sem isto, a reconciliação do rascunho
  // não teria o que reconciliar. `dirty` é o guarda: sessão concluída zera o
  // sinalizador em `reiniciar()`, então nada é ressuscitado.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    return () => {
      switchGeneration.current += 1
      if (switchAccess.current) invalidateStudentStorageAccess(switchAccess.current)
      if (dirtyRef.current && !saving.current && isStudentStorageAccessCurrent(access)) {
        void persistRef.current(draftRef.current()).catch(() => undefined)
      }
    }
  }, [scope, access])

  function setCelula(exId: string, i: number, campo: keyof Linha, valor: string | boolean) {
    setDirty(true)
    setLinhas((anterior) => {
      const rows = (anterior[exId] ?? []).slice()
      rows[i] = updateLogRow(rows[i], campo, valor)
      return { ...anterior, [exId]: rows }
    })
  }

  function addLinha(exId: string) {
    setDirty(true)
    setLinhas((anterior) => ({
      ...anterior,
      [exId]: [...(anterior[exId] ?? []), { weight: '', reps: '', rir: '', rest: '', failure: false }],
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

  function draftAtual(nextRevision = revision.current): DraftSession {
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

  function persistDraft(snapshot: DraftSession, required = false, reserve = false): Promise<number> {
    const key = `${scope}:${snapshot.planId}`
    const operation = (studentDraftOperations.get(key) ?? draftOperations.current).then(async () => {
      const base = revisions.current.get(snapshot.clientRef) ?? snapshot.revision
      const allocated = await (reserve ? reserveDraftRevision : writeDraft)(
        scope, { ...snapshot, revision: base }, required, access
      )
      revisions.current.set(snapshot.clientRef, allocated)
      if (draftRef.current().clientRef === snapshot.clientRef) revision.current = allocated
      return allocated
    })
    draftOperations.current = operation.catch(() => undefined)
    const settled = draftOperations.current
    studentDraftOperations.set(key, settled)
    void settled.then(() => {
      if (studentDraftOperations.get(key) === settled) studentDraftOperations.delete(key)
    })
    return operation
  }

  async function trocarSessao(nextDayId: string, nextDate: string) {
    if (!rascunhoLido || saving.current) return
    if (nextDayId === dayId && nextDate === data) return
    const generation = ++switchGeneration.current
    const readAccess = { ...access, parent: access }
    switchAccess.current = readAccess
    setSwitchingSession(true)
    try {
      if (dirty) await persistDraft(draftAtual(), true)
      else await draftOperations.current
      const reconciled = await readReconciledDraft(scope, plano.id, draftPlan.current, readAccess, nextDayId, nextDate)
      const target = reconciled?.draft
      if (generation !== switchGeneration.current) return
      setDayId(nextDayId)
      setData(nextDate)
      setSemana(target?.weekNumber ?? semanaSugerida)
      setNotas(target?.notes ?? '')
      setLinhas(target?.rows ?? {})
      setExtras(target?.extras ?? [])
      setEscolhaExtra('')
      setClientRef(target?.clientRef ?? crypto.randomUUID())
      revision.current = target?.revision ?? 0
      if (target) revisions.current.set(target.clientRef, revision.current)
      setDirty(Boolean(target))
      setErro(null)
      setOk(null)
      setPlanoMudou(null)
      setResetEpoch((value) => value + 1)
    } catch (error) {
      if (generation === switchGeneration.current) setErro(errorMessage(error, 'Não foi possível guardar e trocar a sessão.'))
    } finally {
      if (generation === switchGeneration.current) setSwitchingSession(false)
    }
  }

  async function salvar(concluir: boolean) {
    if (switchingSession || !rascunhoLido || saving.current) return
    setErro(null)
    setOk(null)
    const erroDescanso = validateLogRows(Object.fromEntries(
      [...exerciciosDoDia, ...exerciciosExtras].map((ex) => [ex.id, linhas[ex.id] ?? []])
    ))
    if (erroDescanso) {
      setErro(erroDescanso)
      return
    }
    const sets = buildSets(linhas, [...exerciciosDoDia, ...exerciciosExtras])
    if (sets.length === 0) {
      setErro('Marque ao menos uma série com carga ou repetições.')
      return
    }

    saving.current = true
    onSavingChange(true)
    setSalvando(concluir ? 'concluir' : 'progresso')
    try {
      // A reserva é uma transação IndexedDB: duas abas nunca recebem a mesma
      // revisão. No progresso ela é obrigatória, pois a mensagem promete que a
      // sessão poderá ser retomada mesmo se a aba fechar logo depois.
      const allocatedRevision = await persistDraft(draftAtual(), !concluir, true)

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
          await enqueueSession(scope, sessao, access)
          durableOutbox = true
        } catch (storageError) {
          if (!(storageError instanceof StudentStorageError)) throw storageError
          // IndexedDB indisponível não impede o uso online. Se a rede também
          // falhar, o bloco abaixo exige a fila antes de confirmar o salvamento.
        }

        try {
          const enviado = await submitSession({
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
          if (enviado.stale) {
            throw new Error(enviado.corrected ? CORRECTED_SESSION_MESSAGE
              : 'Este treino tem um envio mais recente. Confira o histórico antes de salvar novamente.')
          }
          if (durableOutbox) await dequeueSession(scope, sessao.clientRef, false, access, sessao.revision)
          return { offline: false }
        } catch (error) {
          if (!isTransientStudentError(error)) {
            if (durableOutbox) await dequeueSession(scope, sessao.clientRef, false, access, sessao.revision)
            throw error
          }
          if (!durableOutbox) {
            await enqueueSession(scope, sessao, access)
            durableOutbox = true
          }
          return { offline: true }
        }
      })

      if (!isStudentStorageAccessCurrent(access)) return
      if (concluir) await clearDraftSession(scope, plano.id, dayId, data, access, clientRef, allocatedRevision)
      if (result.offline) {
        await onFilaMudou()
        onSemRede()
        setOk(
          concluir
            ? 'Treino concluído e salvo no aparelho. Será sincronizado automaticamente.'
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
        reiniciar()
      }
    } catch (error) {
      if (isInvalidStudentLinkError(error)) await onLinkInvalid()
      else setErro(errorMessage(error, 'Não foi possível salvar o treino no servidor nem neste aparelho. Mantenha esta tela aberta e tente novamente.'))
    } finally {
      saving.current = false
      onSavingChange(false)
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
    // A sessão que acabou de ser concluída conta para a semana da próxima:
    // pode ter sido ela que fechou a semana.
    const proximosLogs =
      semana != null ? [{ performed_at: data, week_number: semana }, ...logsLocais] : logsLocais
    setLogsLocais(proximosLogs)
    setDayId(nextDayId)
    setData(hoje())
    setSemana(sugerirSemana(proximosLogs)?.week ?? semanaSugerida)
    setClientRef(crypto.randomUUID())
    revision.current = 0
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
      {!rascunhoLido ? <p role="status" className="text-sm text-muted-foreground">Recuperando seu rascunho...</p> : null}
      <fieldset disabled={!rascunhoLido || switchingSession || salvando !== null} className="min-w-0 space-y-4">
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

      {/* A semana escolhida aqui é a que traz a prescrição da semana (o que
          muda em séries, carga e descanso) e a que fica gravada no histórico.
          Derivar do calendário errava sempre que a vida real saía do papel —
          e errava calado. Agora o número se explica, e trocar é um clique. */}
      {sugestao ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{dicaSemanaAluno(sugestao)}</span>
          {semana !== sugestao.week ? (
            <button
              type="button"
              disabled={switchingSession || salvando !== null}
              className="rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              onClick={() => {
                setDirty(true)
                setSemana(sugestao.week)
              }}
            >
              Usar a semana {sugestao.week}
            </button>
          ) : sugestao.basis === 'advance' && sugestao.lastLoggedWeek != null ? (
            <button
              type="button"
              disabled={switchingSession || salvando !== null}
              className="rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              onClick={() => {
                setDirty(true)
                setSemana(sugestao.lastLoggedWeek)
              }}
            >
              Repetir a semana {sugestao.lastLoggedWeek}
            </button>
          ) : null}
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Descanso (s): anote o tempo após cada série. É opcional; 0 significa sem descanso.
        {' '}Marque Falha quando tentou e não conseguiu completar a repetição; RIR 0 sozinho não marca falha.
      </p>

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
                      {ultima.reached_failure === true ? ' · Falha' : ''}
                    </p>
                  ) : null}

                  <div className="mt-2 max-w-md space-y-1">
                    <div className="grid grid-cols-[1.25rem_repeat(4,minmax(0,1fr))] items-center gap-1.5 text-center text-[11px] text-muted-foreground sm:gap-2">
                      <span />
                      <span>carga (kg)</span>
                      <span>reps</span>
                      <span>RIR</span>
                      <span>desc. (s)</span>
                    </div>
                    {(linhas[ex.id] ?? []).map((row, i) => (
                    <SetRowFields key={i} name={ex.name} index={i} row={row}
                      repsPlaceholder={efetiva.reps ?? '—'}
                      rirPlaceholder={efetiva.rir != null ? String(efetiva.rir) : '—'}
                      disabled={switchingSession || salvando !== null}
                      onChange={(field, value) => setCelula(ex.id, i, field, value)} />
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
                  {ultima.reached_failure === true ? ' · Falha' : ''}
                </p>
              ) : null}
              <div className="mt-2 max-w-md space-y-1">
                <div className="grid grid-cols-[1.25rem_repeat(4,minmax(0,1fr))] items-center gap-1.5 text-center text-[11px] text-muted-foreground sm:gap-2">
                  <span />
                  <span>carga (kg)</span>
                  <span>reps</span>
                  <span>RIR</span>
                  <span>desc. (s)</span>
                </div>
                {(linhas[ex.id] ?? []).map((row, i) => (
                    <SetRowFields key={i} name={ex.name} index={i} row={row}
                      repsPlaceholder={ex.reps ?? '—'}
                      rirPlaceholder={ex.rir != null ? String(ex.rir) : '—'}
                      disabled={switchingSession || salvando !== null}
                      onChange={(field, value) => setCelula(ex.id, i, field, value)} />
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
      </fieldset>
    </div>
  )
}

function Historico({
  token,
  scope,
  access,
  onLinkInvalid,
  onEdited,
  planId,
  exerciseOptions,
}: {
  token: string
  scope: string
  access: StudentStorageAccess
  onLinkInvalid: () => Promise<void>
  onEdited: () => Promise<void>
  planId: string | null
  exerciseOptions: { id: string; name: string }[]
}) {
  const [sessoes, setSessoes] = useState<StudentHistorySession[] | null>(null)
  const [cursor, setCursor] = useState<StudentHistoryCursor | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [refreshing, setRefreshing] = useState(true)
  const [offline, setOffline] = useState(false)
  const [erroMais, setErroMais] = useState<string | null>(null)
  const [editing, setEditing] = useState<StudentHistorySession | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [openingEdit, setOpeningEdit] = useState<string | null>(null)
  const [editingOptions, setEditingOptions] = useState<{ id: string; name: string }[]>([])
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    let vivo = true
    setRefreshing(true)
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
        await writeCachedHistory(scope, fresco.items, fresco.next_cursor, access)
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
  }, [token, scope, onLinkInvalid, refreshKey, access])

  async function abrirEdicao(session: StudentHistorySession) {
    if (openingEdit || !session.updated_at || session.source !== 'student') return
    setOpeningEdit(session.id)
    setErroMais(null)
    let options = session.plan_id === planId || !session.plan_id ? exerciseOptions : []
    try {
      if (session.plan_id && session.plan_id !== planId) {
        const cached = await readCachedPlan(scope, session.plan_id)
        options = cached?.exercises.map((ex) => ({ id: ex.exercise_id, name: ex.name })) ?? []
        try {
          const original = await getPlanForLink(token, session.plan_id)
          if (original) options = original.exercises.map((ex) => ({ id: ex.exercise_id, name: ex.name }))
        } catch (error) {
          if (isInvalidStudentLinkError(error)) throw error
          // Sem rede ainda é possível corrigir as séries já carregadas.
        }
      }
      if (!mounted.current) return
      setEditingOptions(options)
      setEditing(session)
      setSavedMessage(null)
    } catch (error) {
      if (isInvalidStudentLinkError(error)) await onLinkInvalid()
      else setErroMais(errorMessage(error, 'Não foi possível abrir a edição do treino.'))
    } finally {
      setOpeningEdit(null)
    }
  }

  async function salvarCorrecao(value: SessionEditValues) {
    if (!editing?.updated_at) throw new Error('Atualize o histórico antes de editar este treino.')
    try {
      const updated = await updateSessionForLink({
        token,
        logId: editing.id,
        expectedUpdatedAt: editing.updated_at,
        performedAt: value.performedAt,
        notes: value.notes,
        sets: value.sets.map((s) => ({ exercise_id: s.exerciseId, set_number: s.setNumber,
          weight_kg: s.weightKg, reps: s.reps, rir: s.rir,
          rest_seconds: s.restSeconds ?? null, reached_failure: s.reachedFailure ?? null })),
      })
      // Sair do aparelho ou revogar o link pode desmontar o histórico durante
      // a requisição. Sua resposta não pode repovoar o cache já apagado.
      if (!mounted.current) return
      const next = (sessoes ?? []).map((session) => session.id === updated.id ? updated : session)
      setSessoes(next)
      setEditing(null)
      setSavedMessage('Correções salvas no treino.')
      await writeCachedHistory(scope, next, cursor, access)
      // A data participa da paginação: recarregar a primeira página evita
      // manter um cursor antigo depois de mover uma sessão para outra data.
      setRefreshKey((key) => key + 1)
      await onEdited()
    } catch (error) {
      if (isInvalidStudentLinkError(error)) await onLinkInvalid()
      throw error
    }
  }

  async function carregarMais() {
    if (!cursor || carregandoMais || refreshing || !sessoes) return
    setCarregandoMais(true)
    setErroMais(null)
    try {
      const pagina = await getHistoryPageForLink(token, { limit: 30, cursor })
      if (!mounted.current || !isStudentStorageAccessCurrent(access)) return
      if (!pagina) {
        await onLinkInvalid()
        return
      }
      const ids = new Set(sessoes.map((sessao) => sessao.id))
      const merged = [...sessoes, ...pagina.items.filter((sessao) => !ids.has(sessao.id))]
      setSessoes(merged)
      setCursor(pagina.next_cursor)
      setOffline(false)
      await writeCachedHistory(scope, merged, pagina.next_cursor, access)
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
      {savedMessage ? <p role="status" className="text-sm text-primary">{savedMessage}</p> : null}
      {editing ? (
        <SessionEditForm performedAt={editing.performed_at} notes={editing.notes}
          exerciseOptions={editingOptions}
          sets={editing.sets.map((s) => ({ exerciseId: s.exercise_id, exerciseName: s.exercise_name,
            setNumber: s.set_number, weightKg: s.weight_kg, reps: s.reps, rir: s.rir,
            restSeconds: s.rest_seconds, reachedFailure: s.reached_failure }))}
          onSave={salvarCorrecao} onCancel={() => setEditing(null)} />
      ) : null}
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
                restSeconds: x.rest_seconds,
                reachedFailure: x.reached_failure,
              }))}
            />
          </div>
          {s.notes ? <p className="mt-1 text-[11px] italic text-muted-foreground">{s.notes}</p> : null}
          {s.source === 'student' ? (
            <div className="mt-2">
              <Button type="button" size="sm" variant="outline" disabled={!s.updated_at || refreshing || openingEdit !== null}
                onClick={() => void abrirEdicao(s)}>
                {openingEdit === s.id ? 'Abrindo...' : 'Editar treino'}
              </Button>
              {!s.updated_at ? <p className="mt-1 text-[11px] text-muted-foreground">Conecte-se à internet para atualizar e editar este registro.</p> : null}
            </div>
          ) : null}
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
  access,
  pacote,
  onLinkInvalid,
}: {
  token: string
  scope: string
  access: StudentStorageAccess
  pacote: StudentWorkout
  onLinkInvalid: () => Promise<void>
}) {
  const [aberto, setAberto] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<StudentPlanDetail | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const pedidoAtual = useRef(0)
  useEffect(() => () => { pedidoAtual.current += 1 }, [])

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
    if (pedido !== pedidoAtual.current || !isStudentStorageAccessCurrent(access)) return
    if (cache) setDetalhe(cache)
    let planUnavailable = false
    try {
      const fresco = await getPlanForLink(token, planId)
      if (pedido !== pedidoAtual.current || !isStudentStorageAccessCurrent(access)) return
      if (fresco) {
        setDetalhe(fresco)
        await writeCachedPlan(scope, planId, fresco, access)
      } else {
        planUnavailable = true
        setDetalhe(null)
        await removeCachedPlan(scope, planId, access)
        const acesso = await getWorkoutForLink(token)
        if (pedido !== pedidoAtual.current || !isStudentStorageAccessCurrent(access)) return
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
