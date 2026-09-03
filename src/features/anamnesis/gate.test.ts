import { describe, it, expect } from 'vitest'
import { computeGate, medicamentosRespondidos } from './gate'
import { emptyAnamnesis, type AnamnesisAnswers } from './spec'

// base "saudável": PAR-Q todo Não, sem doença/sintomas
function base(): AnamnesisAnswers {
  const a = emptyAnamnesis()
  for (const k of Object.keys(a.parq)) a.parq[k] = false
  a.ativo_regular = false
  a.doenca_cmr_confirmada = true
  a.sinais_sintomas_confirmados = true
  return a
}

describe('computeGate — PAR-Q', () => {
  it('todos Não → liberado, sem flag', () => {
    const r = computeGate(base())
    expect(r.status).toBe('liberado')
    expect(r.liberado).toBe(true)
    expect(r.flagEncaminhamento).toBe(false)
  })
  it('qualquer Sim → não liberado e com flag', () => {
    const a = base()
    a.parq.cardio_dx = true
    const r = computeGate(a)
    expect(r.status).toBe('encaminhamento')
    expect(r.liberado).toBe(false)
    expect(r.flagEncaminhamento).toBe(true)
  })
})

describe('computeGate — respostas incompletas', () => {
  it('falha fechado quando o PAR-Q não foi respondido', () => {
    const r = computeGate(emptyAnamnesis())
    expect(r.status).toBe('incompleto')
    expect(r.liberado).toBe(false)
    expect(r.nivelEncaminhamento).toBe('antes_iniciar')
  })

  it('não reinterpreta arrays vazios como confirmação de ausência', () => {
    const a = base()
    a.doenca_cmr_confirmada = false
    a.sinais_sintomas_confirmados = false

    const r = computeGate(a)
    expect(r.status).toBe('incompleto')
    expect(r.liberado).toBe(false)
    expect(r.motivos.join(' ')).toContain('doenças diagnosticadas')
    expect(r.motivos.join(' ')).toContain('sinais e sintomas atuais')
  })
})

describe('computeGate — matriz ACSM', () => {
  it('sintomas presentes → antes_iniciar', () => {
    const a = base()
    a.sinais_sintomas = ['dispneia']
    expect(computeGate(a).nivelEncaminhamento).toBe('antes_iniciar')
  })
  it('doença CMR + inativo → antes_iniciar', () => {
    const a = base()
    a.doenca_cmr = ['metabolica']
    a.ativo_regular = false
    expect(computeGate(a).nivelEncaminhamento).toBe('antes_iniciar')
  })
  it('doença CMR + ativo → antes_vigorosa', () => {
    const a = base()
    a.doenca_cmr = ['cardiovascular']
    a.ativo_regular = true
    expect(computeGate(a).nivelEncaminhamento).toBe('antes_vigorosa')
  })
  it('sem doença, sem sintomas → liberado (ativo ou inativo)', () => {
    const a = base()
    a.ativo_regular = true
    expect(computeGate(a).nivelEncaminhamento).toBe('liberado')
    a.ativo_regular = false
    expect(computeGate(a).nivelEncaminhamento).toBe('liberado')
  })
})

describe('computeGate — red flags e gestação levantam flag', () => {
  it('red flag de coluna', () => {
    const a = base()
    a.red_flags = ['deficit_neuro']
    expect(computeGate(a).flagEncaminhamento).toBe(true)
  })
  it('gestante', () => {
    const a = base()
    a.gestante = true
    expect(computeGate(a).flagEncaminhamento).toBe(true)
  })
})

describe('medicamentos em uso — obrigatório, mas fora da triagem', () => {
  it('lista vazia sem confirmação é pergunta não respondida', () => {
    expect(medicamentosRespondidos(base())).toBe(false)
  })

  it('“não usa nenhum” confirmado responde a pergunta', () => {
    const a = base()
    a.medicamentos_confirmados = true
    expect(medicamentosRespondidos(a)).toBe(true)
  })

  it('linha em branco na lista não conta como resposta', () => {
    const a = base()
    a.medicamentos = [{ nome: '  ', dose: '' }]
    a.medicamentos_confirmados = true
    expect(medicamentosRespondidos(a)).toBe(false)
    a.medicamentos = [{ nome: 'levotiroxina', dose: '75 mcg' }]
    expect(medicamentosRespondidos(a)).toBe(true)
  })

  // Se entrasse no gate, anamnese antiga (gravada antes de o campo existir)
  // apareceria como encaminhamento por falta de preenchimento, e o nível ACSM
  // de quem não respondeu mudaria sem nenhum sinal clínico novo.
  it('não altera o resultado da triagem', () => {
    const semResposta = computeGate(base())
    const a = base()
    a.medicamentos_confirmados = true
    a.medicamentos = [{ nome: 'metformina', dose: '850 mg' }]
    expect(computeGate(a)).toEqual(semResposta)
  })
})
