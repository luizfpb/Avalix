// Gera public/og-avalix.png — a imagem que WhatsApp, Telegram, Slack e afins
// mostram no cartão de preview quando alguém compartilha um link do app.
//
// Por que ela existe: sem og:image o WhatsApp cai no apple-touch-icon, que tem
// 180x180 e cantos arredondados TRANSPARENTES. Esticado no cartão ele sai
// borrado, e os cantos transparentes compostos sobre o cartão branco viram
// quatro cantos brancos em volta do quadrado roxo. Era exatamente o que se via.
//
// Formato: 1200x630 (a proporção 1.91:1 que o Open Graph pede) e PNG SEM canal
// alfa — sem alfa não existe canto transparente para ninguém compor sobre
// branco de novo.
//
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
const KICKER = [0xbe, 0xae, 0xe0] // o #beaee0 do kicker do AuthLayout
const RULE = [0x8f, 0x78, 0xba]
const WHITE = [0xff, 0xff, 0xff]

const BLACK_OPS = 'node_modules/@fontsource/black-ops-one/files/black-ops-one-latin-400-normal.woff'
// O TTF que o PDF já usa (public/fonts): o woff2 do app o opentype.js não lê.
const MANROPE = 'public/fonts/manrope-700.ttf'

function load(file) {
  const b = readFileSync(file)
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
}

const display = load(BLACK_OPS)
const sans = load(MANROPE)

const px = Buffer.alloc(W * H * 4)
fill(px, W, H, PLUM)

// --- geometria de fundo --------------------------------------------------
// Os mesmos anéis finos do painel de marca do AuthLayout (border-white/8 e /6).
// Em opacidade baixa: dão profundidade sem competir com o wordmark.
function ring(cx, cy, r, thickness) {
  const rIn = r - thickness / 2
  const rOut = r + thickness / 2
  return (x, y) => {
    const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy)
    return d2 >= rIn * rIn && d2 <= rOut * rOut
  }
}

for (const [cx, cy, r, op] of [
  [1108, 128, 252, 0.1],
  [1164, 372, 168, 0.075],
  [72, 566, 196, 0.06],
]) {
  paint(px, coverageOf(ring(cx, cy, r, 2.2), W, H, SS), WHITE, op)
}

// --- wordmark AVALIX -----------------------------------------------------
// O mesmo desenho que o app e o PDF usam (o glifo vira path, sem depender da
// fonte em runtime — ver generate-brand-assets.mjs).
const WORD_W = 616
const wordPolys = textPolys(display, 'AVALIX', 1000)
const wb = polysBounds(wordPolys)
const wordScale = WORD_W / wb.w
const wordH = wb.h * wordScale
const wordTop = 214
const wordLeft = (W - WORD_W) / 2

paint(
  px,
  coverage(
    polysToEdges(wordPolys, (x, y) => [
      wordLeft + (x - wb.x1) * wordScale,
      wordTop + (y - wb.y1) * wordScale,
    ]),
    W,
    H,
    SS
  ),
  INK
)

// --- régua ---------------------------------------------------------------
// Fecha o bloco com a cor da casa, do mesmo jeito que a ruleThick do laudo.
const RULE_W = 88
const RULE_H = 3
const ruleTop = wordTop + wordH + 40
paint(
  px,
  coverageOf(
    (x, y) =>
      x >= (W - RULE_W) / 2 && x <= (W + RULE_W) / 2 && y >= ruleTop && y <= ruleTop + RULE_H,
    W,
    H,
    SS
  ),
  RULE
)

// --- kicker --------------------------------------------------------------
// Caixa alta com tracking largo: o mesmo idioma dos rótulos do app
// (text-xs font-bold uppercase tracking-[0.18em]).
const KICKER_TEXT = 'AVALIAÇÃO FÍSICA E POSTURAL'
const KICKER_SIZE = 27
const TRACKING = 0.185
const kickPolys = textPolys(sans, KICKER_TEXT, KICKER_SIZE, { tracking: TRACKING })
const kb = polysBounds(kickPolys)
// A largura do bloco vem do avanço, não do bounding box: o tracking do último
// caractere não conta como tinta, e centralizar pelo bbox desloca o texto.
const kickAdvance =
  [...KICKER_TEXT].reduce(
    (s, ch) => s + (sans.charToGlyph(ch).advanceWidth || 0) * (KICKER_SIZE / sans.unitsPerEm),
    0
  ) +
  TRACKING * KICKER_SIZE * ([...KICKER_TEXT].length - 1)
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

mkdirSync('public', { recursive: true })
writeFileSync('public/og-avalix.png', encodePng(W, H, px, { alpha: false }))
console.log(`gerado: public/og-avalix.png (${W}x${H}, sem alfa)`)
