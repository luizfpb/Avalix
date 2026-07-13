import { describe, it, expect } from 'vitest'
import { generateAssessmentPdf, buildCircSeries, type AssessmentPdfData } from './assessmentPdf'
import type { AssessmentRow, SubjectCircumference } from '../assessment/api'

// Render de fumaça: garante que o PDF (com os gráficos de evolução em SVG:
// Line/Polyline/Circle/Text) gera sem lançar e produz bytes. Não valida o
// visual — só que as primitivas usadas existem em runtime no @react-pdf.

const assessment = {
  id: 'a1',
  org_id: 'o1',
  subject_id: 's1',
  evaluator_id: 'e1',
  assessed_at: '2026-06-01',
  protocol_id: 'jp7',
  weight_kg: 80,
  height_cm: 178,
  notes: 'sem queixas',
  medications: null,
  results: {
    bodyFatPct: 18,
    bodyDensity: 1.05,
    fatMassKg: 14.4,
    leanMassKg: 65.6,
    engineVersion: 'test@1',
    inputs: { sex: 'M' },
    conversions: { siri: 18, brozek: 17.5 },
  },
  engine_version: 'test@1',
  created_at: '2026-06-01',
  updated_at: '2026-06-01',
} as unknown as AssessmentRow

const data: AssessmentPdfData = {
  orgName: 'Estúdio Teste',
  subjectName: 'Fulano de Tal',
  assessment,
  skinfolds: [],
  circumferences: [],
  history: [
    { date: '01/01', weightKg: 84, bmi: 26.5, bodyFatPct: 22, leanMassKg: 65.5, fatMassKg: 18.5 },
    { date: '01/03', weightKg: 82, bmi: 25.9, bodyFatPct: 20, leanMassKg: 65.6, fatMassKg: 16.4 },
    { date: '01/06', weightKg: 80, bmi: 25.3, bodyFatPct: 18, leanMassKg: 65.6, fatMassKg: 14.4 },
  ],
  circumferenceHistory: [
    { assessedAt: '2026-01-01', site: 'waist', valueCm: 92 },
    { assessedAt: '2026-03-01', site: 'waist', valueCm: 89 },
    { assessedAt: '2026-06-01', site: 'waist', valueCm: 86 },
    { assessedAt: '2026-01-01', site: 'abdomen', valueCm: 95 },
    { assessedAt: '2026-06-01', site: 'abdomen', valueCm: 90 },
  ],
}

describe('render do PDF de avaliação', () => {
  it(
    'gera um PDF não-vazio com os gráficos de evolução',
    async () => {
      const blob = await generateAssessmentPdf(data)
      expect(blob.size).toBeGreaterThan(1000)
    },
    15_000
  )
})

describe('buildCircSeries', () => {
  const rows: SubjectCircumference[] = [
    // coxa medial bilateral (D/E) em 2 datas
    { assessedAt: '2026-01-01', site: 'thigh_mid_r', valueCm: 60 },
    { assessedAt: '2026-01-01', site: 'thigh_mid_l', valueCm: 62 },
    { assessedAt: '2026-06-01', site: 'thigh_mid_r', valueCm: 58 },
    { assessedAt: '2026-06-01', site: 'thigh_mid_l', valueCm: 60 },
    // panturrilha só um lado
    { assessedAt: '2026-01-01', site: 'calf_r', valueCm: 40 },
    { assessedAt: '2026-06-01', site: 'calf_r', valueCm: 39 },
    // tronco
    { assessedAt: '2026-01-01', site: 'waist', valueCm: 92 },
    { assessedAt: '2026-06-01', site: 'waist', valueCm: 86 },
  ]

  it('inclui membros inferiores e tira a média dos lados D/E', () => {
    const labels = buildCircSeries(rows, 12, 10).map((s) => s.label)
    expect(labels).toContain('Cintura')
    expect(labels).toContain('Coxa medial')
    expect(labels).toContain('Panturrilha')
    const coxa = buildCircSeries(rows, 12, 10).find((s) => s.label === 'Coxa medial')!
    expect(coxa.points.map((p) => p.value)).toEqual([61, 59]) // (60+62)/2 e (58+60)/2
  })

  it('mantém a prioridade (tronco antes dos membros) e respeita maxCharts', () => {
    const series = buildCircSeries(rows, 2, 10)
    expect(series).toHaveLength(2)
    expect(series[0].label).toBe('Cintura')
  })
})
