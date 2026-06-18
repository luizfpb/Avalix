import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createAnamnese, getAnamnese, listAnamneses, type CreateAnamneseInput } from './api'

export function useAnamneses(subjectId: string | undefined) {
  return useQuery({
    queryKey: ['anamneses', subjectId],
    queryFn: () => listAnamneses(subjectId as string),
    enabled: !!subjectId,
  })
}

export function useAnamnese(id: string | undefined) {
  return useQuery({
    queryKey: ['anamnese', id],
    queryFn: () => getAnamnese(id as string),
    enabled: !!id,
  })
}

export function useCreateAnamnese(subjectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAnamneseInput) => createAnamnese(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['anamneses', subjectId] }),
  })
}
