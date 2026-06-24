import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCustomExercise,
  createWorkoutPlan,
  deleteCustomExercise,
  deleteWorkoutPlan,
  getWorkoutPlan,
  listExercises,
  listWorkoutPlans,
  updateWorkoutPlan,
  type CreateExerciseInput,
  type SaveWorkoutPlanInput,
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
