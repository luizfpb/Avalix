import { describe, expect, it } from 'vitest'
import { pendenciasDaAnamnese, totalPendente } from './pendencias'
import { emptyAnamnesis, PARQ_ITEMS } from './spec'
import type { AnamnesisAnswers } from './spec'

function respondido(patch: Partial<AnamnesisAnswers> = {}): AnamnesisAnswers {
  return {
    ...emptyAnamnesis(),
    parq: Object.fromEntries(PARQ_ITEMS.map((i) => [i.key, false])) as AnamnesisAnswers['parq'],
    ativo_regular: true,
    doenca_cmr_confirmada: true,
    sinais_sintomas_confirmados: true,
    medicamentos_confirmados: true,
    ...patch,
  }
}

describe('pendenciasDaAnamnese', () => {
  it('anamnese em branco lista as três frentes obrigatórias', () => {
    const p = pendenciasDaAnamnese(emptyAnamnesis())
    expect(p.map((x) => x.secao)).toEqual(['sec-parq', 'sec-acsm', 'sec-medicamentos'])
    expect(totalPendente(p)).toBe(PARQ_ITEMS.length + 3 + 1)
  })

  it('conta quantas perguntas do PAR-Q ainda faltam, não só que "falta o PAR-Q"', () => {
    const a = emptyAnamnesis()
    a.parq[PARQ_ITEMS[0].key] = false
    a.parq[PARQ_ITEMS[1].key] = true
    const parq = pendenciasDaAnamnese(a).find((x) => x.secao === 'sec-parq')!
    expect(parq.faltam).toBe(PARQ_ITEMS.length - 2)
  })

  it('nomeia o que falta em A2, item a item', () => {
    const a = respondido({ sinais_sintomas_confirmados: false })
    const acsm = pendenciasDaAnamnese(a).find((x) => x.secao === 'sec-acsm')!
    expect(acsm.faltam).toBe(1)
    expect(acsm.rotulo).toContain('sinais e sintomas')
  })

  it('lista vazia sem confirmação continua pendência — "nenhum" precisa ser dito', () => {
    const a = respondido({ medicamentos_confirmados: false, medicamentos: [] })
    expect(pendenciasDaAnamnese(a).map((x) => x.secao)).toEqual(['sec-medicamentos'])
  })

  it('medicamento adicionado e deixado em branco não conta como respondido', () => {
    const a = respondido({ medicamentos: [{ nome: '  ', dose: '' }] })
    expect(pendenciasDaAnamnese(a).map((x) => x.secao)).toEqual(['sec-medicamentos'])
  })

  it('tudo obrigatório respondido zera a lista, mesmo com a camada B vazia', () => {
    // a camada B é contexto OPCIONAL: contá-la viraria cobrança e nunca zeraria
    expect(pendenciasDaAnamnese(respondido())).toEqual([])
  })
})
