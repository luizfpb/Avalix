import { describe, it, expect } from 'vitest'
import { emptyAnamnesis, parseAnswers } from './spec'

describe('parseAnswers — compatibilidade entre versões da spec', () => {
  it('payload vazio/nulo vira anamnese vazia', () => {
    expect(parseAnswers(null)).toEqual(emptyAnamnesis())
    expect(parseAnswers(undefined)).toEqual(emptyAnamnesis())
    expect(parseAnswers({})).toEqual(emptyAnamnesis())
  })

  it('payload da spec 1.0 ganha os campos novos com defaults', () => {
    // um payload 1.0 não tinha logística/preferências nem lesões
    const antigo = { objetivo_principal: ['hipertrofia'], sono_horas: '7' }
    const a = parseAnswers(antigo)
    expect(a.objetivo_principal).toEqual(['hipertrofia'])
    expect(a.sono_horas).toBe('7')
    expect(a.treino_freq_semana).toBe('')
    expect(a.lesoes_diagnosticadas).toEqual([])
    expect(a.pref_veto).toBe('')
  })

  it('historia_familiar_dcv booleano (spec 1.0) converte pro enum', () => {
    expect(parseAnswers({ historia_familiar_dcv: true }).historia_familiar_dcv).toBe('sim')
    expect(parseAnswers({ historia_familiar_dcv: false }).historia_familiar_dcv).toBe('nao')
    expect(parseAnswers({ historia_familiar_dcv: null }).historia_familiar_dcv).toBe('')
    expect(parseAnswers({ historia_familiar_dcv: 'nao_sei' }).historia_familiar_dcv).toBe('nao_sei')
  })

  it('parq parcial é completado com null (não respondido)', () => {
    const a = parseAnswers({ parq: { cardio_dx: true } })
    expect(a.parq.cardio_dx).toBe(true)
    expect(a.parq.dor_toracica).toBeNull()
  })
})
