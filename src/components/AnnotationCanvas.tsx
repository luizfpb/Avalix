import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  angleDeg,
  lineTiltDeg,
  newId,
  POINTS_NEEDED,
  type Pt,
  type Shape,
} from '../features/posture/annotations'

export type Tool = 'point' | 'line' | 'angle' | 'move'

type Props = {
  src: string
  shapes: Shape[]
  readOnly?: boolean
  tool?: Tool
  selectedId?: string | null
  onChange?: (shapes: Shape[]) => void
  onSelect?: (id: string | null) => void
  imgClassName?: string
}

const COLOR = '#f59e0b' // amber-500: contraste alto sobre pele/fundos variados
const SELECTED = '#22d3ee' // cyan-400
const HIT_PX = 18

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export function AnnotationCanvas({
  src,
  shapes,
  readOnly = false,
  tool = 'move',
  selectedId = null,
  onChange,
  onSelect,
  imgClassName = 'block max-h-[70vh] w-auto max-w-full select-none rounded-md',
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [draft, setDraft] = useState<Pt[]>([])
  const [drag, setDrag] = useState<{ id: string; idx: number } | null>(null)

  // mede a caixa renderizada da imagem (px); coords normalizadas viram px aqui
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // troca de ferramenta cancela um desenho em andamento
  useEffect(() => setDraft([]), [tool])

  const toPx = (p: Pt) => ({ x: p.x * size.w, y: p.y * size.h })

  function normFromEvent(e: ReactPointerEvent): Pt {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) }
  }

  function hitVertex(n: Pt): { id: string; idx: number } | null {
    const px = toPx(n)
    let best: { id: string; idx: number } | null = null
    let bestD = HIT_PX
    for (const s of shapes) {
      s.points.forEach((p, idx) => {
        const q = toPx(p)
        const d = Math.hypot(q.x - px.x, q.y - px.y)
        if (d < bestD) {
          bestD = d
          best = { id: s.id, idx }
        }
      })
    }
    return best
  }

  function onPointerDown(e: ReactPointerEvent) {
    if (readOnly || !onChange) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const n = normFromEvent(e)
    const hit = hitVertex(n)
    if (hit) {
      setDrag(hit)
      onSelect?.(hit.id)
      return
    }
    if (tool === 'move') {
      onSelect?.(null)
      return
    }
    if (tool === 'point') {
      onChange([...shapes, { id: newId(), type: 'point', points: [n] }])
      return
    }
    const next = [...draft, n]
    if (next.length >= POINTS_NEEDED[tool]) {
      const id = newId()
      const shape = { id, type: tool, points: next } as Shape
      onChange([...shapes, shape])
      onSelect?.(id)
      setDraft([])
    } else {
      setDraft(next)
    }
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!drag || !onChange) return
    const n = normFromEvent(e)
    onChange(
      shapes.map((s) =>
        s.id === drag.id
          ? ({ ...s, points: s.points.map((p, i) => (i === drag.idx ? n : p)) } as Shape)
          : s
      )
    )
  }

  function onPointerUp(e: ReactPointerEvent) {
    if (drag) e.currentTarget.releasePointerCapture(e.pointerId)
    setDrag(null)
  }

  const ready = size.w > 0 && size.h > 0
  const interactive = !readOnly && !!onChange

  return (
    <div ref={boxRef} className="relative inline-block leading-none">
      <img src={src} alt="" draggable={false} className={imgClassName} />
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: 'none', cursor: interactive ? 'crosshair' : 'default' }}
        onPointerDown={interactive ? onPointerDown : undefined}
        onPointerMove={interactive ? onPointerMove : undefined}
        onPointerUp={interactive ? onPointerUp : undefined}
      >
        {ready
          ? shapes.map((s) => (
              <ShapeView key={s.id} shape={s} toPx={toPx} selected={s.id === selectedId} />
            ))
          : null}
        {ready
          ? draft.map((p, i) => {
              const q = toPx(p)
              return (
                <circle
                  key={i}
                  cx={q.x}
                  cy={q.y}
                  r={5}
                  fill="white"
                  stroke={COLOR}
                  strokeWidth={2}
                  pointerEvents="none"
                />
              )
            })
          : null}
      </svg>
    </div>
  )
}

