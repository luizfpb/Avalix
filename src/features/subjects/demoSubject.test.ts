import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createDemoSubject } from './demoSubject'

const {
  createSubjectMock,
  grantConsentMock,
  createAnamneseMock,
  createAssessmentMock,
  createFitnessTestMock,
  listExercisesMock,
  createWorkoutPlanMock,
} = vi.hoisted(() => ({
  createSubjectMock: vi.fn(),
  grantConsentMock: vi.fn(),
  createAnamneseMock: vi.fn(),
  createAssessmentMock: vi.fn(),
  createFitnessTestMock: vi.fn(),
  listExercisesMock: vi.fn(),
  createWorkoutPlanMock: vi.fn(),
}))

vi.mock('./api', () => ({
  createSubject: createSubjectMock,
}))

vi.mock('../consent/api', () => ({
  grantConsent: grantConsentMock,
}))

vi.mock('../anamnesis/api', () => ({
  createAnamnese: createAnamneseMock,
}))

vi.mock('../assessment/api', () => ({
  createAssessment: createAssessmentMock,
}))

vi.mock('../fitness/api', () => ({
  createFitnessTest: createFitnessTestMock,
}))

vi.mock('../workout/api', () => ({
  listExercises: listExercisesMock,
  createWorkoutPlan: createWorkoutPlanMock,
}))

describe('createDemoSubject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createSubjectMock.mockResolvedValue({
      id: 'sub-demo',
      org_id: 'org-1',
      full_name: 'Mariana Costa (Exemplo)',
    })
    grantConsentMock.mockResolvedValue({ id: 'con-1' })
    createAnamneseMock.mockResolvedValue({ id: 'ana-1' })
    createAssessmentMock
      .mockResolvedValueOnce({ id: 'ass-1' })
      .mockResolvedValueOnce({ id: 'ass-2' })
    createFitnessTestMock.mockResolvedValue({ id: 'fit-1' })
    listExercisesMock.mockResolvedValue([
      { id: 'ex-1', primary_muscle: 'quads', secondary_muscles: ['glutes'], movement_pattern: 'squat' },
      { id: 'ex-2', primary_muscle: 'chest', secondary_muscles: ['triceps'], movement_pattern: 'horizontal_push' },
      { id: 'ex-3', primary_muscle: 'back', secondary_muscles: ['biceps'], movement_pattern: 'horizontal_pull' },
      { id: 'ex-4', primary_muscle: 'hamstrings', secondary_muscles: ['glutes'], movement_pattern: 'hinge' },
      { id: 'ex-5', primary_muscle: 'shoulders', secondary_muscles: ['triceps'], movement_pattern: 'vertical_push' },
      { id: 'ex-6', primary_muscle: 'glutes', secondary_muscles: [], movement_pattern: 'isolation' },
    ])
    createWorkoutPlanMock.mockResolvedValue({ id: 'plan-1' })
  })

  it('cria cadastro, consentimento, anamnese, 2 avaliações, 2 baterias de testes e 1 plano ativo', async () => {
    const result = await createDemoSubject({
      orgId: 'org-1',
      orgName: 'Estúdio Exemplo',
      userId: 'user-1',
      now: new Date('2026-11-15T12:00:00Z'),
    })

    expect(result.id).toBe('sub-demo')
    expect(createSubjectMock).toHaveBeenCalledOnce()
    expect(grantConsentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 'sub-demo',
        orgId: 'org-1',
        collectedBy: 'user-1',
        signerKind: 'titular',
      })
    )
    expect(createAnamneseMock).toHaveBeenCalledOnce()
    expect(createAssessmentMock).toHaveBeenCalledTimes(2)
    expect(createFitnessTestMock).toHaveBeenCalledTimes(2)
    expect(createWorkoutPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        subjectId: 'sub-demo',
        status: 'active',
        sourceAssessmentId: 'ass-2',
      })
    )
  })
})
