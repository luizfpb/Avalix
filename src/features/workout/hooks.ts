import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCustomExercise,
  createWorkoutLog,
  createWorkoutPlan,
  deleteCustomExercise,
  deleteWorkoutLog,
  deleteWorkoutPlan,
  getWorkoutPlan,
  listExercises,
  listPlanSetHistory,
  listWorkoutLogs,
  listWorkoutPlans,
  setWorkoutPlanStatus,
  updateCustomExercise,
  updateWorkoutPlan,
  type CreateExerciseInput,
  type CreateWorkoutLogInput,
  type SaveWorkoutPlanInput,
  type UpdateExerciseInput,
} from './api'

export function useExercises(orgId: string | undefined) {
  return useQuery({
    queryKey: ['exercises', orgId],
    queryFn: () => listExercises(orgId as string),
    enabled: !!orgId,
    // catalogo muda pouco; mantem em cache por mais tempo
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateCustomExercise(orgId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateExerciseInput) => createCustomExercise(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exercises', orgId] })
    },
  })
}

export function useUpdateCustomExercise(orgId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateExerciseInput }) =>
      updateCustomExercise(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exercises', orgId] })
    },
  })
}

export function useDeleteCustomExercise(orgId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteCustomExercise(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exercises', orgId] })
    },
  })
}

export function useWorkoutPlans(subjectId: string | undefined) {
  return useQuery({
    queryKey: ['workout-plans', subjectId],
    queryFn: () => listWorkoutPlans(subjectId as string),
    enabled: !!subjectId,
  })
}

export function useWorkoutPlan(id: string | undefined) {
  return useQuery({
    queryKey: ['workout-plan', id],
    queryFn: () => getWorkoutPlan(id as string),
    enabled: !!id,
  })
}

export function useCreateWorkoutPlan(subjectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveWorkoutPlanInput) => createWorkoutPlan(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-plans', subjectId] })
    },
  })
}

export function useUpdateWorkoutPlan(
  subjectId: string | undefined,
  planId: string | undefined
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveWorkoutPlanInput) => updateWorkoutPlan(planId as string, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-plans', subjectId] })
      qc.invalidateQueries({ queryKey: ['workout-plan', planId] })
    },
  })
}

export function useDeleteWorkoutPlan(subjectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteWorkoutPlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-plans', subjectId] })
    },
  })
}

// Duplica um plano (mesmo ou outro avaliado). Invalida a lista do avaliado de
// destino, lido da linha criada (subject_id pode diferir do plano de origem).
export function useDuplicateWorkoutPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveWorkoutPlanInput) => createWorkoutPlan(input),
    onSuccess: (plan) => {
      qc.invalidateQueries({ queryKey: ['workout-plans', plan.subject_id] })
    },
  })
}

export function useWorkoutLogs(planId: string | undefined) {
  return useQuery({
    queryKey: ['workout-logs', planId],
    queryFn: () => listWorkoutLogs(planId as string),
    enabled: !!planId,
  })
}

export function usePlanSetHistory(planId: string | undefined) {
  return useQuery({
    queryKey: ['workout-set-history', planId],
    queryFn: () => listPlanSetHistory(planId as string),
    enabled: !!planId,
  })
}

export function useCreateWorkoutLog(planId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateWorkoutLogInput) => createWorkoutLog(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-logs', planId] })
      qc.invalidateQueries({ queryKey: ['workout-set-history', planId] })
    },
  })
}

export function useDeleteWorkoutLog(planId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteWorkoutLog(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-logs', planId] })
      qc.invalidateQueries({ queryKey: ['workout-set-history', planId] })
    },
  })
}

export function useSetWorkoutPlanStatus(
  subjectId: string | undefined,
  planId: string | undefined
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (status: string) => setWorkoutPlanStatus(planId as string, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-plans', subjectId] })
      qc.invalidateQueries({ queryKey: ['workout-plan', planId] })
    },
  })
}
