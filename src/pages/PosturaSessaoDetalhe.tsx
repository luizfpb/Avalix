import { useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PenLine } from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import {
  useSession,
  usePhotos,
  useAddPhoto,
  useDeletePhoto,
  useDeleteSession,
  useAnnotatedPhotoIds,
  useAnnotation,
  useSignedUrls,
} from '../features/posture/hooks'
import {
  signedUrls,
  categoryLabel,
  PHOTO_CATEGORIES,
  type PhotoCategory,
  type PosturePhotoRow,
} from '../features/posture/api'
import { processImage } from '../features/posture/image'
import { AnnotationCanvas } from '../components/AnnotationCanvas'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

const controlClass =
  'rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

export default function PosturaSessaoDetalhe() {
  const { id, sessionId } = useParams()
  const navigate = useNavigate()
  const { organization } = useOrganization()
  const sessionQuery = useSession(sessionId)
  const photosQuery = usePhotos(sessionId)
  const addMut = useAddPhoto(sessionId)
  const deleteMut = useDeletePhoto(sessionId)
  const deleteSessionMut = useDeleteSession(id)

  const photos = photosQuery.data ?? []
  const thumbUrlsQuery = useSignedUrls(photos.map((p) => p.thumb_path))
  const thumbUrls = thumbUrlsQuery.data ?? {}
  const annotatedQuery = useAnnotatedPhotoIds(sessionId, photos.map((p) => p.id))
  const annotated = annotatedQuery.data ?? new Set<string>()

  const [category, setCategory] = useState<PhotoCategory>('frente')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<PosturePhotoRow | null>(null)
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const selectedAnnotation = useAnnotation(selected?.id)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite reenviar o mesmo arquivo
    if (!file || !organization || !sessionId) return
    setUploadError(null)
    setUploading(true)
    try {
      const image = await processImage(file)
      await addMut.mutateAsync({
        orgId: organization.id,
        sessionId,
        category,
        customLabel: null,
        image,
      })
    } catch (err) {
      setUploadError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function openPhoto(photo: PosturePhotoRow) {
    setSelected(photo)
    setSelectedUrl(null)
    try {
      const map = await signedUrls([photo.storage_path])
      setSelectedUrl(map[photo.storage_path] ?? null)
    } catch {
      setSelectedUrl(null)
    }
  }

  function onDelete(photo: PosturePhotoRow) {
    if (!window.confirm('Excluir esta foto? Esta ação é definitiva.')) return
    deleteMut.mutate(photo)
  }

  async function onDeleteSession() {
    if (!sessionId) return
    if (
      !window.confirm('Excluir esta sessão inteira e todas as fotos dela? Esta ação é definitiva.')
    )
      return
    try {
      await deleteSessionMut.mutateAsync(sessionId)
      navigate(`/avaliados/${id}`)
    } catch {
      // erro mostrado abaixo
    }
  }

  if (sessionQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }
  if (sessionQuery.isError || !sessionQuery.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Não foi possível carregar a sessão.</p>
        <Button asChild variant="outline">
          <Link to={`/avaliados/${id}`}>Voltar</Link>
        </Button>
      </div>
    )
  }

  const session = sessionQuery.data

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            to={`/avaliados/${id}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Voltar
          </Link>
          <h1 className="mt-2 text-xl font-semibold">
            Sessão postural de {formatDate(session.taken_at)}
          </h1>
          {session.notes ? (
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{session.notes}</p>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive"
          disabled={deleteSessionMut.isPending}
          onClick={onDeleteSession}
        >
          {deleteSessionMut.isPending ? 'Excluindo...' : 'Excluir sessão'}
        </Button>
      </div>

      {deleteSessionMut.error ? (
        <p className="text-sm text-destructive">{(deleteSessionMut.error as Error).message}</p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-md border p-4">
        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <select
            className={controlClass}
            value={category}
            onChange={(e) => setCategory(e.target.value as PhotoCategory)}
          >
            {PHOTO_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <label className="inline-flex">
          <span
            className="inline-flex h-9 cursor-pointer items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 aria-disabled:opacity-50"
            aria-disabled={uploading}
          >
            {uploading ? 'Enviando...' : 'Adicionar foto'}
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={uploading}
            onChange={onFile}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          A foto é comprimida no dispositivo e tem a localização (GPS) removida antes do envio.
        </p>
      </div>

      {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}

      {photosQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando fotos...</p>
      ) : photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <div key={photo.id} className="space-y-1">
              <button
                type="button"
                onClick={() => openPhoto(photo)}
                className="relative block w-full overflow-hidden rounded-md border bg-muted"
              >
                {thumbUrls[photo.thumb_path] ? (
                  <img
                    src={thumbUrls[photo.thumb_path]}
                    alt={categoryLabel(photo.category)}
                    className="aspect-[3/4] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[3/4] w-full items-center justify-center text-xs text-muted-foreground">
                    ...
                  </div>
                )}
                {annotated.has(photo.id) ? (
                  <span
                    title="Tem anotações"
                    className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-amber-500 text-white shadow"
                  >
                    <PenLine className="size-3.5" />
                  </span>
                ) : null}
              </button>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-muted-foreground">
                  {categoryLabel(photo.category)}
                </span>
                <div className="flex shrink-0 items-center gap-2 text-xs">
                  <Link
                    to={`/avaliados/${id}/postural/${sessionId}/foto/${photo.id}`}
                    className="text-primary hover:underline"
                  >
                    Anotar
                  </Link>
                  <button
                    type="button"
                    onClick={() => onDelete(photo)}
                    className="text-destructive hover:underline"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Nenhuma foto nesta sessão ainda.
        </div>
      )}

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelected(null)}
        >
          <div className="max-h-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            {selectedUrl ? (
              <AnnotationCanvas
                src={selectedUrl}
                shapes={selectedAnnotation.data?.doc.shapes ?? []}
                readOnly
                imgClassName="block max-h-[85vh] w-auto max-w-full rounded-md"
              />
            ) : (
              <p className="text-sm text-white">Carregando...</p>
            )}
            <div className="mt-2 flex items-center justify-between gap-3 text-sm text-white">
              <span>{categoryLabel(selected.category)}</span>
              <div className="flex items-center gap-4">
                <Link
                  to={`/avaliados/${id}/postural/${sessionId}/foto/${selected.id}`}
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  <PenLine className="size-4" /> Anotar
                </Link>
                <button type="button" onClick={() => setSelected(null)} className="hover:underline">
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
