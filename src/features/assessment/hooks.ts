import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createAssessment,
  getAssessment,
  listAssessments,
  type CreateAssessmentInput,
} from './api'

export function useAssessments(subjectId: string | undefined) {
  return useQuery({
    queryKey: ['assessments', subjectId],
    queryFn: () => listAssessments(subjectId as string),
    enabled: !!subjectId,
  })
}

export function useAssessment(id: string | undefined) {
  return useQuery({
    queryKey: ['assessment', id],
    queryFn: () => getAssessment(id as string),
    enabled: !!id,
  })
}

export function useCreateAssessment(subjectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAssessmentInput) => createAssessment(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments', subjectId] })
    },
  })
}
