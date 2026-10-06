// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import AvaliacaoNova from './AvaliacaoNova'
import { usNavyBodyFatPct } from '../features/assessment/protocols/equations'

// Auditoria de 06/10/2026, A06: no US Navy masculino o formulário pedia e o
// motor usava a cintura, e o abdômen coletado no mesmo formulário era
// ignorado. O método original (Hodgdon & Beckett, 1984) mede o homem no
// abdômen, na altura do umbigo; a mulher, na cintura e no quadril.

const m = vi.hoisted(() => ({
  save: vi.fn(async () => ({ id: 'avaliacao', updated_at: '2026-10-06T12:00:01Z' })),
  subject: { id: 'aluno', full_name: 'Homem Fictício', birth_date: '1996-01-01', sex: 'M', height_cm: 180 },
  row: {
    id: 'avaliacao', subject_id: 'aluno', org_id: 'org', evaluator_id: 'prof', assessed_at: '2026-10-05',
    created_at: '2026-10-05T12:00:00Z', updated_at: '2026-10-05T12:00:00Z', protocol_id: 'usNavy',
    weight_kg: 80, height_cm: 180, results: null as unknown, medications: null, notes: null,
  },
}))
vi.mock('react-router', async (original) => ({
  ...(await original<typeof import('react-router')>()),
  useParams: () => ({ id: 'aluno', assessmentId: 'avaliacao' }),
  useNavigate: () => vi.fn(),
}))
vi.mock('../features/organization/context', () => ({ useOrganization: () => ({ organization: { id: 'org', name: 'Fictícia' } }) }))
vi.mock('../features/auth/context', () => ({ useAuth: () => ({ user: { id: 'prof' } }) }))
vi.mock('../features/subjects/hooks', () => ({ useSubject: () => ({ data: m.subject, isPending: false }) }))
vi.mock('../features/consent/hooks', () => ({ useActiveConsent: () => ({ data: { id: 'consent' } }) }))
vi.mock('../features/assessment/hooks', () => ({
  useAssessment: () => ({ data: { assessment: m.row, skinfolds: [], circumferences: [
    { id: 'neck', site: 'neck', value_cm: 38 },
    { id: 'waist', site: 'waist', value_cm: 85 },
    { id: 'abdomen', site: 'abdomen', value_cm: 95 },
  ] } }),
  useCreateAssessment: () => ({ mutateAsync: m.save }),
  useUpdateAssessment: () => ({ mutateAsync: m.save }),
}))
vi.mock('../lib/draft', () => ({ clearDraft: vi.fn(), useFormDraft: () => ({ restored: false }) }))
vi.mock('../lib/unsavedChanges', () => ({ useUnsavedChanges: () => ({ allowNext: vi.fn() }) }))
vi.mock('../components/UnsavedChanges', () => ({ UnsavedBadge: () => null, UnsavedChangesPrompt: () => null }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  m.row.results = null
})

type Salvo = { result: { bodyFatPct: number; engineVersion: string; inputs: { circumferencesCm: Record<string, number> } } }
const salvo = () => (m.save.mock.calls[0] as unknown as [Salvo])[0]

it('homem: pede e usa o abdômen, e diz onde medir', async () => {
  render(<MemoryRouter><AvaliacaoNova /></MemoryRouter>)
  expect(screen.getByLabelText('Abdômen *')).toBeTruthy()
  expect(screen.getByLabelText('Cintura')).toBeTruthy()
  expect(screen.getByText(/US Navy, homens: abdômen na altura do umbigo/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  await waitFor(() => expect(m.save).toHaveBeenCalledOnce())
  expect(salvo().result.bodyFatPct).toBeCloseTo(usNavyBodyFatPct('M', 180, 38, 95), 10)
  expect(salvo().result.bodyFatPct).toBeCloseTo(23.2, 1)
  expect(salvo().result.inputs.circumferencesCm).toEqual({ neck: 38, abdomen: 95 })
  expect(salvo().result.engineVersion).toBe('1.2.0')
})

it('homem: mudar só a cintura não muda o percentual; mudar o abdômen muda', async () => {
  render(<MemoryRouter><AvaliacaoNova /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Cintura'), { target: { value: '70' } })
  fireEvent.change(screen.getByLabelText('Abdômen *'), { target: { value: '110' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  await waitFor(() => expect(m.save).toHaveBeenCalledOnce())
  expect(salvo().result.bodyFatPct).toBeCloseTo(usNavyBodyFatPct('M', 180, 38, 110), 10)
})

it('avaliação antiga calculada com a cintura avisa que será recalculada', () => {
  m.row.results = { protocolId: 'usNavy', engineVersion: '1.1.0', inputs: { circumferencesCm: { neck: 38, waist: 85 } } }
  render(<MemoryRouter><AvaliacaoNova /></MemoryRouter>)
  expect(screen.getByText(/Esta avaliação foi calculada com a cintura/)).toBeTruthy()
})
