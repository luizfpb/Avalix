import { describe, expect, it } from 'vitest'
import { computeProtocol } from './registry'
import { ProtocolDomainError } from './domain'
import {
  jp3MaleBodyDensity,
  jp7BodyDensity,
  jpWardFemaleBodyDensity,
} from './equations'
import type { ProtocolInput } from './types'

function input(over: Partial<ProtocolInput> = {}): ProtocolInput {
  return {
    sex: 'M',
    ageYears: 30,
    heightCm: 180,
    skinfoldsMm: {},
    circumferencesCm: {},
    ...over,
  }
}

const JP7_OK = {
  chest: 12,
  midaxillary: 12,
  triceps: 10,
  subscapular: 14,
  abdomen: 20,
  suprailiac: 16,
  thigh: 16,
} // soma 100 mm

describe('medidas impossiveis viram erro, nao NaN', () => {
  it('US Navy recusa cintura menor que o pescoco (antes devolvia NaN)', () => {
    expect(() =>
      computeProtocol(
        'usNavy',
        input({ circumferencesCm: { neck: 42, waist: 40 } })
      )
    ).toThrow(ProtocolDomainError)
    try {
      computeProtocol('usNavy', input({ circumferencesCm: { neck: 42, waist: 40 } }))
    } catch (e) {
      expect((e as ProtocolDomainError).code).toBe('medida-impossivel')
      expect((e as Error).message).toMatch(/trocados/i)
    }
  })

  it('US Navy recusa cintura igual ao pescoco (antes devolvia -450%)', () => {
    expect(() =>
      computeProtocol('usNavy', input({ circumferencesCm: { neck: 42, waist: 42 } }))
    ).toThrow(ProtocolDomainError)
  })

  it('US Navy recusa o combo que produzia gordura negativa em aluno magro', () => {
    // 180 cm, pescoco 42, cintura 70 -> -2,0% pela equacao. Perfil real de
    // aluno avancado, nao absurdo: por isso precisa de erro claro e nao de um
    // numero negativo impresso no laudo.
    try {
      computeProtocol(
        'usNavy',
        input({ heightCm: 180, circumferencesCm: { neck: 42, waist: 70 } })
      )
      throw new Error('deveria ter lancado')
    } catch (e) {
      expect(e).toBeInstanceOf(ProtocolDomainError)
      expect((e as ProtocolDomainError).code).toBe('resultado-impossivel')
    }
  })

  it('US Navy continua calculando um caso normal', () => {
    const r = computeProtocol(
      'usNavy',
      input({ heightCm: 180, circumferencesCm: { neck: 38, waist: 85 } })
    )
    expect(r.bodyFatPct).toBeCloseTo(16.1, 1)
    expect(r.warnings).toEqual([])
  })
})

describe('inversao da parabola de Jackson & Pollock', () => {
  it('avisa quando a soma passa do vertice (mais dobra passaria a significar menos gordura)', () => {
    // Mulher, 3 sitios, soma 240 mm: acima do vertice de 215,8 mm e ainda
    // dentro do que o banco aceita (3 x 99 = 297 mm).
    const r = computeProtocol(
      'jpWard',
      input({
        sex: 'F',
        ageYears: 40,
        skinfoldsMm: { triceps: 80, suprailiac: 80, thigh: 80 },
      })
    )
    const codes = r.warnings.map((w) => w.code)
    expect(codes).toContain('soma-acima-do-vertice')
  })

  it('nao avisa numa soma normal', () => {
    const r = computeProtocol(
      'jpWard',
      input({
        sex: 'F',
        ageYears: 40,
        skinfoldsMm: { triceps: 20, suprailiac: 20, thigh: 25 },
      })
    )
    expect(r.warnings.map((w) => w.code)).not.toContain('soma-acima-do-vertice')
  })

  // Guarda contra o vertice declarado em domain.ts ficar desatualizado se
  // algum coeficiente de equations.ts mudar: acha o minimo da densidade por
  // sondagem na funcao REAL e confere contra a constante usada nos avisos.
  it('os vertices declarados batem com as equacoes reais', () => {
    const minimoDe = (f: (sum: number) => number) => {
      let melhorSoma = 0
      let melhorD = Infinity
      for (let s = 10; s <= 700; s += 0.1) {
        const d = f(s)
        if (d < melhorD) {
          melhorD = d
          melhorSoma = s
        }
      }
      return melhorSoma
    }
    expect(minimoDe((s) => jp7BodyDensity('M', s, 30))).toBeCloseTo(395.4, 0)
    expect(minimoDe((s) => jp7BodyDensity('F', s, 30))).toBeCloseTo(419.4, 0)
    expect(minimoDe((s) => jp3MaleBodyDensity(s, 30))).toBeCloseTo(258.3, 0)
    expect(minimoDe((s) => jpWardFemaleBodyDensity(s, 30))).toBeCloseTo(215.8, 0)
  })
})

describe('extrapolacao de faixa etaria', () => {
  it('avisa fora da faixa validada e cita a faixa', () => {
    const r = computeProtocol('jp7', input({ ageYears: 70, skinfoldsMm: JP7_OK }))
    const aviso = r.warnings.find((w) => w.code === 'idade-fora-da-faixa')
    expect(aviso).toBeDefined()
    expect(aviso?.message).toMatch(/18 a 61 anos/)
  })

  it('nao avisa dentro da faixa', () => {
    const r = computeProtocol('jp7', input({ ageYears: 30, skinfoldsMm: JP7_OK }))
    expect(r.warnings).toEqual([])
  })

  it('Durnin-Womersley aceita adolescente sem avisar (a tabela tem a linha <17)', () => {
    const r = computeProtocol(
      'durninWomersley',
      input({
        ageYears: 15,
        skinfoldsMm: { biceps: 6, triceps: 10, subscapular: 10, suprailiac: 12 },
      })
    )
    expect(r.warnings.map((w) => w.code)).not.toContain('idade-fora-da-faixa')
  })
})

describe('resultado utilizavel mas incomum', () => {
  it('avisa sem bloquear quando o valor foge da faixa usual do sexo', () => {
    const r = computeProtocol(
      'jp7',
      input({
        sex: 'M',
        ageYears: 25,
        skinfoldsMm: {
          chest: 3, midaxillary: 3, triceps: 3,
          subscapular: 4, abdomen: 4, suprailiac: 3, thigh: 4,
        },
      })
    )
    expect(r.bodyFatPct).toBeGreaterThan(0)
    expect(r.warnings.map((w) => w.code)).toContain('gordura-incomum')
  })
})

describe('caminho feliz permanece intacto', () => {
  it('avaliacao normal calcula igual a antes e sem nenhum aviso', () => {
    const r = computeProtocol('jp7', input({ ageYears: 30, skinfoldsMm: JP7_OK }))
    // Mesmo vetor do equations.test.ts: densidade 1.0653532 -> Siri.
    expect(r.bodyDensity).toBeCloseTo(1.0653532, 6)
    expect(r.bodyFatPct).toBeCloseTo(495 / 1.0653532 - 450, 6)
    expect(r.conversions?.brozek).toBeCloseTo(457 / 1.0653532 - 414.1, 6)
    expect(r.warnings).toEqual([])
  })
})
