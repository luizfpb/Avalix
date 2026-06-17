import { supabase } from '../../lib/supabase'
import type { Database } from '../../lib/database.types'
import type { ProcessedImage } from './image'

export type PostureSessionRow = Database['public']['Tables']['posture_sessions']['Row']
export type PosturePhotoRow = Database['public']['Tables']['posture_photos']['Row']
export type PhotoCategory =
  | 'frente'
  | 'costas'
  | 'lateral_direita'
  | 'lateral_esquerda'
  | 'outra'

export const PHOTO_CATEGORIES: { value: PhotoCategory; label: string }[] = [
  { value: 'frente', label: 'Frente' },
  { value: 'costas', label: 'Costas' },
  { value: 'lateral_direita', label: 'Lateral direita' },
  { value: 'lateral_esquerda', label: 'Lateral esquerda' },
  { value: 'outra', label: 'Outra' },
]

export function categoryLabel(value: string): string {
  return PHOTO_CATEGORIES.find((c) => c.value === value)?.label ?? value
}

const BUCKET = 'photos'
const SIGNED_TTL = 300

export async function createSession(input: {
  orgId: string
  subjectId: string
  takenAt: string
  notes: string | null
}): Promise<PostureSessionRow> {
  const { data, error } = await supabase
    .from('posture_sessions')
    .insert({
      org_id: input.orgId,
      subject_id: input.subjectId,
      taken_at: input.takenAt,
      notes: input.notes,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function listSessions(subjectId: string): Promise<PostureSessionRow[]> {
  const { data, error } = await supabase
    .from('posture_sessions')
    .select('*')
    .eq('subject_id', subjectId)
    .order('taken_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getSession(id: string): Promise<PostureSessionRow | null> {
  const { data, error } = await supabase
    .from('posture_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function listPhotos(sessionId: string): Promise<PosturePhotoRow[]> {
  const { data, error } = await supabase
    .from('posture_photos')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at')
  if (error) throw error
  return data ?? []
}

export type SubjectPhoto = PosturePhotoRow & { takenAt: string }

// Todas as fotos do avaliado (via join com a sessão), pra comparação entre
// sessões. A RLS continua valendo foto a foto.
export async function listSubjectPhotos(subjectId: string): Promise<SubjectPhoto[]> {
  const { data, error } = await supabase
    .from('posture_photos')
    .select('*, posture_sessions!inner(subject_id, taken_at)')
    .eq('posture_sessions.subject_id', subjectId)
    .order('created_at', { ascending: true })
  if (error) throw error
  const rows = (data ?? []) as unknown as Array<
    PosturePhotoRow & { posture_sessions: { taken_at: string } | { taken_at: string }[] }
  >
  return rows.map(({ posture_sessions, ...rest }) => {
    const sess = Array.isArray(posture_sessions) ? posture_sessions[0] : posture_sessions
    return { ...rest, takenAt: sess?.taken_at ?? '' }
  })
}

export type AddPhotoInput = {
  orgId: string
  sessionId: string
  category: PhotoCategory
  customLabel: string | null
  image: ProcessedImage
}

// Fluxo do DECISIONS: 1) insere a linha (o trigger gera os paths canônicos e
// devolve no select); 2) sobe os arquivos exatamente nesses paths; 3) se o
// upload falhar, desfaz (arquivos e linha).
export async function addPhoto(input: AddPhotoInput): Promise<PosturePhotoRow> {
  const { data: photo, error } = await supabase
    .from('posture_photos')
    .insert({
      org_id: input.orgId,
      session_id: input.sessionId,
      category: input.category,
      custom_label: input.customLabel,
      format: input.image.format,
      width: input.image.width,
      height: input.image.height,
      size_bytes: input.image.sizeBytes,
      storage_path: '', // gerado pelo trigger posture_photo_init
      thumb_path: '', // idem
    })
    .select('*')
    .single()
  if (error) throw error

  const opts = { contentType: input.image.mime, upsert: false }
  const up1 = await supabase.storage.from(BUCKET).upload(photo.storage_path, input.image.main, opts)
  const up2 = up1.error
    ? null
    : await supabase.storage.from(BUCKET).upload(photo.thumb_path, input.image.thumb, opts)

  if (up1.error || up2?.error) {
    await supabase.storage.from(BUCKET).remove([photo.storage_path, photo.thumb_path])
    await supabase.from('posture_photos').delete().eq('id', photo.id)
    throw up1.error ?? up2?.error
  }
  return photo
}

// Exclusão definitiva: arquivos ANTES da linha (a policy resolve o objeto pela
// linha correspondente).
export async function deletePhoto(photo: PosturePhotoRow): Promise<void> {
  await supabase.storage.from(BUCKET).remove([photo.storage_path, photo.thumb_path])
  const { error } = await supabase.from('posture_photos').delete().eq('id', photo.id)
  if (error) throw error
}

// Exclusão da sessão inteira (também resolve sessões vazias abandonadas).
// Remove os arquivos de todas as fotos ANTES de apagar a sessão; o FK on delete
// cascade leva as linhas de posture_photos e suas anotações.
export async function deleteSession(sessionId: string): Promise<void> {
  const photos = await listPhotos(sessionId)
  const paths = photos.flatMap((p) => [p.storage_path, p.thumb_path])
  if (paths.length > 0) {
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths)
    if (rmErr) throw rmErr
  }
  const { error } = await supabase.from('posture_sessions').delete().eq('id', sessionId)
  if (error) throw error
}

export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL)
  if (error) throw error
  const map: Record<string, string> = {}
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl
  }
  return map
}
