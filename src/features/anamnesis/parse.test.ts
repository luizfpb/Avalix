import { describe, it, expect } from 'vitest'
import { parseAnswers } from './parse'
import { emptyAnamnesis } from './spec'

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

// O payload pode vir do envio ANÔNIMO (intake): quem tem o link controla o
// request. Tipo errado não pode quebrar a revisão nem confundir o gate.
describe('parseAnswers — payload hostil/malformado (fronteira anônima, v2.0)', () => {
  it('array esperado que veio como outro tipo cai no vazio', () => {
    const a = parseAnswers({ red_flags: 'dor_noturna', sinais_sintomas: 42, cirurgias: 7 })
    expect(a.red_flags).toEqual([])
    expect(a.sinais_sintomas).toEqual([])
    expect(a.cirurgias).toEqual([])
  })

  it('booleano do parq que veio como string vira null (não respondido)', () => {
    const a = parseAnswers({ parq: { cardio_dx: 'false', dor_toracica: 'true' } })
    expect(a.parq.cardio_dx).toBeNull()
    expect(a.parq.dor_toracica).toBeNull()
  })

  it('string esperada que veio como objeto/numero cai no vazio', () => {
    const a = parseAnswers({ observacoes: { x: 1 }, ocupacao: 9 })
    expect(a.observacoes).toBe('')
    expect(a.ocupacao).toBe('')
  })

  it('dor_queixas com item malformado é descartada inteira (defensivo)', () => {
    const a = parseAnswers({ dor_queixas: [{ regiao: 'joelho_d', intensidade: 'muita' }, 'x'] })
    expect(a.dor_queixas).toEqual([])
  })

  it('dor_queixas válida passa intacta', () => {
    const q = {
      regiao: 'joelho_d',
      intensidade: 5,
      tempo_evolucao: '2 meses',
      fatores_piora: '',
      fatores_melhora: '',
      lesao_previa_regiao: false,
    }
    expect(parseAnswers({ dor_queixas: [q] }).dor_queixas).toEqual([q])
  })

  it('nunca lança, mesmo com payload absurdo', () => {
    expect(() => parseAnswers([1, 2, 3])).not.toThrow()
    expect(() => parseAnswers('lixo')).not.toThrow()
    expect(parseAnswers('lixo')).toEqual(emptyAnamnesis())
  })
})
