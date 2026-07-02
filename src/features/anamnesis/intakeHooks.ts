import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acceptIntake,
  cancelIntake,
  generateIntakeLink,
  getIntake,
  listPendingIntakes,
  listSubjectIntakes,
  rejectIntake,
} from './intake'
import type { AnamnesisAnswers } from './spec'

export function useSubjectIntakes(subjectId: string | undefined) {
  return useQuery({
    queryKey: ['intakes', subjectId],
    queryFn: () => listSubjectIntakes(subjectId as string),
    enabled: !!subjectId,
  })
}

export function usePendingIntakes(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['pending-intakes', orgId],
    queryFn: () => listPendingIntakes(orgId as string),
    enabled: !!orgId,
  })
}

export function useIntake(intakeId: string | undefined) {
  return useQuery({
    queryKey: ['intake', intakeId],
    queryFn: () => getIntake(intakeId as string),
    enabled: !!intakeId,
  })
}

export function useGenerateIntakeLink(subjectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { subjectId: string; orgId: string }) => generateIntakeLink(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['intakes', subjectId] }),
  })
}

export function useCancelIntake(subjectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => cancelIntake(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['intakes', subjectId] }),
  })
}

export function useAcceptIntake(subjectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { intakeId: string; answers: AnamnesisAnswers }) => acceptIntake(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intakes', subjectId] })
      qc.invalidateQueries({ queryKey: ['anamneses', subjectId] })
      qc.invalidateQueries({ queryKey: ['pending-intakes'] })
    },
  })
}

export function useRejectIntake(subjectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => rejectIntake(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intakes', subjectId] })
      qc.invalidateQueries({ queryKey: ['pending-intakes'] })
    },
  })
}
