import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addPhoto,
  createSession,
  deletePhoto,
  getSession,
  listPhotos,
  listSessions,
  listSubjectPhotos,
  signedUrls,
  type AddPhotoInput,
  type PosturePhotoRow,
} from './api'

export function useSessions(subjectId: string | undefined) {
  return useQuery({
    queryKey: ['posture-sessions', subjectId],
    queryFn: () => listSessions(subjectId as string),
    enabled: !!subjectId,
  })
}

export function useSession(id: string | undefined) {
  return useQuery({
    queryKey: ['posture-session', id],
    queryFn: () => getSession(id as string),
    enabled: !!id,
  })
}

export function useCreateSession(subjectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof createSession>[0]) => createSession(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posture-sessions', subjectId] }),
  })
}

export function useSubjectPhotos(subjectId: string | undefined) {
  return useQuery({
    queryKey: ['posture-subject-photos', subjectId],
    queryFn: () => listSubjectPhotos(subjectId as string),
    enabled: !!subjectId,
  })
}

export function usePhotos(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['posture-photos', sessionId],
    queryFn: () => listPhotos(sessionId as string),
    enabled: !!sessionId,
  })
}

export function useAddPhoto(sessionId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AddPhotoInput) => addPhoto(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posture-photos', sessionId] }),
  })
}

export function useDeletePhoto(sessionId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (photo: PosturePhotoRow) => deletePhoto(photo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posture-photos', sessionId] }),
  })
}

// URLs assinadas expiram em 300s; renova a cada 240s pra não quebrar a imagem
// se a tela ficar aberta parada.
export function useSignedUrls(paths: string[]) {
  return useQuery({
    queryKey: ['signed-urls', [...paths].sort().join('|')],
    queryFn: () => signedUrls(paths),
    enabled: paths.length > 0,
    staleTime: 200_000,
    refetchInterval: 240_000,
    refetchIntervalInBackground: false,
  })
}
