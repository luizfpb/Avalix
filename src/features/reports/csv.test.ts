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

  it.each(['=', '+', '-', '@', '\t', '\r']) (
    'neutraliza fórmula iniciada por %j nos dois dialetos',
    (prefix) => {
      const dangerous = [{ ...records[0], protocolo: `${prefix}SUM(A1:A2)` }]

      for (const dialect of ['intl', 'br'] as const) {
        const csv = buildAssessmentsCsv(dangerous, dialect)
        expect(csv).toContain(`'${prefix}SUM(A1:A2)`)
        expect(csv).not.toMatch(new RegExp(`(?:^|[,;])${escapeRegExp(prefix)}SUM`, 'm'))
      }
    }
  )
})

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