function Vertex({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <>
      <circle cx={x} cy={y} r={6.5} fill="white" pointerEvents="none" />
      <circle cx={x} cy={y} r={4} fill={color} pointerEvents="none" />
    </>
  )
}

function Label({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text
      x={x}
      y={y}
      fontSize={14}
      fontWeight={700}
      fill={COLOR}
      stroke="white"
      strokeWidth={4}
      paintOrder="stroke"
      pointerEvents="none"
      style={{ userSelect: 'none' }}
    >
      {text}
    </text>
  )
}

// linha com halo branco por baixo (legível em qualquer fundo)
function Stroke({ d, color }: { d: string; color: string }) {
  return (
    <>
      <path d={d} fill="none" stroke="white" strokeWidth={5} strokeLinecap="round" pointerEvents="none" />
      <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" pointerEvents="none" />
    </>
  )
}

function ShapeView({
  shape,
  toPx,
  selected,
}: {
  shape: Shape
  toPx: (p: Pt) => { x: number; y: number }
  selected: boolean
}) {
  const color = selected ? SELECTED : COLOR
  const pts = shape.points.map(toPx)

  if (shape.type === 'point') {
    const [p] = pts
    return (
      <g>
        <Stroke d={`M ${p.x - 9} ${p.y} H ${p.x + 9} M ${p.x} ${p.y - 9} V ${p.y + 9}`} color={color} />
        <Vertex x={p.x} y={p.y} color={color} />
      </g>
    )
  }

  if (shape.type === 'line') {
    const [a, b] = pts
    const tilt = lineTiltDeg(a, b)
    return (
      <g>
        <Stroke d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} color={color} />
        <Vertex x={a.x} y={a.y} color={color} />
        <Vertex x={b.x} y={b.y} color={color} />
        <Label x={(a.x + b.x) / 2 + 8} y={(a.y + b.y) / 2 - 8} text={`${tilt.toFixed(1)}°`} />
      </g>
    )
  }

  // angle: [p0, vértice, p2]
  const [p0, v, p2] = pts
  const deg = angleDeg(p0, v, p2)
  const r = 28
  const a1 = Math.atan2(p0.y - v.y, p0.x - v.x)
  const a2 = Math.atan2(p2.y - v.y, p2.x - v.x)
  let diff = a2 - a1
  while (diff <= -Math.PI) diff += 2 * Math.PI
  while (diff > Math.PI) diff -= 2 * Math.PI
  const sweep = diff > 0 ? 1 : 0
  const arcStart = { x: v.x + r * Math.cos(a1), y: v.y + r * Math.sin(a1) }
  const arcEnd = { x: v.x + r * Math.cos(a2), y: v.y + r * Math.sin(a2) }
  const mid = a1 + diff / 2
  const labelPos = { x: v.x + (r + 16) * Math.cos(mid), y: v.y + (r + 16) * Math.sin(mid) }
  return (
    <g>
      <Stroke d={`M ${p0.x} ${p0.y} L ${v.x} ${v.y} L ${p2.x} ${p2.y}`} color={color} />
      <path
        d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 0 ${sweep} ${arcEnd.x} ${arcEnd.y}`}
        fill="none"
        stroke={color}
        strokeWidth={2}
        pointerEvents="none"
      />
      <Vertex x={p0.x} y={p0.y} color={color} />
      <Vertex x={v.x} y={v.y} color={color} />
      <Vertex x={p2.x} y={p2.y} color={color} />
      <Label x={labelPos.x - 12} y={labelPos.y + 5} text={`${deg.toFixed(0)}°`} />
    </g>
  )
}
