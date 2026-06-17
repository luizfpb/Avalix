import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addPhoto,
  createSession,
  deletePhoto,
  deleteSession,
  getAnnotation,
  getPhoto,
  getSession,
  listAnnotatedPhotoIds,
  listPhotos,
  listSessions,
  listSubjectPhotos,
  saveAnnotation,
  signedUrls,
  type AddPhotoInput,
  type PosturePhotoRow,
} from './api'
import type { Shape } from './annotations'

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

export function usePhoto(photoId: string | undefined) {
  return useQuery({
    queryKey: ['posture-photo', photoId],
    queryFn: () => getPhoto(photoId as string),
    enabled: !!photoId,
  })
}

export function useAnnotation(photoId: string | undefined) {
  return useQuery({
    queryKey: ['posture-annotation', photoId],
    queryFn: () => getAnnotation(photoId as string),
    enabled: !!photoId,
  })
}

export function useSaveAnnotation(photoId: string | undefined, sessionId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { orgId: string; rowId: string | null; shapes: Shape[] }) =>
      saveAnnotation({ photoId: photoId as string, ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posture-annotation', photoId] })
      qc.invalidateQueries({ queryKey: ['posture-annotated', sessionId] })
    },
  })
}

// Conjunto de fotos da sessão que têm anotações (pra marcar na grade).
export function useAnnotatedPhotoIds(sessionId: string | undefined, photoIds: string[]) {
  return useQuery({
    queryKey: ['posture-annotated', sessionId],
    queryFn: () => listAnnotatedPhotoIds(photoIds),
    enabled: !!sessionId && photoIds.length > 0,
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

export function useDeleteSession(subjectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => deleteSession(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posture-sessions', subjectId] }),
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
