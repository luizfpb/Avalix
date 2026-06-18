import { Link, useParams } from 'react-router-dom'
import { ShieldCheck, AlertTriangle } from 'lucide-react'
import { useAnamnese } from '../features/anamnesis/hooks'
import { computeGate, NIVEL_LABEL } from '../features/anamnesis/gate'
import {
  PARQ_ITEMS,
  DOENCA_CMR,
  SINAIS_SINTOMAS,
  OBJETIVOS,
  EXPERIENCIA,
  INTENSIDADE,
  DOENCAS_CRONICAS,
  REGIAO_DOR,
  TEMPO_EVOLUCAO,
  RED_FLAGS,
  TABAGISMO,
  ALCOOL,
  ALTERACAO_POSTURAL,
  LADO_DOMINANTE,
  type AnamnesisAnswers,
  type Option,
} from '../features/anamnesis/spec'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}
const labelOf = (opts: Option[], v: string) => opts.find((o) => o.value === v)?.label ?? v
const labelsOf = (opts: Option[], vs: string[]) => vs.map((v) => labelOf(opts, v)).join(', ')

export default function AnamneseDetalhe() {
  const { id, anamneseId } = useParams()
  const query = useAnamnese(anamneseId)

  if (query.isPending) return <p className="text-sm text-muted-foreground">Carregando...</p>
  if (query.isError || !query.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Não foi possível carregar a anamnese.</p>
        <Button asChild variant="outline">
          <Link to={`/avaliados/${id}`}>Voltar</Link>
        </Button>
      </div>
    )
  }

  const row = query.data
  const a = row.payload as unknown as AnamnesisAnswers
  const gate = computeGate(a)
  const ok = row.liberado && !row.flag_encaminhamento

  const parqYes = PARQ_ITEMS.filter((i) => a.parq?.[i.key] === true)

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link to={`/avaliados/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Anamnese de {formatDate(row.assessed_at)}</h1>
      </div>

      <div
        className={[
          'rounded-md border p-4',
          ok ? 'border-success/40 bg-success/10' : 'border-warning/40 bg-warning/10',
        ].join(' ')}
      >
        <div className="flex items-center gap-2">
          {ok ? (
            <ShieldCheck className="size-5 text-success" />
          ) : (
            <AlertTriangle className="size-5 text-warning" />
          )}
          <span className="font-medium">
            {ok ? 'Liberado para avaliação' : 'Encaminhamento recomendado'}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Nível ACSM:{' '}
          <span className="font-medium text-foreground">
            {NIVEL_LABEL[row.nivel_encaminhamento as keyof typeof NIVEL_LABEL] ??
              row.nivel_encaminhamento}
          </span>
        </p>
        {gate.motivos.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {gate.motivos.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">
          Triagem baseada no PAR-Q+ e nas diretrizes de pré-participação do ACSM (redação própria).
          Não substitui avaliação médica.
        </p>
      </div>

      <Block title="Triagem (PAR-Q+)">
        {parqYes.length === 0 ? (
          <Item label="Respostas" value="Todas 'Não'" />
        ) : (
          parqYes.map((i) => <Item key={i.key} label="Sim" value={i.label} />)
        )}
      </Block>

      <Block title="Refinamento (ACSM)">
        <Item label="Ativo regular" value={fmtBool(a.ativo_regular)} />
        <Item label="Doença diagnosticada" value={labelsOf(DOENCA_CMR, a.doenca_cmr ?? [])} />
        <Item label="Sinais/sintomas" value={labelsOf(SINAIS_SINTOMAS, a.sinais_sintomas ?? [])} />
      </Block>

      <Block title="Objetivo">
        <Item label="Objetivo" value={labelsOf(OBJETIVOS, a.objetivo_principal ?? [])} />
        <Item label="Esporte/modalidade" value={a.esporte_modalidade} />
        <Item label="Experiência" value={a.experiencia_treino ? labelOf(EXPERIENCIA, a.experiencia_treino) : ''} />
        <Item label="Intensidade desejada" value={a.intensidade_desejada ? labelOf(INTENSIDADE, a.intensidade_desejada) : ''} />
      </Block>

      <Block title="História clínica">
        <Item label="Doenças crônicas" value={labelsOf(DOENCAS_CRONICAS, a.doencas_cronicas ?? [])} />
        {(a.cirurgias ?? []).map((c, i) => (
          <Item key={`c${i}`} label="Cirurgia" value={[c.descricao, c.ano].filter(Boolean).join(' · ')} />
        ))}
        {(a.medicamentos ?? []).map((m, i) => (
          <Item key={`m${i}`} label="Medicamento" value={[m.nome, m.dose].filter(Boolean).join(' · ')} />
        ))}
        <Item label="História familiar DCV" value={fmtBool(a.historia_familiar_dcv)} />
        <Item label="Tabagismo" value={a.tabagismo ? labelOf(TABAGISMO, a.tabagismo) : ''} />
        <Item label="Álcool" value={a.alcool ? labelOf(ALCOOL, a.alcool) : ''} />
      </Block>

      <Block title="Dor e musculoesquelético">
        {(a.dor_queixas ?? []).map((q, i) => (
          <Item
            key={`q${i}`}
            label={labelOf(REGIAO_DOR, q.regiao)}
            value={`${q.intensidade}/10 · ${q.tempo_evolucao ? labelOf(TEMPO_EVOLUCAO, q.tempo_evolucao) : ''}${
              q.lesao_previa_regiao ? ' · lesão prévia' : ''
            }`}
          />
        ))}
        <Item label="Red flags" value={labelsOf(RED_FLAGS, a.red_flags ?? [])} />
      </Block>

      <Block title="Hábitos e postural">
        <Item label="Ocupação" value={a.ocupacao} />
        <Item label="Horas sentado/dia" value={a.horas_sentado_dia} />
        <Item label="Sono (h)" value={a.sono_horas} />
        <Item label="Lado dominante" value={a.lado_dominante ? labelOf(LADO_DOMINANTE, a.lado_dominante) : ''} />
        <Item label="Alteração postural" value={labelsOf(ALTERACAO_POSTURAL, a.alteracao_postural_diagnosticada ?? [])} />
        <Item label="Queixa postural" value={a.queixa_postural_principal} />
      </Block>

      {a.gestante === true || a.pos_parto_recente === true ? (
        <Block title="Saúde da mulher">
          <Item label="Gestante" value={a.gestante ? `Sim${a.gestante_semanas ? ` · ${a.gestante_semanas} sem` : ''}` : ''} />
          <Item label="Pós-parto recente" value={a.pos_parto_recente ? `Sim${a.pos_parto_meses ? ` · ${a.pos_parto_meses} meses` : ''}` : ''} />
        </Block>
      ) : null}

      {a.observacoes ? (
        <div className="text-sm">
          <span className="block text-xs text-muted-foreground">Observações</span>
          <p className="whitespace-pre-wrap">{a.observacoes}</p>
        </div>
      ) : null}
    </div>
  )
}

const fmtBool = (v: boolean | null | undefined) => (v === true ? 'Sim' : v === false ? 'Não' : '')

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">{children}</CardContent>
    </Card>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}
