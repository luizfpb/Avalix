import { describe, expect, it } from 'vitest'
import {
  anamneseAlerta,
  formatDataBr,
  liberacaoFromRow,
  resolveLiberacao,
  SEM_LIBERACAO,
  todayIso,
  type Liberacao,
} from './clearance'
import { gateFromRow, type GateSummary } from './gate'

const HOJE = '2026-08-27'

// Triagem que pede parecer: PAR-Q com "Sim" e doença CMR em quem não é ativo.
const COM_FLAG: GateSummary = {
  status: 'encaminhamento',
  liberado: false,
  nivelEncaminhamento: 'antes_iniciar',
  flagEncaminhamento: true,
}

const LIMPA: GateSummary = {
  status: 'liberado',
  liberado: true,
  nivelEncaminhamento: 'liberado',
  flagEncaminhamento: false,
}

function liberacao(patch: Partial<Liberacao> = {}): Liberacao {
  return {
    status: 'liberado',
    em: '2026-08-20',
    validade: null,
    obs: null,
    registradaEm: '2026-08-20T12:00:00.000Z',
    ...patch,
  }
}

describe('liberacaoFromRow', () => {
  it('lê as colunas do registro', () => {
    expect(
      liberacaoFromRow({
        liberacao_medica: 'liberado_com_restricoes',
        liberacao_medica_em: '2026-08-01',
        liberacao_medica_validade: '2027-02-01',
        liberacao_medica_obs: 'Sem carga axial pesada',
        liberacao_medica_registrada_em: '2026-08-02T10:00:00.000Z',
      })
    ).toEqual({
      status: 'liberado_com_restricoes',
      em: '2026-08-01',
      validade: '2027-02-01',
      obs: 'Sem carga axial pesada',
      registradaEm: '2026-08-02T10:00:00.000Z',
    })
  })

  it('status desconhecido não abranda aviso nenhum: vira pendente', () => {
    expect(
      liberacaoFromRow({
        liberacao_medica: 'liberado_pelo_treinador',
        liberacao_medica_em: '2026-08-01',
        liberacao_medica_validade: null,
        liberacao_medica_obs: 'texto qualquer',
        liberacao_medica_registrada_em: '2026-08-01T10:00:00.000Z',
      })
    ).toEqual(SEM_LIBERACAO)
  })
})

describe('resolveLiberacao', () => {
  it('validade no futuro mantém o parecer vigente', () => {
    const r = resolveLiberacao(liberacao({ validade: '2026-09-01' }), { today: HOJE })
    expect(r.vencida).toBe(false)
    expect(r.vigente).toBe(true)
  })

  it('o último dia de validade ainda vale', () => {
    const r = resolveLiberacao(liberacao({ validade: HOJE }), { today: HOJE })
    expect(r.vencida).toBe(false)
  })

  it('validade no passado vence a liberação', () => {
    const r = resolveLiberacao(liberacao({ validade: '2026-08-26' }), { today: HOJE })
    expect(r.vencida).toBe(true)
    expect(r.vigente).toBe(false)
  })

  it('parecer anterior à anamnese é sinalizado', () => {
    const r = resolveLiberacao(liberacao({ em: '2026-06-01' }), {
      assessedAt: '2026-08-10',
      today: HOJE,
    })
    expect(r.anteriorAAnamnese).toBe(true)
  })

  it('edição posterior da anamnese é sinalizada, com tolerância para o próprio salvamento', () => {
    const l = liberacao({ registradaEm: '2026-08-20T12:00:00.000Z' })
    expect(
      resolveLiberacao(l, { updatedAt: '2026-08-20T12:00:30.000Z', today: HOJE })
        .anamneseEditadaDepois
    ).toBe(false)
    expect(
      resolveLiberacao(l, { updatedAt: '2026-08-25T09:00:00.000Z', today: HOJE })
        .anamneseEditadaDepois
    ).toBe(true)
  })
})

