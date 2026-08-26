// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SourceCard } from './SourceCard'

vi.mock('../assessment/hooks', () => ({ useAssessments: () => ({ data: [] }) }))
vi.mock('../posture/hooks', () => ({ useSessions: () => ({ data: [] }) }))

afterEach(cleanup)

describe('SourceCard', () => {
  it('associa os rótulos aos dois seletores de origem', () => {
    render(
      <SourceCard
        subjectId="subject-1"
        assessmentId={null}
        sessionId={null}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Avaliação física de origem')).toBeTruthy()
    expect(screen.getByLabelText('Avaliação postural de origem')).toBeTruthy()
  })
})
