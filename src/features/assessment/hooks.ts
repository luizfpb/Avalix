import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createAssessment,
  deleteAssessment,
  getAssessment,
  listAssessments,
  listLastAssessmentBySubject,
  listSubjectCircumferences,
  updateAssessment,
  type CreateAssessmentInput,
} from './api'

export function useLastAssessmentBySubject(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['last-assessment-by-subject', orgId],
    queryFn: () => listLastAssessmentBySubject(orgId as string),
    enabled: !!orgId,
  })
}

export function useSubjectCircumferences(subjectId: string | undefined) {
  return useQuery({
    queryKey: ['subject-circumferences', subjectId],
    queryFn: () => listSubjectCircumferences(subjectId as string),
    enabled: !!subjectId,
  })
}

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
      qc.invalidateQueries({ queryKey: ['subject-circumferences', subjectId] })
    },
  })
}

export function useUpdateAssessment(
  subjectId: string | undefined,
  assessmentId: string | undefined
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAssessmentInput) => updateAssessment(assessmentId as string, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments', subjectId] })
      qc.invalidateQueries({ queryKey: ['assessment', assessmentId] })
      qc.invalidateQueries({ queryKey: ['subject-circumferences', subjectId] })
    },
  })
}

export function useDeleteAssessment(subjectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAssessment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments', subjectId] })
      qc.invalidateQueries({ queryKey: ['subject-circumferences', subjectId] })
    },
  })
}
