import { useState, type ChangeEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useOrganization } from '../features/organization/context'
import {
  useSession,
  usePhotos,
  useAddPhoto,
  useDeletePhoto,
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
  const { organization } = useOrganization()
  const sessionQuery = useSession(sessionId)
  const photosQuery = usePhotos(sessionId)
  const addMut = useAddPhoto(sessionId)
  const deleteMut = useDeletePhoto(sessionId)

  const photos = photosQuery.data ?? []
  const thumbUrlsQuery = useSignedUrls(photos.map((p) => p.thumb_path))
  const thumbUrls = thumbUrlsQuery.data ?? {}

  const [category, setCategory] = useState<PhotoCategory>('frente')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<PosturePhotoRow | null>(null)
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)

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
      <div>
        <Link to={`/avaliados/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar
        </Link>
        <h1 className="mt-2 text-xl font-semibold">
          Sessão postural de {formatDate(session.taken_at)}
        </h1>
        {session.notes ? (
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{session.notes}</p>
        ) : null}
      </div>

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
                className="block w-full overflow-hidden rounded-md border bg-muted"
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
              </button>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{categoryLabel(photo.category)}</span>
                <button
                  type="button"
                  onClick={() => onDelete(photo)}
                  className="text-xs text-destructive hover:underline"
                >
                  Excluir
                </button>
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
              <img
                src={selectedUrl}
                alt={categoryLabel(selected.category)}
                className="max-h-[85vh] w-auto rounded-md"
              />
            ) : (
              <p className="text-sm text-white">Carregando...</p>
            )}
            <div className="mt-2 flex items-center justify-between gap-3 text-sm text-white">
              <span>{categoryLabel(selected.category)}</span>
              <button type="button" onClick={() => setSelected(null)} className="hover:underline">
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
