import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { PageTrail } from '../components/PageTrail'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { QueryError } from '../components/QueryError'
import { RecordMismatch } from '../components/RecordMismatch'
import { ReadOnlyNotice } from '../components/ReadOnlyGate'
import { useSubjectTrail } from '../lib/subjectTrail'
import { normalizeDbError } from '../lib/errors'
import { ageOnDate } from '../lib/age'
import { Button } from '@/components/ui/button'
import { useSubject } from '../features/subjects/hooks'
import { useDeleteFitnessTest, useFitnessTest, useFitnessTests } from '../features/fitness/hooks'
import { parseMeasures, TEST_LABELS } from '../features/fitness/measures'
import { computeFitness, formatResultValue, type FitnessResult } from '../features/fitness/engine'
import { previousResults, type Previous } from '../features/fitness/history'
import type { Sex } from '../features/assessment/protocols'

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

const signed = (v: number, digits: number) =>
  `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`

export default function TestesFisicosDetalhe() {
  const { id, testId } = useParams()
  const trail = useSubjectTrail(id)
  const navigate = useNavigate()
  const subjectQuery = useSubject(id)
  const testQuery = useFitnessTest(testId)
  const listQuery = useFitnessTests(id)
  const deleteMut = useDeleteFitnessTest(id)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (subjectQuery.isPending || testQuery.isPending || listQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }
  if (subjectQuery.isError || testQuery.isError || listQuery.isError || !subjectQuery.data) {
    return (
      <QueryError
        message="Não foi possível carregar os testes."
        onRetry={() => void Promise.all([subjectQuery.refetch(), testQuery.refetch(), listQuery.refetch()])}
      />
    )
  }
  const subject = subjectQuery.data
  const test = testQuery.data
  if (!test) return <p className="text-sm text-muted-foreground">Estes testes não existem mais.</p>
  if (test.subject_id !== subject.id) {
    return <RecordMismatch what="Este registro de testes" backTo={`/avaliados/${subject.id}`} />
  }

  const sex: Sex = subject.sex === 'F' ? 'F' : 'M'
  const age = ageOnDate(subject.birth_date, test.tested_at)
  const results = age != null ? computeFitness(parseMeasures(test.measures), sex, age) : []
  const previous = age != null ? previousResults(test, listQuery.data ?? [], sex, subject.birth_date) : {}
  const sources = [...new Set(results.map((r) => r.rating?.source).filter((s): s is string => !!s))]

  async function onDelete() {
    setConfirmDelete(false)
    try {
      await deleteMut.mutateAsync(test!.id)
      navigate(`/avaliados/${subject.id}`)
    } catch {
      // a mensagem aparece pelo deleteMut.error
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <PageTrail steps={trail} current={`Testes físicos de ${formatDate(test.tested_at)}`} />
        <h1 className="mt-2 text-xl font-semibold">Testes físicos de {formatDate(test.tested_at)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {subject.full_name}
          {age != null ? ` · ${age} anos na data` : ''} · {sex === 'F' ? 'feminino' : 'masculino'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to={`/avaliados/${subject.id}/testes/${test.id}/editar`}>Editar</Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)} disabled={deleteMut.isPending}>
          {deleteMut.isPending ? 'Excluindo...' : 'Excluir'}
        </Button>
      </div>
      {deleteMut.error ? (
        <p role="alert" className="text-sm text-destructive">{normalizeDbError(deleteMut.error)}</p>
      ) : null}
      <ReadOnlyNotice>Mudanças nestes testes não serão gravadas até a assinatura ser regularizada.</ReadOnlyNotice>

      {results.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum teste reconhecido neste registro.</p>
      ) : (
        <ul className="space-y-3">
          {results.map((r) => (
            <ResultCard key={r.key} result={r} previous={previous[r.key]} />
          ))}
        </ul>
      )}

      {test.notes ? (
        <section className="space-y-1">
          <h2 className="text-base font-semibold">Observações</h2>
          <p className="whitespace-pre-wrap text-sm">{test.notes}</p>
        </section>
      ) : null}

      <section className="space-y-1 text-xs text-muted-foreground">
        <p>
          VO2máx estimado por equação de campo, não medido por ergoespirometria.
          {sources.length > 0 ? ` Classificação: ${sources.join('; ')}.` : ''}
        </p>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir estes testes?"
        description="As medidas deste dia serão apagadas. Esta ação é definitiva."
        onConfirm={() => void onDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}

function RatingMeter({ level, levels }: { level: number; levels: number }) {
  return (
    <span className="flex gap-0.5" aria-hidden>
      {Array.from({ length: levels }, (_, i) => (
        <span key={i} className={`h-1.5 w-4 rounded-full ${i <= level ? 'bg-foreground' : 'bg-muted'}`} />
      ))}
    </span>
  )
}

function ResultCard({ result: r, previous }: { result: FitnessResult; previous: Previous | undefined }) {
  const digits = r.key === 'push_ups' || r.key === 'sit_ups' ? 0 : 1
  return (
    <li className="rounded-lg border bg-card p-4 lg:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{TEST_LABELS[r.key]}</h2>
          {r.detail.length > 0 ? <p className="mt-0.5 text-xs text-muted-foreground">{r.detail.join(' · ')}</p> : null}
        </div>
        <div className="sm:text-right">
          <p className="text-lg font-semibold tabular-nums">{formatResultValue(r)}</p>
          <p className="text-xs text-muted-foreground">{r.valueLabel}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
        {r.rating ? (
          <span className="flex items-center gap-2">
            <RatingMeter level={r.rating.level} levels={r.rating.levels} />
            <span className="font-medium">{r.rating.label}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Sem classificação</span>
        )}
        {previous ? (
          <span className="text-muted-foreground tabular-nums">
            {signed(r.value - previous.value, digits)} desde {formatDate(previous.testedAt)}
            {previous.ratingLabel && previous.ratingLabel !== r.rating?.label ? ` (era ${previous.ratingLabel})` : ''}
          </span>
        ) : null}
      </div>
      {r.notes.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {r.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}
