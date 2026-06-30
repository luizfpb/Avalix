import { describe, it, expect } from 'vitest'
import { generateAssessmentPdf, type AssessmentPdfData } from './assessmentPdf'
import type { AssessmentRow } from '../assessment/api'

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
    { assessedAt: '2026-01-01', site: 'cintura', valueCm: 92 },
    { assessedAt: '2026-03-01', site: 'cintura', valueCm: 89 },
    { assessedAt: '2026-06-01', site: 'cintura', valueCm: 86 },
    { assessedAt: '2026-01-01', site: 'abdomen', valueCm: 95 },
    { assessedAt: '2026-06-01', site: 'abdomen', valueCm: 90 },
  ],
}

describe('render do PDF de avaliação', () => {
  it('gera um PDF não-vazio com os gráficos de evolução', async () => {
    const blob = await generateAssessmentPdf(data)
    expect(blob.size).toBeGreaterThan(1000)
  })
})
