import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSubjectPhotos, useSignedUrls } from '../features/posture/hooks'
import { categoryLabel, type SubjectPhoto } from '../features/posture/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const controlClass =
  'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

function photoLabel(p: SubjectPhoto): string {
  return `${formatDate(p.takenAt)} · ${categoryLabel(p.category)}`
}

export default function PosturaComparar() {
  const { id } = useParams()
  const photosQuery = useSubjectPhotos(id)
  const photos = photosQuery.data ?? []
  const urls = useSignedUrls(photos.map((p) => p.storage_path)).data ?? {}

  const [aId, setAId] = useState('')
  const [bId, setBId] = useState('')
  const [mode, setMode] = useState<'lado' | 'sobre'>('lado')
  const [opacity, setOpacity] = useState(50)

  useEffect(() => {
    if (photos.length > 0 && !aId) setAId(photos[0].id)
    if (photos.length > 1 && !bId) setBId(photos[photos.length - 1].id)
  }, [photos, aId, bId])

  if (photosQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }

  const back = (
    <Link to={`/avaliados/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
      ← Voltar
    </Link>
  )

  if (photos.length < 2) {
    return (
      <div className="space-y-3">
        {back}
        <p className="text-sm text-muted-foreground">
          São necessárias pelo menos 2 fotos para comparar.
        </p>
      </div>
    )
  }

  const a = photos.find((p) => p.id === aId)
  const b = photos.find((p) => p.id === bId)

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        {back}
        <h1 className="mt-2 text-xl font-semibold">Comparar fotos</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Foto A</Label>
          <select className={controlClass} value={aId} onChange={(e) => setAId(e.target.value)}>
            {photos.map((p) => (
              <option key={p.id} value={p.id}>
                {photoLabel(p)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Foto B</Label>
          <select className={controlClass} value={bId} onChange={(e) => setBId(e.target.value)}>
            {photos.map((p) => (
              <option key={p.id} value={p.id}>
                {photoLabel(p)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={mode === 'lado' ? 'default' : 'outline'}
            onClick={() => setMode('lado')}
          >
            Lado a lado
          </Button>
          <Button
            size="sm"
            variant={mode === 'sobre' ? 'default' : 'outline'}
            onClick={() => setMode('sobre')}
          >
            Sobreposição
          </Button>
        </div>
        {mode === 'sobre' ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Opacidade B
            <input
              type="range"
              min={0}
              max={100}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
            <span className="w-9 tabular-nums">{opacity}%</span>
          </label>
        ) : null}
      </div>

      {a && b ? (
        mode === 'lado' ? (
          <div className="grid grid-cols-2 gap-3">
            {[a, b].map((p, i) => (
              <figure key={i} className="space-y-1">
                <div className="overflow-hidden rounded-md border bg-muted">
                  {urls[p.storage_path] ? (
                    <img src={urls[p.storage_path]} alt={photoLabel(p)} className="w-full" />
                  ) : (
                    <div className="flex aspect-[3/4] items-center justify-center text-xs text-muted-foreground">
                      ...
                    </div>
                  )}
                </div>
                <figcaption className="text-center text-xs text-muted-foreground">
                  {photoLabel(p)}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative mx-auto max-w-md overflow-hidden rounded-md border bg-muted">
              {urls[a.storage_path] ? (
                <img src={urls[a.storage_path]} alt={photoLabel(a)} className="w-full" />
              ) : null}
              {urls[b.storage_path] ? (
                <img
                  src={urls[b.storage_path]}
                  alt={photoLabel(b)}
                  style={{ opacity: opacity / 100 }}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : null}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              A: {photoLabel(a)} · B: {photoLabel(b)}
            </p>
          </div>
        )
      ) : null}
    </div>
  )
}
