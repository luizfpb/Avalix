// Anotações posturais sobre a foto. Princípios:
// - coordenadas NORMALIZADAS (x,y em 0..1, relativas à imagem): alinham em
//   qualquer tamanho de tela e sobrevivem a zoom/responsividade.
// - geometria (ângulos/inclinação) é código puro e testado. ATENÇÃO: ângulo
//   depende da proporção da imagem; quem chama deve converter as coords
//   normalizadas para um espaço com proporção correta (pixels da imagem
//   renderizada) ANTES de medir. Em 0..1 de uma imagem não-quadrada o ângulo
//   sairia distorcido.

export type Pt = { x: number; y: number }

export type Shape =
  | { id: string; type: 'point'; points: [Pt] }
  | { id: string; type: 'line'; points: [Pt, Pt] }
  // ângulo no vértice (índice 1): [ponta1, vértice, ponta2]
  | { id: string; type: 'angle'; points: [Pt, Pt, Pt] }

export type AnnotationDoc = { version: 1; shapes: Shape[] }

export type ShapeType = Shape['type']

// quantos pontos cada tipo precisa para ficar completo
export const POINTS_NEEDED: Record<ShapeType, number> = {
  point: 1,
  line: 2,
  angle: 3,
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

// Inclinação de um segmento em relação à horizontal, dobrada para 0..90°
// (ex.: linha dos ombros → "3,2° da horizontal"). Coords com proporção correta.
export function lineTiltDeg(a: Pt, b: Pt): number {
  const deg = Math.abs((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI)
  return deg > 90 ? 180 - deg : deg
}

// Ângulo interno no vértice v entre os raios v→a e v→c, em 0..180°.
export function angleDeg(a: Pt, v: Pt, c: Pt): number {
  const v1x = a.x - v.x
  const v1y = a.y - v.y
  const v2x = c.x - v.x
  const v2y = c.y - v.y
  const m1 = Math.hypot(v1x, v1y)
  const m2 = Math.hypot(v2x, v2y)
  if (m1 === 0 || m2 === 0) return 0
  let cos = (v1x * v2x + v1y * v2y) / (m1 * m2)
  cos = Math.max(-1, Math.min(1, cos))
  return (Math.acos(cos) * 180) / Math.PI
}

// Lê o payload jsonb do banco com tolerância: descarta o que não bate com o
// formato em vez de quebrar a tela.
export function parseDoc(raw: unknown): AnnotationDoc {
  const shapes: Shape[] = []
  const list = (raw as { shapes?: unknown })?.shapes
  if (Array.isArray(list)) {
    for (const s of list) {
      const shape = s as { id?: unknown; type?: unknown; points?: unknown }
      const type = shape.type
      if (type !== 'point' && type !== 'line' && type !== 'angle') continue
      if (!Array.isArray(shape.points) || shape.points.length !== POINTS_NEEDED[type]) continue
      const pts = shape.points.map((p) => {
        const pt = p as { x?: unknown; y?: unknown }
        return { x: Number(pt.x), y: Number(pt.y) }
      })
      if (pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) continue
      shapes.push({
        id: typeof shape.id === 'string' ? shape.id : newId(),
        type,
        points: pts as never,
      })
    }
  }
  return { version: 1, shapes }
}
