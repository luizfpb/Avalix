import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  MousePointer2,
  Dot,
  Slash,
  Triangle,
  Trash2,
  Eraser,
  Save,
  type LucideIcon,
} from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import { usePhoto, useAnnotation, useSaveAnnotation, useSignedUrls } from '../features/posture/hooks'
import { categoryLabel } from '../features/posture/api'
import type { Shape } from '../features/posture/annotations'
import { AnnotationCanvas, type Tool } from '../components/AnnotationCanvas'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const TOOLS: { tool: Tool; label: string; icon: LucideIcon }[] = [
  { tool: 'move', label: 'Mover', icon: MousePointer2 },
  { tool: 'point', label: 'Ponto', icon: Dot },
  { tool: 'line', label: 'Linha', icon: Slash },
  { tool: 'angle', label: 'Ângulo', icon: Triangle },
]

const HINTS: Record<Tool, string> = {
  move: 'Toque numa marca para selecioná-la; arraste os pontos para ajustar.',
  point: 'Clique na foto para marcar um ponto.',
  line: 'Clique 2 pontos para traçar uma linha — mostra a inclinação em relação à horizontal.',
  angle: 'Clique 3 pontos na ordem: 1ª ponta, vértice e 2ª ponta — mostra o ângulo.',
}

export default function PosturaFoto() {
  const { id, sessionId, photoId } = useParams()
  const { organization } = useOrganization()
  const photoQuery = usePhoto(photoId)
  const annotationQuery = useAnnotation(photoId)
  const saveMut = useSaveAnnotation(photoId, sessionId)

  const photo = photoQuery.data
  const urlsQuery = useSignedUrls(photo ? [photo.storage_path] : [])
  const url = photo ? urlsQuery.data?.[photo.storage_path] : undefined

  const [shapes, setShapes] = useState<Shape[]>([])
  const [rowId, setRowId] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('move')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const inited = useRef(false)

  // carrega as anotações existentes uma vez
  useEffect(() => {
    if (!inited.current && annotationQuery.data) {
      setShapes(annotationQuery.data.doc.shapes)
      setRowId(annotationQuery.data.rowId)
      inited.current = true
    }
  }, [annotationQuery.data])

  // atalhos: Esc desfaz seleção; Delete/Backspace apaga a marca selecionada
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedId(null)
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        setShapes((s) => s.filter((x) => x.id !== selectedId))
        setSelectedId(null)
        setDirty(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId])

  function update(next: Shape[]) {
    setShapes(next)
    setDirty(true)
  }

  function deleteSelected() {
    if (!selectedId) return
    setShapes((s) => s.filter((x) => x.id !== selectedId))
    setSelectedId(null)
    setDirty(true)
  }

  async function save() {
    if (!organization) return
    try {
      const newRowId = await saveMut.mutateAsync({ orgId: organization.id, rowId, shapes })
      setRowId(newRowId)
      setDirty(false)
    } catch {
      // erro mostrado abaixo
    }
  }

  const backTo = `/avaliados/${id}/postural/${sessionId}`
  const saveError = saveMut.error as Error | null

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to={backTo} className="text-sm text-muted-foreground hover:text-foreground">
            ← Voltar à sessão
          </Link>
          <h1 className="mt-2 text-xl font-semibold">
            Anotações{photo ? ` · ${categoryLabel(photo.category)}` : ''}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? <Badge variant="warn">Não salvo</Badge> : null}
          <Button size="sm" onClick={save} disabled={!dirty || saveMut.isPending}>
            <Save /> {saveMut.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
        <div className="flex gap-1">
          {TOOLS.map((t) => (
            <Button
              key={t.tool}
              size="sm"
              variant={tool === t.tool ? 'default' : 'ghost'}
              onClick={() => {
                setTool(t.tool)
                setSelectedId(null)
              }}
            >
              <t.icon /> {t.label}
            </Button>
          ))}
        </div>
        <div className="mx-1 h-6 w-px bg-border" />
        <Button size="sm" variant="ghost" onClick={deleteSelected} disabled={!selectedId}>
          <Trash2 /> Apagar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setShapes([])
            setSelectedId(null)
            setDirty(true)
          }}
          disabled={shapes.length === 0}
        >
          <Eraser /> Limpar
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {shapes.length} {shapes.length === 1 ? 'marca' : 'marcas'}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">{HINTS[tool]}</p>

      {saveError ? <p className="text-sm text-destructive">{saveError.message}</p> : null}

      {photoQuery.isPending || annotationQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : !photo ? (
        <p className="text-sm text-destructive">Foto não encontrada.</p>
      ) : !url ? (
        <p className="text-sm text-muted-foreground">Carregando imagem...</p>
      ) : (
        <div className="flex justify-center rounded-md bg-muted/40 p-2">
          <AnnotationCanvas
            src={url}
            shapes={shapes}
            tool={tool}
            selectedId={selectedId}
            onChange={update}
            onSelect={setSelectedId}
            imgClassName="block max-h-[72vh] w-auto max-w-full select-none rounded"
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Ângulos e inclinações são calculados sobre a imagem (referência visual). Não substituem
        medição clínica.
      </p>
    </div>
  )
}
