import { readFile, readdir, stat } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'

const DIST = path.resolve('dist')
const MAX_ENTRY_RAW = 600_000
const MAX_ENTRY_GZIP = 180_000
const MAX_PRECACHE = 2_000_000
const FORBIDDEN_PRECACHE = [
  /pdfTheme-/,
  /assessmentPdf-/,
  /workoutPdf-/,
  /poseDetect-/,
  /vision_bundle-/,
]

function fail(message) {
  throw new Error(`build budget: ${message}`)
}

const html = await readFile(path.join(DIST, 'index.html'), 'utf8')
// O HTML tambem carrega scripts pequenos e nao-modulares (por exemplo,
// theme-init.js). O budget precisa medir o entry gerado pelo Vite, identificado
// por type="module", independentemente da ordem dos atributos.
const entryTag = html.match(
  /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["'][^"']+\.js["'])[^>]*>/i
)?.[0]
const entryMatch = entryTag?.match(/\bsrc=["']([^"']+\.js)["']/i)
if (!entryMatch) fail('entry JS não encontrado em dist/index.html')

const entryPath = path.join(DIST, entryMatch[1].replace(/^\//, ''))
const entry = await readFile(entryPath)
const entryGzip = gzipSync(entry).byteLength
if (entry.byteLength > MAX_ENTRY_RAW) {
  fail(`entry JS tem ${entry.byteLength} bytes; limite ${MAX_ENTRY_RAW}`)
}
if (entryGzip > MAX_ENTRY_GZIP) {
  fail(`entry JS gzip tem ${entryGzip} bytes; limite ${MAX_ENTRY_GZIP}`)
}

const sw = await readFile(path.join(DIST, 'sw.js'), 'utf8')
const matchedUrls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1])
const urlCounts = new Map()
for (const url of matchedUrls) urlCounts.set(url, (urlCounts.get(url) ?? 0) + 1)
const duplicateUrls = [...urlCounts].filter(([, count]) => count > 1).map(([url]) => url)
if (duplicateUrls.length > 0) {
  fail(`URLs duplicadas no precache: ${duplicateUrls.join(', ')}`)
}
const urls = [...urlCounts.keys()]
if (urls.length === 0) fail('manifesto de precache não encontrado em dist/sw.js')

const forbidden = urls.filter((url) => FORBIDDEN_PRECACHE.some((re) => re.test(url)))
if (forbidden.length > 0) fail(`chunks pesados no precache: ${forbidden.join(', ')}`)

let precacheBytes = 0
for (const url of urls) {
  const clean = decodeURIComponent(url.split('?')[0]).replace(/^\//, '')
  const file = path.resolve(DIST, clean)
  if (!file.startsWith(`${DIST}${path.sep}`) && file !== DIST) {
    fail(`path inválido no precache: ${url}`)
  }
  try {
    precacheBytes += (await stat(file)).size
  } catch {
    // URLs internas do Workbox que não representam arquivos do dist não entram
    // no orçamento. Os arquivos precacheados de fato são verificados no install.
  }
}
if (precacheBytes > MAX_PRECACHE) {
  fail(`precache tem ${precacheBytes} bytes; limite ${MAX_PRECACHE}`)
}

// Também impede que o build volte a emitir subconjuntos de fontes fora do uso
// do app em pt-BR.
const assets = await readdir(path.join(DIST, 'assets'))
const foreignFonts = assets.filter((name) =>
  /-(vietnamese|cyrillic|greek|cyrillic-ext)-/i.test(name)
)
if (foreignFonts.length > 0) {
  fail(`subconjuntos de fonte desnecessários: ${foreignFonts.join(', ')}`)
}

const headers = await readFile(path.join(DIST, '_headers'), 'utf8')
for (const required of [
  "Content-Security-Policy:",
  "frame-ancestors 'none'",
  'Referrer-Policy: no-referrer',
  'Strict-Transport-Security: max-age=31536000',
  'X-Robots-Tag: noindex',
  '/assets/*',
  'max-age=31536000, immutable',
  '/avaliados/*',
  'Cloudflare-CDN-Cache-Control: no-store',
]) {
  if (!headers.includes(required)) fail(`dist/_headers não contém: ${required}`)
}
for (const line of headers.split(/\r?\n/)) {
  if (line.length > 2000) fail('dist/_headers contém linha maior que o limite do Pages')
}

console.log(
  `build budget ok: entry ${entry.byteLength}/${entryGzip} bytes gzip; ` +
    `precache ${precacheBytes} bytes em ${urls.length} arquivos`
)
