import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createAppointment,
  deleteAppointment,
  listAppointments,
  type CreateAppointmentInput,
} from './api'

export function useAppointments(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['appointments', orgId],
    queryFn: () => listAppointments(orgId as string),
    enabled: !!orgId,
  })
}

export function useCreateAppointment(orgId: string | null | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAppointmentInput) => createAppointment(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments', orgId] })
    },
  })
}

export function useDeleteAppointment(orgId: string | null | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAppointment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments', orgId] })
    },
  })
}
