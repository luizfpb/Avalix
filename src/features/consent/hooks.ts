import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getActiveConsent, grantConsent, revokeConsent, type GrantConsentInput } from './api'

export function useActiveConsent(subjectId: string | undefined) {
  return useQuery({
    queryKey: ['consent', subjectId],
    queryFn: () => getActiveConsent(subjectId as string),
    enabled: !!subjectId,
  })
}

export function useGrantConsent(subjectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: GrantConsentInput) => grantConsent(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consent', subjectId] })
    },
  })
}

export function useRevokeConsent(subjectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (consentId: string) => revokeConsent(consentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consent', subjectId] })
    },
  })
}
