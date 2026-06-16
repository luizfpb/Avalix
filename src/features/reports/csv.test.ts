import { describe, it, expect } from 'vitest'
import { buildAssessmentsCsv } from './csv'

const records = [
  {
    data: '2026-06-16',
    protocolo: 'Jackson-Pollock 7 dobras',
    peso_kg: 80,
    altura_cm: 180,
    gordura_pct: 14.6,
    massa_gorda_kg: 11.7,
    massa_magra_kg: 68.3,
    densidade: 1.0654,
  },
]

describe('buildAssessmentsCsv', () => {
  it('intl usa vírgula como separador e ponto decimal', () => {
    const csv = buildAssessmentsCsv(records, 'intl')
    expect(csv).toContain('data,protocolo')
    expect(csv).toContain('14.6')
    expect(csv).toContain('1.0654')
  })

  it('br usa ponto e vírgula e decimal com vírgula', () => {
    const csv = buildAssessmentsCsv(records, 'br')
    expect(csv).toContain('data;protocolo')
    expect(csv).toContain('14,6')
    expect(csv).toContain('1,0654')
  })
})
