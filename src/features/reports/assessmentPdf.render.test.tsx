import { describe, it, expect } from 'vitest'
import {
  buildCircSeries,
  evolutionSummaryRows,
  generateAssessmentPdf,
  type AssessmentPdfData,
} from './assessmentPdf'
import type { AssessmentRow, SubjectCircumference } from '../assessment/api'
import { registerReportFontsFrom } from './pdfFonts'
import { join } from 'node:path'

// Em Node nao ha origem HTTP para resolver /fonts. Registrando do disco, o
// smoke test passa a exercitar o MESMO caminho de fonte do navegador — sem
// isto, fontFamily nao registrada lancaria no render.
registerReportFontsFrom(join(process.cwd(), 'public/fonts'))

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

function circumference(
  assessmentId: string,
  assessedAt: string,
  site: string,
  valueCm: number,
  assessmentCreatedAt = `${assessedAt}T10:00:00Z`
): SubjectCircumference {
  return { assessmentId, assessedAt, assessmentCreatedAt, site, valueCm }
}

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
    circumference('a-jan', '2026-01-01', 'waist', 92),
    circumference('a-mar', '2026-03-01', 'waist', 89),
    circumference('a-jun', '2026-06-01', 'waist', 86),
    circumference('a-jan', '2026-01-01', 'abdomen', 95),
    circumference('a-jun', '2026-06-01', 'abdomen', 90),
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

  // Observações e medicamentos são texto livre do profissional: o bloco é
  // atômico enquanto cabe numa folha e ganha `break` quando não cabe. Os dois
  // caminhos passam por aqui, que é onde um `break` mal colocado ou uma conta
  // que lance apareceriam.
  it(
    'gera com texto livre longo em observações e medicamentos',
    async () => {
      const blob = await generateAssessmentPdf({
        ...data,
        assessment: {
          ...assessment,
          medications: 'Losartana 50 mg pela manhã, conforme prescrição médica.',
          notes: 'Relato de desconforto lombar ao final da série. '.repeat(90),
        } as unknown as AssessmentRow,
      })
      expect(blob.size).toBeGreaterThan(1000)
    },
    15_000
  )
})

describe('buildCircSeries', () => {
  const rows: SubjectCircumference[] = [
    // coxa medial bilateral (D/E) em 2 datas
    circumference('a-jan', '2026-01-01', 'thigh_mid_r', 60),
    circumference('a-jan', '2026-01-01', 'thigh_mid_l', 62),
    circumference('a-jun', '2026-06-01', 'thigh_mid_r', 58),
    circumference('a-jun', '2026-06-01', 'thigh_mid_l', 60),
    // panturrilha só um lado
    circumference('a-jan', '2026-01-01', 'calf_r', 40),
    circumference('a-jun', '2026-06-01', 'calf_r', 39),
    // tronco
    circumference('a-jan', '2026-01-01', 'waist', 92),
    circumference('a-jun', '2026-06-01', 'waist', 86),
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

  it('preserva dois pontos medidos no mesmo dia', () => {
    const sameDay = [
      circumference('a-1', '2026-08-20', 'waist', 90, '2026-08-20T09:00:00Z'),
      circumference('a-2', '2026-08-20', 'waist', 88, '2026-08-20T10:00:00Z'),
    ]

    const waist = buildCircSeries(sameDay, 1, 10)[0]
    expect(waist.points.map((point) => point.value)).toEqual([90, 88])
    expect(waist.points.map((point) => point.date)).toEqual(['20/08', '20/08'])
  })
})

// A DIFERENÇA de um percentual não é um percentual. De 22% para 18% de gordura
// a variação é de quatro PONTOS PERCENTUAIS; impresso "-4%" o laudo afirma uma
// redução relativa de 4%, que daria 21,1%.
describe('evolutionSummaryRows', () => {
  const serie = [
    { date: '01/03', weightKg: 82, bmi: 25.9, bodyFatPct: 22, leanMassKg: 64, fatMassKg: 18 },
    { date: '01/06', weightKg: 80, bmi: 25.3, bodyFatPct: 18, leanMassKg: 65.6, fatMassKg: 14.4 },
  ]

  it('usa pontos percentuais na variação do percentual de gordura', () => {
    const linha = evolutionSummaryRows(serie).find((r) => r.label === '% de gordura')!
    expect(linha.unit).toBe('%')
    expect(linha.deltaUnit).toBe(' p.p.')
  })

  it('mantém a unidade do valor onde ela também serve para a diferença', () => {
    const peso = evolutionSummaryRows(serie).find((r) => r.label === 'Peso')!
    expect(peso.deltaUnit).toBe(' kg')
  })
})
