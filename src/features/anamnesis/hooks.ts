import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createAnamnese,
  getAnamnese,
  listAnamneses,
  setLiberacaoMedica,
  updateAnamnese,
  type CreateAnamneseInput,
  type UpdateAnamneseInput,
} from './api'
import type { LiberacaoInput } from './clearance'

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

// Edição: invalida a lista do avaliado (badge de liberado/encaminhamento no
// perfil) e o detalhe da própria anamnese.
export function useUpdateAnamnese(subjectId: string | undefined, id: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateAnamneseInput) => updateAnamnese(id as string, input),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['anamneses', subjectId] })
      qc.invalidateQueries({ queryKey: ['anamnese', row.id] })
    },
  })
}

// Parecer médico: invalida as mesmas duas chaves da edição, porque o registro
// muda o tom do aviso no detalhe, no badge do perfil e no banner do builder.
export function useSetLiberacaoMedica(subjectId: string | undefined, id: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LiberacaoInput) => setLiberacaoMedica(id as string, input),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['anamneses', subjectId] })
      qc.invalidateQueries({ queryKey: ['anamnese', row.id] })
    },
  })
}
