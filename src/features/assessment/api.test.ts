import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))

import { createAssessment, mapCircumferences } from './api'

beforeEach(() => mocks.rpc.mockReset())

describe('mapCircumferences', () => {
  it('propaga a identidade e o desempate da avaliação do join', () => {
    expect(
      mapCircumferences([
        {
          site: 'waist',
          value_cm: 88,
          assessments: {
            id: 'assessment-2',
            assessed_at: '2026-08-20',
            created_at: '2026-08-20T10:00:00Z',
          },
        },
      ])
    ).toEqual([
      {
        assessmentId: 'assessment-2',
        assessedAt: '2026-08-20',
        assessmentCreatedAt: '2026-08-20T10:00:00Z',
        site: 'waist',
        valueCm: 88,
      },
    ])
  })
})

describe('createAssessment', () => {
  it('cria cabeçalho e leituras por uma única RPC atômica', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 'assessment-1' }, error: null })

    await createAssessment({
      orgId: 'org-1',
      subjectId: 'subject-1',
      assessedAt: '2026-08-20',
      protocolId: 'jp7',
      weightKg: 80,
      heightCm: 178,
      medications: null,
      notes: null,
      result: {
        engineVersion: 'test@1',
        protocolId: 'jp7',
        bodyDensity: 1.05,
        bodyFatPct: 18,
        conversions: { siri: 18, brozek: 17.5 },
        fatMassKg: 14.4,
        leanMassKg: 65.6,
        inputs: {
          sex: 'M',
          ageYears: 30,
          heightCm: 178,
          weightKg: 80,
          skinfoldsMm: {},
          circumferencesCm: {},
        },
      },
      skinfolds: [{ site: 'chest', reading_1: 10, reading_2: null, reading_3: null }],
      circumferences: [{ site: 'waist', value_cm: 88 }],
    })

    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith(
      'create_assessment',
      expect.objectContaining({
        p_subject: 'subject-1',
        p_skinfolds: [
          { site: 'chest', reading_1: 10, reading_2: null, reading_3: null },
        ],
        p_circumferences: [{ site: 'waist', value_cm: 88, is_custom: false }],
      })
    )
  })
})
