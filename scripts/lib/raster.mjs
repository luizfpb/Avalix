// Rasterizador mínimo e sem dependências, compartilhado pelos scripts que
// geram imagem da marca (ícones do PWA, imagem de compartilhamento).
//
// Existe porque a única coisa que precisamos desenhar é texto da marca em cor
// chapada sobre fundo chapado — trazer sharp/canvas (binário nativo, dezenas
// de MB) só para isso seria desproporcional. O que está aqui basta: contorno
// de glifo -> arestas -> preenchimento por varredura (even-odd) com cobertura
// supersampled, mais um codificador PNG.
import { deflateSync } from 'node:zlib'
import { Buffer } from 'node:buffer'

// ---- PNG ----------------------------------------------------------------

const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(b) {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const tb = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0)
  return Buffer.concat([len, tb, data, crc])
}

// pixels: Buffer RGBA (4 bytes por pixel), width*height.
// alpha=false grava colorType 2 (RGB, sem canal alfa) — que é o que se quer
// numa imagem de compartilhamento: sem alfa não existe canto transparente
// para o WhatsApp compor sobre branco.
export function encodePng(width, height, pixels, { alpha = true } = {}) {
  const bpp = alpha ? 4 : 3
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = alpha ? 6 : 2
  const stride = width * bpp
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const o = y * (stride + 1)
    raw[o] = 0 // filtro None
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4
      const d = o + 1 + x * bpp
      raw[d] = pixels[s]
      raw[d + 1] = pixels[s + 1]
      raw[d + 2] = pixels[s + 2]
      if (alpha) raw[d + 3] = pixels[s + 3]
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- contornos de glifo -------------------------------------------------

const bez2 = (a, b, c, t) => {
  const u = 1 - t
  return u * u * a + 2 * u * t * b + t * t * c
}
const bez3 = (a, b, c, d, t) => {
  const u = 1 - t
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d
}

// Um opentype.Path -> lista de polígonos (curvas achatadas em segmentos).
export function pathPolys(path, steps = 16) {
  const polys = []
  let cur = []
  let sx = 0, sy = 0, px = 0, py = 0
  for (const c of path.commands) {
    if (c.type === 'M') {
      if (cur.length > 1) polys.push(cur)
      cur = [[c.x, c.y]]
      px = sx = c.x
      py = sy = c.y
    } else if (c.type === 'L') {
      cur.push([c.x, c.y])
      px = c.x
      py = c.y
    } else if (c.type === 'C') {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        cur.push([bez3(px, c.x1, c.x2, c.x, t), bez3(py, c.y1, c.y2, c.y, t)])
      }
      px = c.x
      py = c.y
    } else if (c.type === 'Q') {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        cur.push([bez2(px, c.x1, c.x, t), bez2(py, c.y1, c.y, t)])
      }
      px = c.x
      py = c.y
    } else if (c.type === 'Z') {
      if (cur.length > 1) {
        cur.push([sx, sy])
        polys.push(cur)
      }
      cur = []
    }
  }
  if (cur.length > 1) polys.push(cur)
  return polys
}

// Polígonos de uma STRING, montada glifo a glifo (charToGlyph + getPath),
// avançando x pela largura de cada um. É de propósito que não se use
// font.getPath(texto): ele aplica shaping que o Black Ops One não suporta no
// opentype.js — o mesmo motivo já registrado em generate-brand-assets.mjs.
// `tracking` em em (0.18 = o tracking-[0.18em] dos kickers do app).
export function textPolys(font, text, fontSize, { tracking = 0 } = {}) {
  const scale = fontSize / font.unitsPerEm
  const polys = []
  let x = 0
  for (const ch of text) {
    const glyph = font.charToGlyph(ch)
    // .notdef (índice 0) num caractere que não seja espaço = fonte sem o
    // glifo. Num subset latino isso pega acento faltando, que sairia como
    // retângulo vazio numa imagem publicada — melhor falhar na geração.
    if (glyph.index === 0 && ch.trim() !== '') {
      throw new Error(`fonte sem o glifo ${JSON.stringify(ch)} (texto: ${JSON.stringify(text)})`)
    }
    polys.push(...pathPolys(glyph.getPath(x, 0, fontSize)))
    x += (glyph.advanceWidth || 0) * scale + tracking * fontSize
  }
  return polys
}

