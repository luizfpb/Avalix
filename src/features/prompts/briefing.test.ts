import { describe, it, expect } from 'vitest'
import { buildBriefingPrompt } from './briefing'
import { SUBJECT, anamneseCompleta, pointWith, SKINFOLDS } from './fixtures'

const serie = [pointWith('2026-01-15', 92, 26.1), pointWith('2026-08-20', 88, 22.3)]
const anamnese = { assessedAt: '2026-02-01', answers: anamneseCompleta() }

function briefing(over: Partial<Parameters<typeof buildBriefingPrompt>[0]> = {}) {
  return buildBriefingPrompt({
    subject: SUBJECT,
    anamnese,
    points: serie,
    skinfolds: SKINFOLDS,
    ...over,
  })
}

describe('buildBriefingPrompt', () => {
  it('junta anamnese e avaliações num material só', () => {
    const p = briefing()
    expect(p).toContain('anamnese de 01/02/2026')
    expect(p).toContain('2 avaliações físicas (15/01/2026 a 20/08/2026)')
    expect(p).toContain('RESULTADO DA TRIAGEM')
    expect(p).toContain('A1. TRIAGEM DE PRONTIDÃO')
    expect(p).toContain('SÉRIE DE AVALIAÇÕES')
  })

  it('pede explicitamente a leitura cruzada, que é o que o briefing acrescenta', () => {
    const p = briefing()
    expect(p).toContain('3. Onde a anamnese e os números conversam')
    expect(p).toContain('4. Onde a anamnese e os números discordam')
    expect(p).toContain('2. Restrições não negociáveis')
  })

  it('avisa que as duas fontes têm confiabilidade diferente', () => {
    const p = briefing()
    expect(p).toContain('PREMISSAS PARA O CRUZAMENTO')
    expect(p).toContain('mesmo grau de confiança')
    expect(p).toContain('verifique se as datas permitem essa leitura')
  })

  it('sem avaliação nenhuma, não carrega premissas de método sobre nada', () => {
    const p = briefing({ points: [], skinfolds: undefined })
    expect(p).toContain('nenhuma avaliação física registrada')
    expect(p).not.toContain('PREMISSAS METODOLÓGICAS')
    expect(p).toContain('A1. TRIAGEM DE PRONTIDÃO')
  })

  it('sem anamnese, não inventa triagem', () => {
    const p = briefing({ anamnese: null })
    expect(p).toContain('nenhuma anamnese registrada')
    expect(p).not.toContain('RESULTADO DA TRIAGEM')
    expect(p).toContain('SÉRIE DE AVALIAÇÕES')
  })

  it('com uma avaliação só, mostra o resultado e não simula série', () => {
    const p = briefing({ points: [serie[0]] })
    expect(p).toContain('1 avaliação física (15/01/2026)')
    expect(p).toContain('RESULTADO DA AVALIAÇÃO DE 15/01/2026')
    expect(p).not.toContain('SÉRIE DE AVALIAÇÕES')
  })

  it('mantém a pseudonimização e as travas de rigor', () => {
    const p = briefing()
    expect(p).toContain('Luiz F. B. B.')
    expect(p).not.toContain('Luiz Felipe Brum Boy')
    expect(p).toContain('REGRAS DE RIGOR')
    expect(p).toContain('nada de divisão semanal, séries,')
  })
})
