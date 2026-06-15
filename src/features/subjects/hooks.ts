import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createSubject,
  getSubject,
  listSubjects,
  updateSubject,
  type SubjectInsert,
  type SubjectUpdate,
} from './api'

export function useSubjects(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['subjects', orgId],
    queryFn: () => listSubjects(orgId as string),
    enabled: !!orgId,
  })
}

export function useSubject(id: string | undefined) {
  return useQuery({
    queryKey: ['subject', id],
    queryFn: () => getSubject(id as string),
    enabled: !!id,
  })
}

export function useCreateSubject(orgId: string | null | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SubjectInsert) => createSubject(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subjects', orgId] })
    },
  })
}

export function useUpdateSubject(id: string | undefined, orgId: string | null | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: SubjectUpdate) => updateSubject(id as string, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subjects', orgId] })
      qc.invalidateQueries({ queryKey: ['subject', id] })
    },
  })
}
