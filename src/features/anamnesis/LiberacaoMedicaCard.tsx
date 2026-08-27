import { useId, useState } from 'react'
import { Stethoscope } from 'lucide-react'
import {
  anamneseAlerta,
  declaracaoFromAnswers,
  formatDataBr,
  liberacaoFromRow,
  todayIso,
  validarLiberacao,
  LIBERACAO_LABEL,
  LIBERACAO_OBS_MAX,
  LIBERACAO_OPCOES,
  type LiberacaoInput,
  type LiberacaoStatus,
} from './clearance'
import { gateFromRow } from './gate'
import type { AnamnesisAnswers } from './spec'
import { useSetLiberacaoMedica } from './hooks'
import type { AnamneseRow } from './api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { controlClass } from '@/lib/ui'
import { normalizeDbError } from '../../lib/errors'

function formatDataHora(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR')
}

// Registro do parecer médico sobre UMA anamnese. Aparece só quando há o que
// liberar (triagem apontou encaminhamento) ou quando já existe registro — numa
// triagem limpa seria um campo sem pergunta.
//
// O que se grava aqui não altera a triagem: as colunas derivadas do payload
// continuam contando o que as respostas disseram. É o desfecho que muda de
// tom, não o exame.
export function LiberacaoMedicaCard({
  subjectId,
  anamnese,
  answers,
}: {
  subjectId: string
  anamnese: AnamneseRow
  answers?: AnamnesisAnswers
}) {
  const liberacao = liberacaoFromRow(anamnese)
  const declaracao = declaracaoFromAnswers(answers)
  const alerta = anamneseAlerta({
    gate: gateFromRow(anamnese),
    liberacao,
    declaracao,
    assessedAt: anamnese.assessed_at,
    updatedAt: anamnese.updated_at,
  })

  const salvar = useSetLiberacaoMedica(subjectId, anamnese.id)
  const [editando, setEditando] = useState(false)
  const [confirmandoRetirada, setConfirmandoRetirada] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [form, setForm] = useState<{
    status: Exclude<LiberacaoStatus, 'pendente'>
    em: string
    validade: string
    obs: string
  }>(() => ({
    status: liberacao.status === 'pendente' ? 'liberado' : liberacao.status,
    em: liberacao.em ?? declaracao.em ?? todayIso(),
    validade: liberacao.validade ?? '',
    obs: liberacao.obs ?? '',
  }))

  const ids = useId()
  const registrado = liberacao.status !== 'pendente'

  if (!alerta.pedeLiberacao && !registrado) return null

  function abrirEdicao() {
    setForm({
      status: liberacao.status === 'pendente' ? 'liberado' : liberacao.status,
      em: liberacao.em ?? declaracao.em ?? todayIso(),
      validade: liberacao.validade ?? '',
      obs: liberacao.obs ?? '',
    })
    setErro(null)
    setConfirmandoRetirada(false)
    setEditando(true)
  }

  function enviar(input: LiberacaoInput, aoTerminar: () => void) {
    setErro(null)
    salvar.mutate(input, {
      onSuccess: aoTerminar,
      onError: (e) => setErro(normalizeDbError(e)),
    })
  }

  function submit() {
    const input: LiberacaoInput = {
      status: form.status,
      em: form.em || null,
      validade: form.validade || null,
      obs: form.obs,
    }
    const invalido = validarLiberacao(input)
    if (invalido) {
      setErro(invalido)
      return
    }
    enviar(input, () => setEditando(false))
  }

  return (
    <Card id="liberacao-medica">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Stethoscope className="size-4 text-muted-foreground" />
          Liberação médica
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {registrado && !editando ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={alerta.badge.variant}>{LIBERACAO_LABEL[liberacao.status]}</Badge>
              <span className="text-sm text-muted-foreground">
                Parecer de {formatDataBr(liberacao.em)}
                {liberacao.validade ? ` · válido até ${formatDataBr(liberacao.validade)}` : ''}
              </span>
            </div>
            {liberacao.obs ? <p className="text-sm whitespace-pre-wrap">{liberacao.obs}</p> : null}
            {alerta.liberacao.vencida ? (
              <p className="text-sm text-warning">
                Este parecer venceu — peça um documento atualizado.
              </p>
            ) : null}
            {alerta.ressalvas.map((r, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                {r}
              </p>
            ))}
            <p className="text-xs text-muted-foreground">
              Registrado no Avalix em {formatDataHora(liberacao.registradaEm)}. A triagem original
              permanece intacta no histórico.
            </p>
          </div>
        ) : null}

        {!registrado && !editando ? (
          <div className="space-y-1.5 text-sm text-muted-foreground">
            <p>
              A triagem indicou avaliação médica antes de progredir. Se o aluno já foi avaliado e
              trouxe o parecer, registre aqui — os avisos passam a refletir o que o médico decidiu.
            </p>
            {declaracao.declarada === true ? (
              <p className="text-foreground">
                Na anamnese, ele declarou ter sido liberado por um médico
                {declaracao.em ? ` em ${formatDataBr(declaracao.em)}` : ''}. Isso é autorrelato:
                confirme com o documento antes de registrar.
              </p>
            ) : null}
          </div>
        ) : null}

        {editando ? (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">O que o médico decidiu</legend>
              {LIBERACAO_OPCOES.map((op) => (
                <label
                  key={op.value}
                  className={[
                    'flex cursor-pointer gap-3 rounded-md border p-3 transition-colors',
                    form.status === op.value
                      ? 'border-primary bg-primary/[0.06]'
                      : 'hover:bg-accent',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name={`${ids}-status`}
                    className="mt-1 size-4 accent-[var(--primary)]"
                    checked={form.status === op.value}
                    onChange={() => setForm((f) => ({ ...f, status: op.value }))}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{op.label}</span>
                    <span className="block text-xs text-muted-foreground">{op.desc}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${ids}-em`}>Data do parecer</Label>
                <Input
                  id={`${ids}-em`}
                  type="date"
                  max={todayIso()}
                  value={form.em}
                  onChange={(e) => setForm((f) => ({ ...f, em: e.target.value }))}
                />
              </div>
              {form.status === 'nao_liberado' ? null : (
                <div className="space-y-1.5">
                  <Label htmlFor={`${ids}-validade`}>Validade (opcional)</Label>
                  <Input
                    id={`${ids}-validade`}
                    type="date"
                    min={form.em || undefined}
                    value={form.validade}
                    onChange={(e) => setForm((f) => ({ ...f, validade: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Vencida, a triagem volta a avisar.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${ids}-obs`}>
                {form.status === 'liberado_com_restricoes'
                  ? 'Restrições indicadas pelo médico'
                  : 'Observações (opcional)'}
              </Label>
              <textarea
                id={`${ids}-obs`}
                rows={3}
                maxLength={LIBERACAO_OBS_MAX}
                className={controlClass}
                placeholder="Ex.: profissional que emitiu, limites de intensidade, prazo de reavaliação."
                value={form.obs}
                onChange={(e) => setForm((f) => ({ ...f, obs: e.target.value }))}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={submit} disabled={salvar.isPending}>
                {salvar.isPending ? 'Salvando...' : 'Salvar parecer'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditando(false)
                  setErro(null)
                }}
                disabled={salvar.isPending}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={registrado ? 'outline' : 'default'} onClick={abrirEdicao}>
              {registrado ? 'Editar parecer' : 'Registrar liberação médica'}
            </Button>
            {registrado ? (
              confirmandoRetirada ? (
                <>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={salvar.isPending}
                    onClick={() =>
                      enviar(
                        { status: 'pendente', em: null, validade: null, obs: null },
                        () => setConfirmandoRetirada(false)
                      )
                    }
                  >
                    {salvar.isPending ? 'Retirando...' : 'Confirmar retirada'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmandoRetirada(false)}
                    disabled={salvar.isPending}
                  >
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmandoRetirada(true)}
                >
                  Retirar registro
                </Button>
              )
            ) : null}
          </div>
        )}

        {confirmandoRetirada && !editando ? (
          <p className="text-xs text-muted-foreground">
            Retirar apaga o parecer registrado e faz os avisos de encaminhamento voltarem ao tom
            original. A alteração fica na trilha de auditoria.
          </p>
        ) : null}

        {erro ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Registro do que um profissional de saúde decidiu, feito por você — o Avalix não emite nem
          valida atestado. Guarde o documento original conforme sua rotina.
        </p>
      </CardContent>
    </Card>
  )
}
