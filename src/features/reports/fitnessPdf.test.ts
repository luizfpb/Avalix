import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { registerReportFontsFrom } from './pdfFonts'
import { generateFitnessPdf, type FitnessPdfData } from './fitnessPdf'

registerReportFontsFrom(join(process.cwd(), 'public/fonts'))

const sampleData: FitnessPdfData = {
  orgName: 'Estúdio Corpo & Movimento',
  subjectName: 'Mariana Costa',
  subjectLabel: 'Aluna',
  evaluatorName: 'Camila Andrade · CREF 000000-G/SP',
  sex: 'F',
  ageYears: 32,
  testedAt: '2026-10-20',
  measures: {
    cooper: { distance_m: 2350 },
    rockport: { time_s: 855, heart_rate_bpm: 132, weight_kg: 64.5 },
    push_ups: { reps: 24, knees: true },
    sit_ups: { reps: 31 },
    sit_and_reach: { best_cm: 34, feet_mark_cm: 26 },
    grip: { right_kg: 31.5, left_kg: 29.5 },
  },
  notes: 'Coleta realizada pela manhã, pista coberta, boa disposição.',
  previous: {
    cooper: { testedAt: '2026-07-15', value: 37.4, ratingLabel: 'Regular' },
    push_ups: { testedAt: '2026-07-15', value: 19, ratingLabel: 'Bom' },
    sit_ups: { testedAt: '2026-07-15', value: 27, ratingLabel: 'Média' },
    sit_and_reach: { testedAt: '2026-07-15', value: 31, ratingLabel: 'Média' },
    grip: { testedAt: '2026-07-15', value: 29.5, ratingLabel: 'Acima do corte de força baixa' },
  },
}

describe('render do PDF de testes físicos', () => {
  it(
    'gera um PDF não-vazio com resultados cardiorrespiratórios, neuromotores e comparação',
    async () => {
      const blob = await generateFitnessPdf(sampleData)
      expect(blob.size).toBeGreaterThan(1000)
    },
    15_000
  )
})
