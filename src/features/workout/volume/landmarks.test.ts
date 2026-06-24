import { describe, it, expect } from 'vitest'
import {
  classifyVolume,
  landmarkBar,
  VOLUME_LANDMARKS,
  VOLUME_LANDMARKS_VERSION,
} from './landmarks'

describe('classifyVolume', () => {
  it('classifica o peito nas cinco zonas', () => {
    // chest: mev 8, mav 12-20, mrv 22
    expect(classifyVolume('chest', 4)?.zone).toBe('below')
    expect(classifyVolume('chest', 8)?.zone).toBe('effective')
    expect(classifyVolume('chest', 10)?.zone).toBe('effective')
    expect(classifyVolume('chest', 14)?.zone).toBe('optimal')
    expect(classifyVolume('chest', 20)?.zone).toBe('optimal')
    expect(classifyVolume('chest', 21)?.zone).toBe('high')
    expect(classifyVolume('chest', 22)?.zone).toBe('high')
    expect(classifyVolume('chest', 23)?.zone).toBe('above')
  })

  it('deltoide anterior com MEV 0 cai em ótimo sem trabalho direto', () => {
    // front_delts: mev 0, mav 0-6, mrv 12 (recebe estimulo indireto dos presses)
    expect(classifyVolume('front_delts', 0)?.zone).toBe('optimal')
    expect(classifyVolume('front_delts', 6)?.zone).toBe('optimal')
    expect(classifyVolume('front_delts', 10)?.zone).toBe('high')
    expect(classifyVolume('front_delts', 13)?.zone).toBe('above')
  })

  it('grupos sem diretriz publicada retornam null', () => {
    expect(classifyVolume('neck', 8)).toBeNull()
    expect(classifyVolume('obliques', 10)).toBeNull()
    expect(classifyVolume('lower_back', 6)).toBeNull()
    expect(classifyVolume('adductors', 4)).toBeNull()
  })
})

describe('landmarkBar', () => {
  it('escala MAV e MRV na escala comum', () => {
    // chest mav 12-20, mrv 22, escala 28
    const b = landmarkBar('chest', 14, 28)
    expect(b.zone).toBe('optimal')
    expect(b.fillPct).toBeCloseTo(14 / 28, 5)
    expect(b.mavLowPct).toBeCloseTo(12 / 28, 5)
    expect(b.mavHighPct).toBeCloseTo(20 / 28, 5)
    expect(b.mrvPct).toBeCloseTo(22 / 28, 5)
  })

  it('clampa o preenchimento em 1 quando passa da escala', () => {
    expect(landmarkBar('chest', 40, 28).fillPct).toBe(1)
  })

  it('grupo sem diretriz: só o preenchimento, sem faixa', () => {
    const b = landmarkBar('neck', 10, 28)
    expect(b.zone).toBeNull()
    expect(b.mrvPct).toBe(0)
    expect(b.fillPct).toBeCloseTo(10 / 28, 5)
  })
})

describe('VOLUME_LANDMARKS', () => {
  it('versão fixada e faixas coerentes (mev <= mavLow <= mavHigh <= mrv)', () => {
    expect(VOLUME_LANDMARKS_VERSION).toMatch(/^landmarks-[a-z]+@\d+$/)
    for (const lm of Object.values(VOLUME_LANDMARKS)) {
      expect(lm.mev).toBeLessThanOrEqual(lm.mavLow)
      expect(lm.mavLow).toBeLessThanOrEqual(lm.mavHigh)
      expect(lm.mavHigh).toBeLessThanOrEqual(lm.mrv)
    }
  })
})
