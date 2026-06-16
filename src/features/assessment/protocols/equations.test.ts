import { describe, it, expect } from 'vitest'
import {
  jp7BodyDensity,
  jp3MaleBodyDensity,
  jpWardFemaleBodyDensity,
  durninWomersleyBodyDensity,
  usNavyBodyFatPct,
} from './equations'

// Vetores calculados a partir das equações publicadas (conta no comentário).
describe('Jackson-Pollock 7 dobras', () => {
  it('homem, soma 100 mm, 30 anos', () => {
    // 1.112 - 0.00043499*100 + 0.00000055*100^2 - 0.00028826*30 = 1.0653532
    expect(jp7BodyDensity('M', 100, 30)).toBeCloseTo(1.0653532, 6)
  })
  it('mulher, soma 120 mm, 30 anos', () => {
    // 1.097 - 0.00046971*120 + 0.00000056*120^2 - 0.00012828*30 = 1.0448504
    expect(jp7BodyDensity('F', 120, 30)).toBeCloseTo(1.0448504, 6)
  })
})

describe('Jackson-Pollock 3 dobras (homens)', () => {
  it('soma 51 mm, 30 anos', () => {
    // 1.10938 - 0.0008267*51 + 0.0000016*51^2 - 0.0002574*30 = 1.0636579
    expect(jp3MaleBodyDensity(51, 30)).toBeCloseTo(1.0636579, 6)
  })
})

describe('Jackson-Pollock-Ward 3 dobras (mulheres)', () => {
  it('soma 60 mm, 30 anos', () => {
    // 1.0994921 - 0.0009929*60 + 0.0000023*60^2 - 0.0001392*30 = 1.0440221
    expect(jpWardFemaleBodyDensity(60, 30)).toBeCloseTo(1.0440221, 6)
  })
})

describe('Durnin-Womersley 4 dobras', () => {
  it('homem 30 anos (faixa 30-39: c=1.1422, m=0.0544), soma 40', () => {
    // 1.1422 - 0.0544*log10(40) = 1.0550479
    expect(durninWomersleyBodyDensity('M', 40, 30)).toBeCloseTo(1.0550479, 6)
  })
  it('mulher 25 anos (faixa 20-29: c=1.1599, m=0.0717), soma 40', () => {
    // 1.1599 - 0.0717*log10(40) = 1.0450323
    expect(durninWomersleyBodyDensity('F', 40, 25)).toBeCloseTo(1.0450323, 6)
  })
  it('seleciona a faixa etária pelos limites', () => {
    // homem 16 anos -> faixa <17 (c=1.1533, m=0.0643): 1.1533 - 0.0643*log10(40) = 1.0502875
    expect(durninWomersleyBodyDensity('M', 40, 16)).toBeCloseTo(1.0502875, 6)
    // homem 45 anos -> faixa 40-49 (c=1.162, m=0.0700): 1.162 - 0.0700*log10(40) = 1.0498558
    expect(durninWomersleyBodyDensity('M', 40, 45)).toBeCloseTo(1.0498558, 6)
  })
})

describe('US Navy (circunferências, cm)', () => {
  it('homem: altura 180, pescoço 38, cintura 85', () => {
    // 495/(1.0324 - 0.19077*log10(47) + 0.15456*log10(180)) - 450 ~= 16.1
    expect(usNavyBodyFatPct('M', 180, 38, 85)).toBeCloseTo(16.1, 1)
  })
  it('mulher: altura 165, pescoço 32, cintura 75, quadril 95', () => {
    // 495/(1.29579 - 0.35004*log10(138) + 0.221*log10(165)) - 450 ~= 27.4
    expect(usNavyBodyFatPct('F', 165, 32, 75, 95)).toBeCloseTo(27.4, 1)
  })
  it('mulher sem quadril lança erro', () => {
    expect(() => usNavyBodyFatPct('F', 165, 32, 75)).toThrow(/quadril/i)
  })
})
