// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import AvaliacaoDetalhe from './AvaliacaoDetalhe'
import AvaliacaoNova from './AvaliacaoNova'
import AnamneseDetalhe from './AnamneseDetalhe'
import { buildAssessmentResult } from '../features/assessment/result'

const m = vi.hoisted(() => ({
  pdf: vi.fn(async () => new Blob(['pdf'])), save: vi.fn(async () => ({ id: 'avaliacao-b', updated_at: '2026-09-08T12:00:01Z' })),
  subject: { id: 'aluna-a', full_name: 'Alice Pessoa A', birth_date: '1990-01-01', sex: 'F', height_cm: 165 },
  row: { id: 'avaliacao-b', subject_id: 'aluno-b', org_id: 'org', evaluator_id: 'prof', assessed_at: '2026-09-08', created_at: '2026-09-08T12:00:00Z', updated_at: '2026-09-08T12:00:00Z', protocol_id: 'usNavy', weight_kg: 70, height_cm: 175, results: null as ReturnType<typeof buildAssessmentResult> | null, medications: null, notes: 'Coleta de Bruno' },
}))
vi.mock('react-router', async (importOriginal) => ({ ...await importOriginal<typeof import('react-router')>(), useParams: () => ({ id: 'aluna-a', assessmentId: 'avaliacao-b' }), useNavigate: () => vi.fn() }))
vi.mock('../features/organization/context', () => ({ useOrganization: () => ({ organization: { id: 'org', name: 'Org' } }) }))
vi.mock('../features/auth/context', () => ({ useAuth: () => ({ user: { id: 'prof' } }) }))
vi.mock('../features/subjects/hooks', () => ({ useSubject: () => ({ data: m.subject, isPending: false }) }))
vi.mock('../features/consent/hooks', () => ({ useActiveConsent: () => ({ data: { id: 'consent' } }) }))
vi.mock('../features/anamnesis/hooks', () => ({ useAnamnese: () => ({ data: { id: 'anamnese-b', subject_id: 'aluno-b' } }) }))
vi.mock('../features/assessment/hooks', () => ({
  useAssessment: () => ({ data: { assessment: m.row, skinfolds: [], circumferences: [{ id: 'circ-neck', site: 'neck', value_cm: 35 }, { id: 'circ-waist', site: 'waist', value_cm: 85 }, { id: 'circ-hip', site: 'hip', value_cm: 100 }] } }),
  useAssessments: () => ({ data: [{ ...m.row, id: 'avaliacao-a', subject_id: 'aluna-a', weight_kg: 50 }] }),
  useDeleteAssessment: () => ({}), useCreateAssessment: () => ({ mutateAsync: m.save }), useUpdateAssessment: () => ({ mutateAsync: m.save }),
}))
vi.mock('../features/reports/assessmentPdf', () => ({ generateAssessmentPdf: m.pdf }))
vi.mock('../features/reports/download', () => ({ downloadBlob: vi.fn() }))
vi.mock('../features/reports/audit', () => ({ listProfileNames: async () => ({ prof: 'Profissional' }), logExport: vi.fn() }))
vi.mock('../features/assessment/api', () => ({ listSubjectCircumferences: async () => [] }))
vi.mock('../features/organization/logo', () => ({ loadOrgLogoDataUrl: async () => null }))
vi.mock('../features/prompts/CopyPromptButton', () => ({ CopyPromptButton: () => null }))
vi.mock('../lib/draft', () => ({ clearDraft: vi.fn(), useFormDraft: () => ({ restored: false }) }))
vi.mock('../lib/unsavedChanges', () => ({ useUnsavedChanges: () => ({ allowNext: vi.fn() }) }))
vi.mock('../components/UnsavedChanges', () => ({ UnsavedBadge: () => null, UnsavedChangesPrompt: () => null }))
afterEach(() => { cleanup(); vi.clearAllMocks(); m.row.results = null; m.row.subject_id = 'aluno-b' })

it('bloqueia exportacao quando a avaliacao pertence a outro sujeito', async () => {
  render(<MemoryRouter><AvaliacaoDetalhe /></MemoryRouter>)
  expect(screen.queryByRole('button', { name: 'Baixar PDF' })).toBeNull()
  expect(m.pdf).not.toHaveBeenCalled()
})

