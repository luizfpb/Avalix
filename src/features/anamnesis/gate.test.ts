import { describe, it, expect } from 'vitest'
import { computeGate } from './gate'
import { emptyAnamnesis, type AnamnesisAnswers } from './spec'

// base "saudável": PAR-Q todo Não, sem doença/sintomas
function base(): AnamnesisAnswers {
  const a = emptyAnamnesis()
  for (const k of Object.keys(a.parq)) a.parq[k] = false
  return a
}

describe('computeGate — PAR-Q', () => {
  it('todos Não → liberado, sem flag', () => {
    const r = computeGate(base())
    expect(r.liberado).toBe(true)
    expect(r.flagEncaminhamento).toBe(false)
  })
  it('qualquer Sim → não liberado e com flag', () => {
    const a = base()
    a.parq.cardio_dx = true
    const r = computeGate(a)
    expect(r.liberado).toBe(false)
    expect(r.flagEncaminhamento).toBe(true)
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
