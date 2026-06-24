// Geometria pura de gráficos — usada para desenhar no PDF (@react-pdf não roda
// Recharts; desenhamos com primitivas Svg). Sem dependência de DOM, testável.

export type DonutSlice = { d: string; pct: number }

function pt(cx: number, cy: number, r: number, ang: number): [number, number] {
  return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)]
}

function ringSegment(
  cx: number,
  cy: number,
  rO: number,
  rI: number,
  a0: number,
  a1: number
): string {
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0o, y0o] = pt(cx, cy, rO, a0)
  const [x1o, y1o] = pt(cx, cy, rO, a1)
  const [x1i, y1i] = pt(cx, cy, rI, a1)
  const [x0i, y0i] = pt(cx, cy, rI, a0)
  return [
    `M ${r2(x0o)} ${r2(y0o)}`,
    `A ${r2(rO)} ${r2(rO)} 0 ${large} 1 ${r2(x1o)} ${r2(y1o)}`,
    `L ${r2(x1i)} ${r2(y1i)}`,
    `A ${r2(rI)} ${r2(rI)} 0 ${large} 0 ${r2(x0i)} ${r2(y0i)}`,
    'Z',
  ].join(' ')
}

const r2 = (n: number) => Math.round(n * 100) / 100

// Fatias de uma rosca (anel) a partir dos valores. Começa no topo, sentido
// horário. Valores negativos são tratados como 0.
export function donutSlices(
  values: number[],
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number
): DonutSlice[] {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0)
  if (total <= 0) return []
  let a = -Math.PI / 2
  const out: DonutSlice[] = []
  for (const v of values) {
    const frac = Math.max(0, v) / total
    const a1 = a + frac * 2 * Math.PI
    // anel quase completo: desenha em duas metades pra não degenerar
    if (frac > 0.999) {
      const mid = a + Math.PI
      out.push({ d: ringSegment(cx, cy, rOuter, rInner, a, mid), pct: frac })
      out.push({ d: ringSegment(cx, cy, rOuter, rInner, mid, a1), pct: 0 })
    } else {
      out.push({ d: ringSegment(cx, cy, rOuter, rInner, a, a1), pct: frac })
    }
    a = a1
  }
  return out
}

export type LineLayout = {
  points: string // "x,y x,y ..." (só pontos válidos)
  coords: { x: number; y: number; valid: boolean }[]
  min: number
  max: number
}

// Mapeia uma série numérica para coordenadas dentro de uma caixa (origem no
// canto superior esquerdo, y pra baixo — convém a SVG).
export function linePath(
  values: (number | null)[],
  width: number,
  height: number,
  padX = 2,
  padY = 4
): LineLayout {
  const nums = values.filter((v): v is number => v != null)
  const min = nums.length ? Math.min(...nums) : 0
  const max = nums.length ? Math.max(...nums) : 1
  const span = max - min || 1
  const n = values.length
  const coords = values.map((v, i) => {
    const x = padX + (n <= 1 ? (width - 2 * padX) / 2 : (i / (n - 1)) * (width - 2 * padX))
    const valid = v != null
    const y = valid ? height - padY - ((v! - min) / span) * (height - 2 * padY) : 0
    return { x: r2(x), y: r2(y), valid }
  })
  const points = coords
    .filter((c) => c.valid)
    .map((c) => `${c.x},${c.y}`)
    .join(' ')
  return { points, coords, min, max }
}

export type BarLayout = {
  bars: {
    label: string
    value: number
    pct: number // 0..1, fração do maior valor (ou de maxValue)
    x: number
    y: number
    width: number
    height: number
  }[]
  max: number
  height: number // altura total ocupada
}

// Barras horizontais a partir de pares (rótulo, valor). Escala pelo maior valor
// da série, ou por maxValue fixo. Empilhadas verticalmente, origem no topo. A UI
// pode usar `pct` (largura em %) ou a geometria em px (Svg). Valores negativos
// viram 0. Geometria pura, sem DOM — testável como donutSlices/linePath.
export function barLayout(
  items: { label: string; value: number }[],
  width: number,
  barHeight: number,
  gap = 4,
  maxValue?: number
): BarLayout {
  const max = maxValue ?? items.reduce((m, it) => Math.max(m, it.value), 0)
  const bars = items.map((it, i) => {
    const pct = max > 0 ? Math.max(0, it.value) / max : 0
    return {
      label: it.label,
      value: it.value,
      pct,
      x: 0,
      y: i * (barHeight + gap),
      width: r2(pct * width),
      height: barHeight,
    }
  })
  const height = items.length > 0 ? items.length * barHeight + (items.length - 1) * gap : 0
  return { bars, max, height }
}
