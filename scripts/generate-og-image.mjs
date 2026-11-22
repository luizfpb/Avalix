// Gera public/og-*.png — as imagens que WhatsApp, Telegram, Slack e afins
// mostram no cartão de preview quando alguém compartilha um link do Avalix.
//
// Formato: 1200x630 (proporção 1.91:1 do Open Graph) e PNG SEM canal alfa.
// Rodar: node scripts/generate-og-image.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import opentype from 'opentype.js'
import {
  coverage,
  coverageOf,
  encodePng,
  fill,
  paint,
  polysBounds,
  polysToEdges,
  textPolys,
} from './lib/raster.mjs'

const W = 1200
const H = 630
const SS = 4 // supersampling: 16 amostras por pixel

// As mesmas cores do app (src/index.css): --brand e --brand-foreground.
const PLUM = [0x2a, 0x0e, 0x52]
const INK = [0xec, 0xe3, 0xfa]
const KICKER = [0xbe, 0xae, 0xe0]
const RULE = [0x8f, 0x78, 0xba]
const WHITE = [0xff, 0xff, 0xff]

const BLACK_OPS = 'node_modules/@fontsource/black-ops-one/files/black-ops-one-latin-400-normal.woff'
// O TTF que o PDF já usa (public/fonts): o opentype.js não lê woff2.
const MANROPE = 'public/fonts/manrope-700.ttf'

function load(file) {
  const b = readFileSync(file)
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
}

const display = load(BLACK_OPS)
const sans = load(MANROPE)

function ring(cx, cy, r, thickness) {
  const rIn = r - thickness / 2
  const rOut = r + thickness / 2
  return (x, y) => {
    const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy)
    return d2 >= rIn * rIn && d2 <= rOut * rOut
  }
}

// Pré-calcula os polígonos do wordmark AVALIX uma única vez.
const WORD_W = 616
const wordPolys = textPolys(display, 'AVALIX', 1000)
const wb = polysBounds(wordPolys)
const wordScale = WORD_W / wb.w
const wordH = wb.h * wordScale
const wordTop = 214
const wordLeft = (W - WORD_W) / 2
const wordCov = coverage(
  polysToEdges(wordPolys, (x, y) => [
    wordLeft + (x - wb.x1) * wordScale,
    wordTop + (y - wb.y1) * wordScale,
  ]),
  W,
  H,
  SS
)

const RULE_W = 88
const RULE_H = 3
const ruleTop = wordTop + wordH + 40
const ruleCov = coverageOf(
  (x, y) =>
    x >= (W - RULE_W) / 2 && x <= (W + RULE_W) / 2 && y >= ruleTop && y <= ruleTop + RULE_H,
  W,
  H,
  SS
)

const ringCovs = [
  [1108, 128, 252, 0.1],
  [1164, 372, 168, 0.075],
  [72, 566, 196, 0.06],
].map(([cx, cy, r, op]) => [coverageOf(ring(cx, cy, r, 2.2), W, H, SS), op])

function renderOg(file, kickerText) {
  const px = Buffer.alloc(W * H * 4)
  fill(px, W, H, PLUM)

  for (const [cov, op] of ringCovs) paint(px, cov, WHITE, op)
  paint(px, wordCov, INK)
  paint(px, ruleCov, RULE)

  const KICKER_SIZE = 27
  const TRACKING = 0.185
  const kickPolys = textPolys(sans, kickerText, KICKER_SIZE, { tracking: TRACKING })
  const kb = polysBounds(kickPolys)
  const kickAdvance =
    [...kickerText].reduce(
      (s, ch) => s + (sans.charToGlyph(ch).advanceWidth || 0) * (KICKER_SIZE / sans.unitsPerEm),
      0
    ) +
    TRACKING * KICKER_SIZE * ([...kickerText].length - 1)
  const kickLeft = (W - kickAdvance) / 2
  const kickTop = ruleTop + RULE_H + 34

  paint(
    px,
    coverage(
      polysToEdges(kickPolys, (x, y) => [kickLeft + x, kickTop + (y - kb.y1)]),
      W,
      H,
      SS
    ),
    KICKER
  )

  writeFileSync(file, encodePng(W, H, px, { alpha: false }))
  console.log(`gerado: ${file} (${W}x${H}, sem alfa)`)
}

const VARIANTES = [
  ['public/og-avalix.png', 'AVALIAÇÃO FÍSICA E POSTURAL'],
  ['public/og-avaliacao.png', 'AVALIAÇÃO FÍSICA E TESTES'],
  ['public/og-postural.png', 'AVALIAÇÃO POSTURAL POR FOTO'],
  ['public/og-treino.png', 'TREINO E APP DO ALUNO'],
  ['public/og-calculadoras.png', 'CALCULADORAS GRÁTIS'],
  ['public/og-modelos.png', 'FICHAS E MODELOS PARA IMPRIMIR'],
  ['public/og-guias.png', 'GUIAS DE EDUCAÇÃO FÍSICA'],
  ['public/og-comparativo.png', 'COMPARATIVO PARA PERSONAL'],
]

mkdirSync('public', { recursive: true })
for (const [file, kicker] of VARIANTES) {
  renderOg(file, kicker)
}