export function polysBounds(polys) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const p of polys)
    for (const [x, y] of p) {
      if (x < x1) x1 = x
      if (x > x2) x2 = x
      if (y < y1) y1 = y
      if (y > y2) y2 = y
    }
  return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 }
}

// Polígonos -> arestas [x0,y0,x1,y1] no espaço da imagem. `map` recebe (x, y)
// do espaço do glifo e devolve [x, y] em pixels.
export function polysToEdges(polys, map) {
  const edges = []
  for (const p of polys) {
    for (let i = 0; i + 1 < p.length; i++) {
      const [ax, ay] = map(p[i][0], p[i][1])
      const [bx, by] = map(p[i + 1][0], p[i + 1][1])
      if (ay !== by) edges.push([ax, ay, bx, by]) // horizontal não cruza varredura
    }
  }
  return edges
}

// ---- preenchimento por varredura ---------------------------------------

// Cobertura 0..1 por pixel de saída, amostrando `ss` sub-linhas e `ss`
// sub-colunas por pixel, com regra even-odd (é ela que abre o furo do "A").
//
// Por varredura, e não ponto-a-ponto contra todas as arestas: um wordmark mais
// uma linha de texto passam de mil arestas e a imagem tem 1200x630 — testar
// cada sub-pixel contra cada aresta seriam bilhões de operações.
export function coverage(edges, width, height, ss = 4) {
  const cov = new Float32Array(width * height)
  if (edges.length === 0) return cov
  const per = 1 / (ss * ss)
  const maxSub = width * ss - 1
  const xs = []
  for (let sy = 0; sy < height * ss; sy++) {
    const y = (sy + 0.5) / ss
    xs.length = 0
    for (let i = 0; i < edges.length; i++) {
      const [x0, y0, x1, y1] = edges[i]
      if (y0 > y !== y1 > y) xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0))
    }
    if (xs.length < 2) continue
    xs.sort((a, b) => a - b)
    const base = ((sy / ss) | 0) * width
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // sub-colunas cujo centro cai dentro de [xs[k], xs[k+1]]
      let sa = Math.ceil(xs[k] * ss - 0.5)
      let sb = Math.floor(xs[k + 1] * ss - 0.5)
      if (sa < 0) sa = 0
      if (sb > maxSub) sb = maxSub
      for (let sx = sa; sx <= sb; sx++) cov[base + ((sx / ss) | 0)] += per
    }
  }
  return cov
}

// Cobertura de uma forma definida por teste ponto-a-ponto (círculo, anel),
// com a mesma amostragem da varredura. Só para formas simples e pequenas.
export function coverageOf(test, width, height, ss = 4) {
  const cov = new Float32Array(width * height)
  const per = 1 / (ss * ss)
  for (let sy = 0; sy < height * ss; sy++) {
    const y = (sy + 0.5) / ss
    const base = ((sy / ss) | 0) * width
    for (let sx = 0; sx < width * ss; sx++) {
      const x = (sx + 0.5) / ss
      if (test(x, y)) cov[base + ((sx / ss) | 0)] += per
    }
  }
  return cov
}

// Pinta `color` sobre `pixels` (RGBA) usando cobertura * opacidade.
export function paint(pixels, cov, [r, g, b], opacity = 1) {
  for (let i = 0; i < cov.length; i++) {
    const a = cov[i] * opacity
    if (a <= 0) continue
    const o = i * 4
    pixels[o] = Math.round(pixels[o] + (r - pixels[o]) * a)
    pixels[o + 1] = Math.round(pixels[o + 1] + (g - pixels[o + 1]) * a)
    pixels[o + 2] = Math.round(pixels[o + 2] + (b - pixels[o + 2]) * a)
  }
}

export function fill(pixels, width, height, [r, g, b]) {
  for (let i = 0; i < width * height; i++) {
    const o = i * 4
    pixels[o] = r
    pixels[o + 1] = g
    pixels[o + 2] = b
    pixels[o + 3] = 255
  }
}