it('bloqueia edicao quando a avaliacao pertence a outro sujeito', async () => {
  render(<MemoryRouter><AvaliacaoNova /></MemoryRouter>)
  expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull()
  expect(m.save).not.toHaveBeenCalled()
})

it('bloqueia o detalhe da anamnese quando o titular da rota não corresponde ao registro', () => {
  render(<MemoryRouter><AnamneseDetalhe /></MemoryRouter>)
  expect(screen.getByText('Não foi possível carregar a anamnese.')).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Editar' })).toBeNull()
})

it('recusa medida preenchida fora da faixa antes de salvar', async () => {
  m.row.subject_id = 'aluna-a'
  render(<MemoryRouter><AvaliacaoNova /></MemoryRouter>)
  const input = screen.getByLabelText('Panturrilha (D)') as HTMLInputElement
  fireEvent.change(input, { target: { value: '-35' } })
  expect(input.min).toBe('')
  expect(input.checkValidity()).toBe(true)
  expect(input.closest('form')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  await waitFor(() => expect(screen.queryByText(/Panturrilha .* deve estar entre/)).not.toBeNull())
  expect(m.save).not.toHaveBeenCalled()
})

it.each(['0', '-2', '100'])('recusa uma aferição %s sem descartá-la da média silenciosamente', async (invalid) => {
  m.row.subject_id = 'aluna-a'
  render(<MemoryRouter><AvaliacaoNova /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Protocolo'), { target: { value: 'jpWard' } })
  for (const site of ['Tríceps', 'Supra-ilíaca', 'Coxa']) {
    fireEvent.change(screen.getByLabelText(`${site}, aferição 1`), { target: { value: '25' } })
  }
  fireEvent.change(screen.getByLabelText('Tríceps, aferição 2'), { target: { value: invalid } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  expect(await screen.findByText('Dobra Tríceps deve estar entre 1 e 99 mm.')).toBeTruthy()
  expect(m.save).not.toHaveBeenCalled()
})

it.each([
  { name: 'Tornozelo D', value: '-20', message: 'Circunferência "Tornozelo D" deve estar entre 10 e 250 cm.' },
  { name: 'Tornozelo D', value: '', message: 'Preencha o nome e a medida de cada circunferência personalizada, ou remova a linha.' },
  { name: '', value: '20', message: 'Preencha o nome e a medida de cada circunferência personalizada, ou remova a linha.' },
])('recusa circunferência personalizada incompleta ou inválida: $name / $value', async ({ name, value, message }) => {
  m.row.subject_id = 'aluna-a'
  render(<MemoryRouter><AvaliacaoNova /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
  fireEvent.change(screen.getByLabelText('Nome da circunferência personalizada 1'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Medida da circunferência personalizada 1 em centímetros'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  expect(await screen.findByText(message)).toBeTruthy()
  expect(m.save).not.toHaveBeenCalled()
})

it('permite deixar a linha personalizada inteira vazia sem criar uma medida', async () => {
  m.row.subject_id = 'aluna-a'
  render(<MemoryRouter><AvaliacaoNova /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  await waitFor(() => expect(m.save).toHaveBeenCalledOnce())
  expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ circumferences: [
    { site: 'neck', value_cm: 35 },
    { site: 'waist', value_cm: 85 },
    { site: 'hip', value_cm: 100 },
  ] }))
})

it('preserva as ressalvas calculadas na consulta da avaliacao', () => {
  m.row.subject_id = 'aluna-a'
  const result = buildAssessmentResult('jpWard', { sex: 'F', ageYears: 70, heightCm: 175, skinfoldsMm: { triceps: 25, suprailiac: 25, thigh: 25 }, circumferencesCm: {} }, 70)
  expect(result.warnings?.length).toBeGreaterThan(0)
  m.row.results = result
  render(<MemoryRouter><AvaliacaoDetalhe /></MemoryRouter>)
  expect(screen.getByText(`${result.bodyFatPct.toFixed(1)}%`)).toBeTruthy()
  for (const warning of result.warnings!) expect(screen.getByText(warning.message)).toBeTruthy()
})
