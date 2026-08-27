import { NIVEL_LABEL, type GateSummary } from './gate'
import type { AnamnesisAnswers } from './spec'

// Liberação médica — o DESFECHO da triagem, registrado pelo profissional.
//
// A triagem (gate.ts) diz o que as RESPOSTAS indicam e é derivada do payload
// pelo banco; ela nunca muda porque o aluno voltou do médico. O que muda é
// este registro: o parecer que o médico emitiu depois. Os dois convivem, e é
// a combinação deles que decide o tom do aviso em cada tela — sem isto, um
// encaminhamento já resolvido continuaria gritando igual, que é a forma mais
// rápida de ensinar alguém a ignorar alerta clínico.
//
// Módulo puro: decide rótulo, tom e ressalvas; nenhuma tela repete essa
// lógica.

export type LiberacaoStatus =
  | 'pendente'
  | 'liberado'
  | 'liberado_com_restricoes'
  | 'nao_liberado'

export const LIBERACAO_OPCOES: { value: Exclude<LiberacaoStatus, 'pendente'>; label: string; desc: string }[] = [
  {
    value: 'liberado',
    label: 'Liberado',
    desc: 'O médico avaliou e liberou a prática, sem restrição registrada.',
  },
  {
    value: 'liberado_com_restricoes',
    label: 'Liberado com restrições',
    desc: 'Liberado, mas com limites que precisam aparecer na prescrição.',
  },
  {
    value: 'nao_liberado',
    label: 'Não liberado',
    desc: 'O médico avaliou e não liberou a prática por ora.',
  },
]

export const LIBERACAO_LABEL: Record<LiberacaoStatus, string> = {
  pendente: 'Sem parecer registrado',
  liberado: 'Liberado',
  liberado_com_restricoes: 'Liberado com restrições',
  nao_liberado: 'Não liberado',
}

export type Liberacao = {
  status: LiberacaoStatus
  /** data do parecer/atestado (YYYY-MM-DD) */
  em: string | null
  /** validade do documento, quando houver (YYYY-MM-DD) */
  validade: string | null
  /** restrições e observações do parecer */
  obs: string | null
  /** quando o registro entrou no Avalix (ISO) */
  registradaEm: string | null
}

export const SEM_LIBERACAO: Liberacao = {
  status: 'pendente',
  em: null,
  validade: null,
  obs: null,
  registradaEm: null,
}

export type LiberacaoRow = {
  liberacao_medica: string
  liberacao_medica_em: string | null
  liberacao_medica_validade: string | null
  liberacao_medica_obs: string | null
  liberacao_medica_registrada_em: string | null
}

const STATUS: LiberacaoStatus[] = [
  'pendente',
  'liberado',
  'liberado_com_restricoes',
  'nao_liberado',
]

export function liberacaoFromRow(row: LiberacaoRow): Liberacao {
  // Status desconhecido (linha de uma versão futura, coluna adulterada) cai em
  // 'pendente': o desconhecido nunca abranda um aviso.
  const status = STATUS.find((s) => s === row.liberacao_medica) ?? 'pendente'
  if (status === 'pendente') return SEM_LIBERACAO
  return {
    status,
    em: row.liberacao_medica_em,
    validade: row.liberacao_medica_validade,
    obs: row.liberacao_medica_obs,
    registradaEm: row.liberacao_medica_registrada_em,
  }
}

// ---- declaração do avaliado (A3) ---------------------------------------
// Autorrelato, não documento: nunca libera nada sozinho. Existe para o
// profissional saber que há um papel a pedir — e para o aviso dizer isso em
// vez de repetir "procure um médico" a quem já procurou.

export type Declaracao = { declarada: boolean | null; em: string | null }

export const SEM_DECLARACAO: Declaracao = { declarada: null, em: null }

export function declaracaoFromAnswers(a: AnamnesisAnswers | null | undefined): Declaracao {
  if (!a) return SEM_DECLARACAO
  return {
    declarada: a.liberacao_declarada ?? null,
    em: a.liberacao_declarada_em || null,
  }
}

// ---- datas -------------------------------------------------------------
// Datas do banco são 'YYYY-MM-DD' e comparam bem como texto; passar por Date
// só deslocaria o dia pelo fuso.

export function todayIso(now: Date = new Date()): string {
  const mm = `${now.getMonth() + 1}`.padStart(2, '0')
  const dd = `${now.getDate()}`.padStart(2, '0')
  return `${now.getFullYear()}-${mm}-${dd}`
}

