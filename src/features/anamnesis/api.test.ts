import { beforeEach, describe, expect, it, vi } from 'vitest'

// A edição precisa recalcular o gate a partir das respostas novas: se gravasse
// só o payload, as colunas liberado/nivel/flag (badge do perfil, flag do
// builder de treino) continuariam descrevendo as respostas antigas.

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  single: vi.fn(),
  eq: vi.fn(),
  // leitura usada só no caminho de erro, para distinguir "sumiu" de "mudou"
  maybeSingle: vi.fn(),
  select: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ update: mocks.update, select: mocks.select })),
  },
}))

import { setLiberacaoMedica, updateAnamnese } from './api'
import { emptyAnamnesis, PARQ_ITEMS, SPEC_VERSION } from './spec'
import type { AnamnesisAnswers } from './spec'

function allNoParq(): Record<string, boolean> {
  return Object.fromEntries(PARQ_ITEMS.map((i) => [i.key, false]))
}

function completeAnswers(patch: Partial<AnamnesisAnswers> = {}): AnamnesisAnswers {
  return {
    ...emptyAnamnesis(),
    parq: allNoParq(),
    ativo_regular: false,
    doenca_cmr_confirmada: true,
    sinais_sintomas_confirmados: true,
    medicamentos_confirmados: true,
    ...patch,
  }
}

beforeEach(() => {
  mocks.single.mockReset().mockResolvedValue({ data: { id: 'an-1' }, error: null })
  // `.eq()` encadeia: id e, quando há versão-base, updated_at
  mocks.eq.mockReset().mockImplementation(() => ({
    eq: mocks.eq,
    select: vi.fn(() => ({ single: mocks.single })),
  }))
  mocks.update.mockReset().mockReturnValue({ eq: mocks.eq })
  mocks.maybeSingle.mockReset().mockResolvedValue({ data: null, error: null })
  mocks.select
    .mockReset()
    .mockReturnValue({ eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })) })
})

function updatedRow(): Record<string, unknown> {
  return mocks.update.mock.calls[0][0] as Record<string, unknown>
}

