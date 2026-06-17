// Gera os ícones PNG do PWA sem dependência externa: encoder PNG mínimo
// (zlib) desenhando a marca do BodyTrack — fundo #171717 e uma silhueta branca
// (cabeça + tronco) dentro da zona segura de máscara. Re-rodar: `node
// scripts/generate-pwa-icons.mjs`. Substitua por um logo real quando houver.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { Buffer } from 'node:buffer'

const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function pngFromRGBA(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filtro 0 (none) por linha
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const bg = [0x4f, 0x46, 0xe5] // indigo-600 (cor de marca)
  const fg = [0xff, 0xff, 0xff]
  const cx = size / 2
  const headCy = size * 0.36
  const headR = size * 0.12
  const torsoTop = size * 0.52
  const torsoBot = size * 0.74
  const torsoHalf = size * 0.16
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dh = (x - cx) ** 2 + (y - headCy) ** 2
      const inHead = dh <= headR * headR
      const inTorso =
        y >= torsoTop && y <= torsoBot && x >= cx - torsoHalf && x <= cx + torsoHalf
      const c = inHead || inTorso ? fg : bg
      const i = (y * size + x) * 4
      rgba[i] = c[0]
      rgba[i + 1] = c[1]
      rgba[i + 2] = c[2]
      rgba[i + 3] = 255
    }
  }
  return pngFromRGBA(size, rgba)
}

mkdirSync('public', { recursive: true })
const targets = [
  ['public/pwa-192.png', 192],
  ['public/pwa-512.png', 512],
  ['public/maskable-512.png', 512],
  ['public/apple-touch-icon.png', 180],
]
for (const [file, size] of targets) {
  writeFileSync(file, drawIcon(size))
  console.log('gerado', file, `${size}x${size}`)
}
