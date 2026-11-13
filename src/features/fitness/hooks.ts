import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createFitnessTest,
  deleteFitnessTest,
  getFitnessTest,
  listFitnessTests,
  updateFitnessTest,
  type FitnessTestInput,
} from './api'

export function useFitnessTests(subjectId: string | undefined) {
  return useQuery({
    queryKey: ['fitness-tests', subjectId],
    queryFn: () => listFitnessTests(subjectId as string),
    enabled: !!subjectId,
  })
}

export function useFitnessTest(id: string | undefined) {
  return useQuery({
    queryKey: ['fitness-test', id],
    queryFn: () => getFitnessTest(id as string),
    enabled: !!id,
  })
}

export function useCreateFitnessTest(subjectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: FitnessTestInput) => createFitnessTest(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fitness-tests', subjectId] }),
  })
}

export function useUpdateFitnessTest(subjectId: string | undefined, id: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: {
      input: Pick<FitnessTestInput, 'testedAt' | 'measures' | 'notes'>
      expectedUpdatedAt: string
    }) => updateFitnessTest(id as string, args.input, args.expectedUpdatedAt),
    onSuccess: (row) => {
      qc.setQueryData(['fitness-test', id], row)
      return qc.invalidateQueries({ queryKey: ['fitness-tests', subjectId] })
    },
  })
}

export function useDeleteFitnessTest(subjectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteFitnessTest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fitness-tests', subjectId] }),
  })
}
