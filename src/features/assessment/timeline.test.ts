import { describe, expect, it } from 'vitest'
import type { SubjectCircumference } from './api'
import {
  buildCircumferenceTimeline,
  groupCircumferencesByAssessment,
  sortAssessmentsChronologically,
} from './timeline'

describe('linha do tempo de avaliações', () => {
  it('desempata avaliações do mesmo dia por criação e id', () => {
    const rows = [
      { id: 'b', assessed_at: '2026-08-20', created_at: '2026-08-20T10:00:00Z' },
      { id: 'c', assessed_at: '2026-08-20', created_at: '2026-08-20T11:00:00Z' },
      { id: 'a', assessed_at: '2026-08-20', created_at: '2026-08-20T10:00:00Z' },
    ]

    expect(sortAssessmentsChronologically(rows).map((row) => row.id)).toEqual(['a', 'b', 'c'])
  })

  it('não funde circunferências de avaliações feitas no mesmo dia', () => {
    const rows: SubjectCircumference[] = [
      {
        assessmentId: 'assessment-1',
        assessedAt: '2026-08-20',
        assessmentCreatedAt: '2026-08-20T09:00:00Z',
        site: 'waist',
        valueCm: 90,
      },
      {
        assessmentId: 'assessment-2',
        assessedAt: '2026-08-20',
        assessmentCreatedAt: '2026-08-20T10:00:00Z',
        site: 'waist',
        valueCm: 88,
      },
    ]

    expect(groupCircumferencesByAssessment(rows).get('assessment-1')).toEqual([
      { site: 'waist', valueCm: 90 },
    ])
    const timeline = buildCircumferenceTimeline(rows)
    expect(timeline.current).toEqual([{ site: 'waist', valueCm: 88 }])
    expect(timeline.siteSeries[0].series).toEqual([
      { assessmentId: 'assessment-1', assessedAt: '2026-08-20', valueCm: 90 },
      { assessmentId: 'assessment-2', assessedAt: '2026-08-20', valueCm: 88 },
    ])
  })
})
