// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { EvolutionPdfData } from '../features/reports/assessmentPdf'
import Evolucao from './Evolucao'

const m = vi.hoisted(() => ({
  pdf: vi.fn<(data: EvolutionPdfData) => Promise<Blob>>(async () => new Blob(['pdf'])),
  warning: { code: 'idade-fora-da-faixa', message: 'Ressalva específica da coleta: extrapolação da faixa etária.' },
}))
vi.mock('react-router', async (original) => ({ ...await original<typeof import('react-router')>(), useParams: () => ({ id: 'subject-1' }) }))
vi.mock('recharts', async (original) => ({ ...await original<typeof import('recharts')>(), ResponsiveContainer: () => null }))
vi.mock('../features/organization/context', () => ({ useOrganization: () => ({ organization: { id: 'org', name: 'Organização' } }) }))
vi.mock('../features/auth/context', () => ({ useAuth: () => ({ user: { id: 'prof' } }) }))
vi.mock('../features/subjects/hooks', () => ({ useSubject: () => ({ data: { id: 'subject-1', full_name: 'Pessoa Fictícia', birth_date: '1956-01-01', sex: 'F' } }) }))
vi.mock('../features/assessment/hooks', () => ({
  useAssessments: () => ({ data: ['2026-01-01', '2026-09-08'].map((date) => ({ id: date, assessed_at: date, created_at: `${date}T12:00:00Z`, protocol_id: 'jpWard', weight_kg: 70, height_cm: 175, results: { bodyFatPct: 25, fatMassKg: 17.5, leanMassKg: 52.5, warnings: [m.warning] } })) }),
  useSubjectCircumferences: () => ({ data: [] }),
}))
vi.mock('../features/reports/assessmentPdf', () => ({ generateEvolutionPdf: m.pdf }))
vi.mock('../features/reports/download', () => ({ downloadBlob: vi.fn() }))
vi.mock('../features/reports/audit', () => ({ listProfileNames: async () => ({ prof: 'Profissional' }), logExport: vi.fn() }))
vi.mock('../features/organization/logo', () => ({ loadOrgLogoDataUrl: async () => null }))
vi.mock('../features/prompts/CopyPromptButton', () => ({ CopyPromptButton: () => null }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('exibe a ressalva atual e envia todas as ressalvas históricas com a data completa ao PDF', async () => {
  render(<MemoryRouter><Evolucao /></MemoryRouter>)
  expect(screen.getByText(m.warning.message)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'PDF de evolução' }))
  await waitFor(() => expect(m.pdf).toHaveBeenCalledOnce())
  expect(m.pdf.mock.calls[0][0].history).toEqual([
    expect.objectContaining({ assessedAt: '2026-01-01', warnings: [m.warning] }),
    expect.objectContaining({ assessedAt: '2026-09-08', warnings: [m.warning] }),
  ])
})