describe('anamneseAlerta', () => {
  it('sem parecer, o encaminhamento continua avisando como hoje', () => {
    const a = anamneseAlerta({ gate: COM_FLAG, today: HOJE })
    expect(a.nivel).toBe('atencao')
    expect(a.badge.label).toBe('Encaminhamento')
    expect(a.pedeLiberacao).toBe(true)
    expect(a.destacarMotivos).toBe(true)
    expect(a.linhas).toContain('Liberação médica antes de iniciar')
  })

  it('liberação registrada troca o tom e recolhe os motivos da triagem', () => {
    const a = anamneseAlerta({ gate: COM_FLAG, liberacao: liberacao(), today: HOJE })
    expect(a.nivel).toBe('ok')
    expect(a.titulo).toBe('Liberado pelo médico')
    expect(a.badge).toEqual({ label: 'Liberado pelo médico', variant: 'success' })
    expect(a.destacarMotivos).toBe(false)
    expect(a.linhas[0]).toBe('Parecer de 20/08/2026')
  })

  it('restrições ficam visíveis e em primeiro lugar, num tom informativo', () => {
    const a = anamneseAlerta({
      gate: COM_FLAG,
      liberacao: liberacao({
        status: 'liberado_com_restricoes',
        obs: 'Sem exercício vigoroso por 60 dias',
        validade: '2026-12-31',
      }),
      today: HOJE,
    })
    expect(a.nivel).toBe('info')
    expect(a.linhas[0]).toBe('Sem exercício vigoroso por 60 dias')
    expect(a.linhas[1]).toBe('Parecer de 20/08/2026 · válido até 31/12/2026')
    expect(a.badge.label).toBe('Liberado com restrições')
  })

  it('liberação vencida devolve o aviso, dizendo por quê', () => {
    const a = anamneseAlerta({
      gate: COM_FLAG,
      liberacao: liberacao({ validade: '2026-07-01' }),
      today: HOJE,
    })
    expect(a.nivel).toBe('atencao')
    expect(a.badge.label).toBe('Liberação vencida')
    expect(a.destacarMotivos).toBe(true)
    expect(a.linhas[0]).toContain('válido até 01/07/2026')
    expect(a.linhas).toContain('Liberação médica antes de iniciar')
  })

  it('recusa médica é o aviso mais forte, mesmo com triagem limpa', () => {
    const a = anamneseAlerta({
      gate: LIMPA,
      liberacao: liberacao({ status: 'nao_liberado', obs: 'Reavaliar em 90 dias' }),
      today: HOJE,
    })
    expect(a.nivel).toBe('critico')
    expect(a.badge.variant).toBe('destructive')
    expect(a.linhas).toContain('Reavaliar em 90 dias')
  })

  it('triagem limpa não inventa pendência de parecer', () => {
    const a = anamneseAlerta({ gate: LIMPA, today: HOJE })
    expect(a.nivel).toBe('ok')
    expect(a.pedeLiberacao).toBe(false)
    expect(a.badge.label).toBe('Liberado')
    expect(a.linhas).toEqual([])
  })

  it('triagem incompleta continua sem liberação calculada', () => {
    const a = anamneseAlerta({
      gate: {
        status: 'incompleto',
        liberado: false,
        nivelEncaminhamento: 'antes_iniciar',
        flagEncaminhamento: false,
      },
      today: HOJE,
    })
    expect(a.badge.label).toBe('Incompleta')
    expect(a.pedeLiberacao).toBe(false)
    expect(a.titulo).toContain('incompleta')
  })

  it('parecer que pode não cobrir o quadro atual vira ressalva, sem voltar a alarmar', () => {
    const a = anamneseAlerta({
      gate: COM_FLAG,
      liberacao: liberacao({ em: '2026-05-01' }),
      assessedAt: '2026-08-10',
      updatedAt: '2026-08-26T09:00:00.000Z',
      today: HOJE,
    })
    expect(a.nivel).toBe('ok')
    expect(a.ressalvas).toHaveLength(2)
    expect(a.ressalvas[0]).toContain('anterior à data desta anamnese')
    expect(a.ressalvas[1]).toContain('editada depois')
  })

  it('declaração do aluno tira do alarme, mas não pinta de verde', () => {
    const a = anamneseAlerta({
      gate: COM_FLAG,
      declaracao: { declarada: true, em: '2026-07-10' },
      today: HOJE,
    })
    expect(a.nivel).toBe('info')
    expect(a.titulo).toBe('Aluno declara liberação médica — confirme')
    expect(a.badge.label).toBe('Liberação declarada')
    // os motivos da triagem continuam em destaque: nada foi confirmado
    expect(a.destacarMotivos).toBe(true)
    expect(a.linhas[0]).toContain('10/07/2026')
    expect(a.linhas).toContain('Liberação médica antes de iniciar')
  })

  it('declaração não sobrepõe parecer registrado nem recusa médica', () => {
    const declarou = { declarada: true, em: '2026-07-10' }
    expect(
      anamneseAlerta({ gate: COM_FLAG, liberacao: liberacao(), declaracao: declarou, today: HOJE })
        .titulo
    ).toBe('Liberado pelo médico')
    expect(
      anamneseAlerta({
        gate: COM_FLAG,
        liberacao: liberacao({ status: 'nao_liberado' }),
        declaracao: declarou,
        today: HOJE,
      }).nivel
    ).toBe('critico')
  })

  it('declarar "não" ou não responder mantém o aviso original', () => {
    for (const declarada of [false, null]) {
      const a = anamneseAlerta({ gate: COM_FLAG, declaracao: { declarada, em: null }, today: HOJE })
      expect(a.nivel).toBe('atencao')
      expect(a.badge.label).toBe('Encaminhamento')
    }
  })

  it('sem parecer registrado não há ressalva a fazer', () => {
    const a = anamneseAlerta({
      gate: COM_FLAG,
      assessedAt: '2026-08-10',
      updatedAt: '2026-08-26T09:00:00.000Z',
      today: HOJE,
    })
    expect(a.ressalvas).toEqual([])
  })
})

describe('gateFromRow', () => {
  it('deriva o status da linha salva', () => {
    expect(
      gateFromRow({ liberado: true, nivel_encaminhamento: 'liberado', flag_encaminhamento: false })
        .status
    ).toBe('liberado')
    expect(
      gateFromRow({ liberado: true, nivel_encaminhamento: 'liberado', flag_encaminhamento: true })
        .status
    ).toBe('encaminhamento')
  })

  it('nível fora do domínio cai no mais restritivo', () => {
    expect(
      gateFromRow({ liberado: false, nivel_encaminhamento: 'talvez', flag_encaminhamento: true })
        .nivelEncaminhamento
    ).toBe('antes_iniciar')
  })
})

describe('datas', () => {
  it('formata sem passar por Date (o fuso não desloca o dia)', () => {
    expect(formatDataBr('2026-01-01')).toBe('01/01/2026')
    expect(formatDataBr(null)).toBe('')
  })

  it('todayIso usa o dia local', () => {
    expect(todayIso(new Date(2026, 7, 27, 23, 30))).toBe('2026-08-27')
  })
})