export function formatDataBr(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

// ---- estado resolvido --------------------------------------------------

export type LiberacaoResolvida = Liberacao & {
  /** havia liberação, mas a validade do documento passou */
  vencida: boolean
  /** liberação (com ou sem restrições) dentro da validade */
  vigente: boolean
  /** o parecer é anterior à data da anamnese */
  anteriorAAnamnese: boolean
  /** a anamnese foi editada depois de o parecer ser registrado */
  anamneseEditadaDepois: boolean
}

export type ResolveContexto = {
  /** data da anamnese (YYYY-MM-DD) */
  assessedAt?: string | null
  /** updated_at da anamnese (ISO) */
  updatedAt?: string | null
  today?: string
}

// Tolerância igual à usada para marcar "editada" no detalhe: o próprio update
// que grava o parecer também mexe em updated_at, e os dois carimbos saem do
// mesmo instante de transação.
const EDICAO_TOLERANCIA_MS = 60_000

export function resolveLiberacao(l: Liberacao, ctx: ResolveContexto = {}): LiberacaoResolvida {
  const today = ctx.today ?? todayIso()
  const liberou = l.status === 'liberado' || l.status === 'liberado_com_restricoes'
  const vencida = liberou && l.validade != null && l.validade < today
  const editadaDepois =
    l.registradaEm != null &&
    ctx.updatedAt != null &&
    Date.parse(ctx.updatedAt) - Date.parse(l.registradaEm) > EDICAO_TOLERANCIA_MS

  return {
    ...l,
    vencida,
    vigente: liberou && !vencida,
    anteriorAAnamnese: l.em != null && !!ctx.assessedAt && l.em < ctx.assessedAt,
    anamneseEditadaDepois: editadaDepois,
  }
}

// ---- alerta combinado --------------------------------------------------

export type AlertaNivel = 'ok' | 'info' | 'atencao' | 'critico'
export type BadgeVariant = 'default' | 'secondary' | 'success' | 'warn' | 'destructive'

export type AnamneseAlerta = {
  nivel: AlertaNivel
  titulo: string
  /** linhas principais do aviso */
  linhas: string[]
  /** ressalvas discretas: o parecer pode não cobrir o quadro atual */
  ressalvas: string[]
  badge: { label: string; variant: BadgeVariant }
  /** a triagem pediu parecer médico (há o que liberar) */
  pedeLiberacao: boolean
  /** os motivos da triagem merecem destaque, ou já podem ficar recolhidos */
  destacarMotivos: boolean
  liberacao: LiberacaoResolvida
  declaracao: Declaracao
}

function linhaParecer(l: LiberacaoResolvida): string {
  const em = formatDataBr(l.em)
  const base = em ? `Parecer de ${em}` : 'Parecer registrado'
  return l.validade ? `${base} · válido até ${formatDataBr(l.validade)}` : base
}

export function anamneseAlerta(input: {
  gate: GateSummary
  liberacao?: Liberacao
  declaracao?: Declaracao
  assessedAt?: string | null
  updatedAt?: string | null
  today?: string
}): AnamneseAlerta {
  const { gate } = input
  const declaracao = input.declaracao ?? SEM_DECLARACAO
  const l = resolveLiberacao(input.liberacao ?? SEM_LIBERACAO, {
    assessedAt: input.assessedAt,
    updatedAt: input.updatedAt,
    today: input.today,
  })

  const pedeLiberacao =
    gate.status !== 'incompleto' && (!gate.liberado || gate.flagEncaminhamento)
  const nivelLinha =
    gate.status !== 'incompleto' && gate.nivelEncaminhamento !== 'liberado'
      ? NIVEL_LABEL[gate.nivelEncaminhamento]
      : null

  const ressalvas: string[] = []
  if (l.status !== 'pendente') {
    if (l.anteriorAAnamnese) {
      ressalvas.push(
        'O parecer é anterior à data desta anamnese — confirme se ele cobre as respostas atuais.'
      )
    }
    if (l.anamneseEditadaDepois) {
      ressalvas.push(
        'A anamnese foi editada depois deste registro — confirme se o parecer ainda se aplica.'
      )
    }
  }

  const base = { ressalvas, pedeLiberacao, liberacao: l, declaracao }

  // Recusa médica é o mais forte que existe aqui: vale mesmo sobre triagem
  // limpa ou incompleta.
  if (l.status === 'nao_liberado') {
    return {
      ...base,
      nivel: 'critico',
      titulo: 'Médico não liberou a prática',
      linhas: [linhaParecer(l), ...(l.obs ? [l.obs] : [])],
      badge: { label: 'Sem liberação médica', variant: 'destructive' },
      destacarMotivos: true,
    }
  }

  if (gate.status === 'incompleto') {
    return {
      ...base,
      nivel: 'atencao',
      titulo: 'Triagem incompleta — liberação não calculada',
      linhas: [],
      badge: { label: 'Incompleta', variant: 'secondary' },
      destacarMotivos: true,
    }
  }

  if (!pedeLiberacao) {
    return {
      ...base,
      nivel: 'ok',
      titulo: 'Liberado para avaliação',
      linhas: l.vigente ? [linhaParecer(l)] : [],
      badge: { label: 'Liberado', variant: 'success' },
      destacarMotivos: false,
    }
  }

  if (l.vencida) {
    return {
      ...base,
      nivel: 'atencao',
      titulo: 'Liberação médica vencida',
      linhas: [
        `${linhaParecer(l)} — peça um documento atualizado.`,
        ...(nivelLinha ? [nivelLinha] : []),
      ],
      badge: { label: 'Liberação vencida', variant: 'warn' },
      destacarMotivos: true,
    }
  }

  if (l.status === 'liberado') {
    return {
      ...base,
      nivel: 'ok',
      titulo: 'Liberado pelo médico',
      linhas: [linhaParecer(l), ...(l.obs ? [l.obs] : [])],
      badge: { label: 'Liberado pelo médico', variant: 'success' },
      destacarMotivos: false,
    }
  }

  if (l.status === 'liberado_com_restricoes') {
    return {
      ...base,
      nivel: 'info',
      titulo: 'Liberado pelo médico, com restrições',
      // a restrição vem primeiro: é ela que muda a prescrição
      linhas: [...(l.obs ? [l.obs] : []), linhaParecer(l)],
      badge: { label: 'Liberado com restrições', variant: 'default' },
      destacarMotivos: false,
    }
  }

  // Declarado pelo aluno e ainda não confirmado: o tom sai do alarme, mas NÃO
  // vai para o verde — quem liberou foi o autorrelato, não um documento. O
  // aviso vira uma tarefa concreta: pedir o papel e registrar.
  if (declaracao.declarada === true) {
    const quando = declaracao.em ? ` em ${formatDataBr(declaracao.em)}` : ''
    return {
      ...base,
      nivel: 'info',
      titulo: 'Aluno declara liberação médica — confirme',
      linhas: [
        `Ele respondeu na anamnese que um médico o liberou${quando}. Peça o documento e registre a liberação para o aviso refletir isso.`,
        ...(nivelLinha ? [nivelLinha] : []),
      ],
      badge: { label: 'Liberação declarada', variant: 'default' },
      destacarMotivos: true,
    }
  }

  return {
    ...base,
    nivel: 'atencao',
    titulo: 'Atenção: encaminhamento recomendado',
    linhas: nivelLinha ? [nivelLinha] : [],
    badge: { label: 'Encaminhamento', variant: 'warn' },
    destacarMotivos: true,
  }
}

// ---- validação do registro --------------------------------------------
// Espelha as regras do trigger `app.anamnese_liberacao_guard` (migration
// 0029). O banco continua sendo a autoridade; isto existe para o profissional
// ver o erro no campo, em português, antes de gastar uma ida ao servidor.

export const LIBERACAO_OBS_MAX = 2000

export type LiberacaoInput = {
  status: LiberacaoStatus
  em: string | null
  validade: string | null
  obs: string | null
}

export function validarLiberacao(input: LiberacaoInput, today: string = todayIso()): string | null {
  if (input.status === 'pendente') return null
  if (!input.em) return 'Informe a data do parecer médico.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.em)) return 'Data do parecer inválida.'
  if (input.em > today) return 'A data do parecer não pode estar no futuro.'
  if (input.validade) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.validade)) return 'Data de validade inválida.'
    if (input.validade < input.em) return 'A validade não pode ser anterior à data do parecer.'
  }
  const obs = (input.obs ?? '').trim()
  if (input.status === 'liberado_com_restricoes' && obs.length < 3) {
    return 'Descreva as restrições indicadas pelo médico.'
  }
  if (obs.length > LIBERACAO_OBS_MAX) {
    return `As observações do parecer passam de ${LIBERACAO_OBS_MAX} caracteres.`
  }
  return null
}

// Classes por nível, num só lugar: as caixas de aviso da triagem (GateBox,
// banner do builder) precisam combinar entre si.
export const ALERTA_CLASSES: Record<AlertaNivel, string> = {
  ok: 'border-success/40 bg-success/10',
  info: 'border-primary/40 bg-primary/[0.07]',
  atencao: 'border-warning/40 bg-warning/10',
  critico: 'border-destructive/40 bg-destructive/10',
}

export const ALERTA_ICON_CLASSES: Record<AlertaNivel, string> = {
  ok: 'text-success',
  info: 'text-primary',
  atencao: 'text-warning',
  critico: 'text-destructive',
}