describe('updateAnamnese', () => {
  it('recalcula o gate das respostas novas e grava a spec atual', async () => {
    const answers = completeAnswers({
      parq: { ...allNoParq(), cardio_dx: true },
      doenca_cmr: ['cardiovascular'],
      ativo_regular: false,
      declaracao_veracidade: true,
      consentimento_lgpd: true,
    })

    await updateAnamnese('an-1', { assessedAt: '2026-08-01', answers })

    const row = updatedRow()
    expect(row.assessed_at).toBe('2026-08-01')
    expect(row.spec_version).toBe(SPEC_VERSION)
    // PAR-Q com um "Sim" tira a liberação; doença CMR em quem não é ativo
    // manda buscar liberação antes de iniciar
    expect(row.liberado).toBe(false)
    expect(row.nivel_encaminhamento).toBe('antes_iniciar')
    expect(row.flag_encaminhamento).toBe(true)
    expect(mocks.eq).toHaveBeenCalledWith('id', 'an-1')
  })

  it('respostas limpas voltam a liberar (o gate não fica preso no valor antigo)', async () => {
    const answers = completeAnswers({ ativo_regular: true })

    await updateAnamnese('an-1', { assessedAt: '2026-08-01', answers })

    const row = updatedRow()
    expect(row.liberado).toBe(true)
    expect(row.nivel_encaminhamento).toBe('liberado')
    expect(row.flag_encaminhamento).toBe(false)
  })

  it('update que não pega linha nenhuma vira mensagem em pt-BR', async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    })

    await expect(
      updateAnamnese('an-1', {
        assessedAt: '2026-08-01',
        answers: completeAnswers(),
      })
    ).rejects.toThrow(/não está mais disponível para edição/)
  })

  it('filtra pela versão que a tela carregou quando ela é informada', async () => {
    await updateAnamnese('an-1', {
      assessedAt: '2026-08-01',
      answers: completeAnswers(),
      expectedUpdatedAt: '2026-08-26T09:00:00.000Z',
    })

    expect(mocks.eq).toHaveBeenCalledWith('id', 'an-1')
    expect(mocks.eq).toHaveBeenCalledWith('updated_at', '2026-08-26T09:00:00.000Z')
  })

  it('sem versão-base, o update continua filtrando só por id', async () => {
    await updateAnamnese('an-1', { assessedAt: '2026-08-01', answers: completeAnswers() })

    expect(mocks.eq).toHaveBeenCalledTimes(1)
    expect(mocks.eq).toHaveBeenCalledWith('id', 'an-1')
  })

  it('linha que ainda existe com outra versão vira aviso de conflito, não de sumiço', async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    })
    mocks.maybeSingle.mockResolvedValue({
      data: { updated_at: '2026-08-27T10:00:00.000Z' },
      error: null,
    })

    await expect(
      updateAnamnese('an-1', {
        assessedAt: '2026-08-01',
        answers: completeAnswers(),
        expectedUpdatedAt: '2026-08-26T09:00:00.000Z',
      })
    ).rejects.toThrow(/alterada em outro dispositivo/)
  })

  it('não tenta escrever as colunas congeladas por trigger', async () => {
    await updateAnamnese('an-1', {
      assessedAt: '2026-08-01',
      answers: completeAnswers(),
    })

    const row = updatedRow()
    expect(row).not.toHaveProperty('org_id')
    expect(row).not.toHaveProperty('subject_id')
    expect(row).not.toHaveProperty('evaluator_id')
  })

  it('recusa a persistência quando A1 ou A2 estão incompletas', async () => {
    await expect(
      updateAnamnese('an-1', {
        assessedAt: '2026-08-01',
        answers: emptyAnamnesis(),
      })
    ).rejects.toThrow(/Triagem incompleta/)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})

// O parecer médico é um fato separado da triagem: registrar não pode reescrever
// as colunas derivadas do payload, nem carimbar autoria pelo cliente (o
// servidor faz isso na 0029).
describe('setLiberacaoMedica', () => {
  it('grava só o bloco do parecer', async () => {
    await setLiberacaoMedica('an-1', {
      status: 'liberado_com_restricoes',
      em: '2026-08-20',
      validade: '2027-02-20',
      obs: '  Sem carga axial pesada  ',
    })

    const row = updatedRow()
    expect(row).toEqual({
      liberacao_medica: 'liberado_com_restricoes',
      liberacao_medica_em: '2026-08-20',
      liberacao_medica_validade: '2027-02-20',
      liberacao_medica_obs: 'Sem carga axial pesada',
    })
    expect(mocks.eq).toHaveBeenCalledWith('id', 'an-1')
  })

  it('retirar o registro zera o bloco inteiro', async () => {
    await setLiberacaoMedica('an-1', {
      status: 'pendente',
      em: '2026-08-20',
      validade: '2027-02-20',
      obs: 'ignorado',
    })

    expect(updatedRow()).toEqual({
      liberacao_medica: 'pendente',
      liberacao_medica_em: null,
      liberacao_medica_validade: null,
      liberacao_medica_obs: null,
    })
  })

  it('registro inválido não chega ao servidor', async () => {
    await expect(
      setLiberacaoMedica('an-1', {
        status: 'liberado',
        em: null,
        validade: null,
        obs: null,
      })
    ).rejects.toThrow(/data do parecer/)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('mensagem do trigger vira texto em pt-BR', async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        message: 'consentimento revogado: nao e possivel registrar parecer medico novo',
      },
    })

    await expect(
      setLiberacaoMedica('an-1', {
        status: 'liberado',
        em: '2026-08-20',
        validade: null,
        obs: null,
      })
    ).rejects.toThrow(/consentimento deste avaliado está revogado/)
  })
})
