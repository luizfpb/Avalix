import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { PenLine } from 'lucide-react'
import { useSubjectPhotos, useSignedUrls, useAnnotation } from '../features/posture/hooks'
import { categoryLabel, type SubjectPhoto } from '../features/posture/api'
import { AnnotationCanvas } from '../components/AnnotationCanvas'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

import { controlClass } from '@/lib/ui'
import { QueryError } from '../components/QueryError'

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
  const photos = useMemo(() => photosQuery.data ?? [], [photosQuery.data])
  const urlsQuery = useSignedUrls(photos.map((p) => p.storage_path))
  const urls = urlsQuery.data ?? {}

  const [aId, setAId] = useState('')
  const [bId, setBId] = useState('')
  const [mode, setMode] = useState<'lado' | 'sobre'>('lado')
  const [opacity, setOpacity] = useState(50)
  const [showAnn, setShowAnn] = useState(true)

  // anotações das duas fotos escolhidas (hooks antes de qualquer return)
  const annA = useAnnotation(aId || undefined)
  const annB = useAnnotation(bId || undefined)
  const shapesById: Record<string, ReturnType<typeof useAnnotation>['data']> = {
    [aId]: annA.data,
    [bId]: annB.data,
  }

  useEffect(() => {
    if (photos.length > 0 && !aId) setAId(photos[0].id)
    if (photos.length > 1 && !bId) setBId(photos[photos.length - 1].id)
  }, [photos, aId, bId])

  if (photosQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }

  if (photosQuery.isError || urlsQuery.isError) {
    return (
      <QueryError
        message="Não foi possível carregar as fotos para comparação."
        onRetry={() => {
          void Promise.all([photosQuery.refetch(), urlsQuery.refetch()])
        }}
      />
    )
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
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Comparar fotos</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="posture-photo-a">Foto A</Label>
          <select id="posture-photo-a" className={controlClass} value={aId} onChange={(e) => setAId(e.target.value)}>
            {photos.map((p) => (
              <option key={p.id} value={p.id}>
                {photoLabel(p)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="posture-photo-b">Foto B</Label>
          <select id="posture-photo-b" className={controlClass} value={bId} onChange={(e) => setBId(e.target.value)}>
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
            aria-pressed={mode === 'lado'}
            onClick={() => setMode('lado')}
          >
            Lado a lado
          </Button>
          <Button
            size="sm"
            variant={mode === 'sobre' ? 'default' : 'outline'}
            aria-pressed={mode === 'sobre'}
            onClick={() => setMode('sobre')}
          >
            Sobreposição
          </Button>
        </div>
        {mode === 'lado' ? (
          <Button
            size="sm"
            variant={showAnn ? 'default' : 'outline'}
            aria-pressed={showAnn}
            onClick={() => setShowAnn((v) => !v)}
          >
            <PenLine /> Anotações
          </Button>
        ) : null}
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

      {mode === 'sobre' && a && b && a.category !== b.category ? (
        <p role="alert" className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
          As fotos têm categorias diferentes ({categoryLabel(a.category)} e {categoryLabel(b.category)}). A sobreposição pode induzir uma comparação incorreta.
        </p>
      ) : null}
      {mode === 'sobre' && a && b && a.width != null && a.height != null && b.width != null && b.height != null && Math.abs(a.width / a.height - b.width / b.height) > 0.05 ? (
        <p role="alert" className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
          As fotos têm proporções diferentes. Elas serão centralizadas sem recorte; use pontos de referência antes de interpretar o alinhamento.
        </p>
      ) : null}
      {mode === 'lado' && (annA.isError || annB.isError) ? (
        <QueryError
          message="As fotos foram carregadas, mas não foi possível carregar todas as anotações."
          onRetry={() => {
            void Promise.all([annA.refetch(), annB.refetch()])
          }}
        />
      ) : null}

      {a && b ? (
        mode === 'lado' ? (
          <div className="grid grid-cols-2 gap-3">
            {[a, b].map((p, i) => {
              const url = urls[p.storage_path]
              const shapes = shapesById[p.id]?.doc.shapes ?? []
              return (
                <figure key={i} className="space-y-1">
                  <div className="overflow-hidden rounded-md border bg-muted">
                    {!url ? (
                      <div className="flex aspect-[3/4] items-center justify-center text-xs text-muted-foreground">
                        ...
                      </div>
                    ) : showAnn ? (
                      <AnnotationCanvas
                        src={url}
                        shapes={shapes}
                        readOnly
                        containerClassName="relative block w-full"
                        imgClassName="block h-auto w-full"
                      />
                    ) : (
                      <img src={url} alt={photoLabel(p)} className="w-full" />
                    )}
                  </div>
                  <figcaption className="text-center text-xs text-muted-foreground">
                    {photoLabel(p)}
                    {showAnn && shapes.length > 0 ? (
                      <span className="ml-1 text-amber-600 dark:text-amber-400">· anotada</span>
                    ) : null}
                  </figcaption>
                </figure>
              )
            })}
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
                  className="absolute inset-0 h-full w-full object-contain"
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
