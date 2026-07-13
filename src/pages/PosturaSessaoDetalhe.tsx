import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
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
import { controlClass } from '@/lib/ui'
import { cn } from '@/lib/utils'
import { normalizeDbError } from '../lib/errors'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { QueryError } from '../components/QueryError'

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

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
  const [selectedUrlError, setSelectedUrlError] = useState<string | null>(null)
  const selectedAnnotation = useAnnotation(selected?.id)
  const lightboxRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = lightboxRef.current
    if (selected && dialog && !dialog.open) dialog.showModal()
  }, [selected])

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
      setUploadError(normalizeDbError(err))
    } finally {
      setUploading(false)
    }
  }

  async function openPhoto(photo: PosturePhotoRow) {
    setSelected(photo)
    setSelectedUrl(null)
    setSelectedUrlError(null)
    try {
      const map = await signedUrls([photo.storage_path])
      setSelectedUrl(map[photo.storage_path] ?? null)
    } catch {
      setSelectedUrl(null)
      setSelectedUrlError('Não foi possível carregar a imagem ampliada.')
    }
  }

  const [confirmPhoto, setConfirmPhoto] = useState<PosturePhotoRow | null>(null)
  const [confirmSession, setConfirmSession] = useState(false)

  function onDelete(photo: PosturePhotoRow) {
    setConfirmPhoto(photo)
  }

  async function onDeleteSession() {
    if (!sessionId) return
    setConfirmSession(false)
    try {
      await deleteSessionMut.mutateAsync(sessionId)
      navigate(`/avaliados/${id}`)
    } catch {
      // erro mostrado abaixo
    }
  }

  if (
    sessionQuery.isPending ||
    photosQuery.isPending ||
    thumbUrlsQuery.isPending ||
    annotatedQuery.isPending
  ) {
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
  if (photosQuery.isError || thumbUrlsQuery.isError || annotatedQuery.isError) {
    return (
      <QueryError
        message="Não foi possível carregar todas as fotos e anotações da sessão."
        onRetry={() => void Promise.all([
          photosQuery.refetch(),
          thumbUrlsQuery.refetch(),
          annotatedQuery.refetch(),
        ])}
      />
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
          onClick={() => setConfirmSession(true)}
        >
          {deleteSessionMut.isPending ? 'Excluindo...' : 'Excluir sessão'}
        </Button>
      </div>

      {deleteSessionMut.error ? (
        <p className="text-sm text-destructive">{normalizeDbError(deleteSessionMut.error)}</p>
      ) : null}

      <ConfirmDialog
        open={confirmPhoto != null}
        title="Excluir foto?"
        description="A foto e a miniatura serão removidas do armazenamento. Esta ação é definitiva."
        onConfirm={() => {
          if (confirmPhoto) deleteMut.mutate(confirmPhoto)
          setConfirmPhoto(null)
        }}
        onCancel={() => setConfirmPhoto(null)}
      />
      <ConfirmDialog
        open={confirmSession}
        title="Excluir sessão inteira?"
        description="Todas as fotos desta sessão serão removidas. Esta ação é definitiva."
        onConfirm={onDeleteSession}
        onCancel={() => setConfirmSession(false)}
      />

      <div className="flex flex-wrap items-end gap-3 rounded-md border p-4">
        <div className="space-y-1.5">
            <Label htmlFor="posture-category">Categoria</Label>
          <select
            id="posture-category"
            className={cn(controlClass, 'w-auto')}
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

      {uploadError ? <p role="alert" className="text-sm text-destructive">{uploadError}</p> : null}

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
        <dialog
          ref={lightboxRef}
          aria-labelledby="posture-lightbox-title"
          onClose={() => setSelected(null)}
          onClick={(event) => {
            if (event.target === event.currentTarget) event.currentTarget.close()
          }}
          className="m-auto max-h-screen max-w-[calc(100vw-2rem)] overflow-visible border-0 bg-transparent p-0 text-white backdrop:bg-black/80"
        >
          <div className="max-h-full max-w-3xl">
            {selectedAnnotation.isError ? (
              <div role="alert" className="space-y-2 rounded-md bg-black/80 p-4 text-sm text-white">
                <p>Não foi possível carregar as anotações desta foto.</p>
                <button type="button" className="min-h-10 rounded-md border px-3" onClick={() => void selectedAnnotation.refetch()}>
                  Tentar novamente
                </button>
              </div>
            ) : selectedAnnotation.isPending ? (
              <p className="text-sm text-white">Carregando anotações...</p>
            ) : selectedUrl ? (
              <AnnotationCanvas
                src={selectedUrl}
                shapes={selectedAnnotation.data?.doc.shapes ?? []}
                readOnly
                imgClassName="block max-h-[85vh] w-auto max-w-full rounded-md"
              />
            ) : selectedUrlError ? (
              <p role="alert" className="rounded-md bg-black/70 p-4 text-sm text-white">{selectedUrlError}</p>
            ) : (
              <p className="text-sm text-white">Carregando...</p>
            )}
            <div className="mt-2 flex items-center justify-between gap-3 text-sm text-white">
              <span id="posture-lightbox-title">{categoryLabel(selected.category)}</span>
              <div className="flex items-center gap-4">
                <Link
                  to={`/avaliados/${id}/postural/${sessionId}/foto/${selected.id}`}
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  <PenLine className="size-4" /> Anotar
                </Link>
                <button type="button" onClick={() => lightboxRef.current?.close()} className="min-h-10 rounded-md px-2 hover:bg-white/10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  )
}
