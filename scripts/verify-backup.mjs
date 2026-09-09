// Valida o dump que será publicado, não o estado posterior do banco remoto.
// Entrada: pg_restore --data-only --schema=public --table=organizations
//   --table=posture_photos --file=- db.dump | node scripts/verify-backup.mjs --storage pasta
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline'

const arg = process.argv.indexOf('--storage')
if (arg < 0 || !process.argv[arg + 1]) throw new Error('Informe --storage com a pasta do manifesto e dos arquivos.')
const storageRoot = path.resolve(process.argv[arg + 1])
const references = new Set()
const seenTables = new Set()
const columnsByTable = { organizations: ['logo_path'], posture_photos: ['storage_path', 'thumb_path'] }

function safeObjectPath(bucket, objectPath) {
  if (!['photos', 'logos'].includes(bucket) || typeof objectPath !== 'string' || !objectPath) {
    throw new Error('Referência de Storage inválida no backup.')
  }
  const parts = objectPath.split('/')
  if (parts.some(part => !part || part === '.' || part === '..') || /[\\:]/.test(objectPath) ||
      [...objectPath].some(character => character.charCodeAt(0) < 32)) {
    throw new Error('Caminho de Storage inseguro no backup.')
  }
  return `${bucket}/${objectPath}`
}

function copyValue(raw) {
  if (raw === '\\N') return null
  // COPY text escapa tabulações/quebras/backslashes dentro de cada campo.
  return raw.replace(/\\([0-7]{1,3}|x[\da-fA-F]{1,2}|.)/g, (_, escape) => {
    if (/^[0-7]/.test(escape)) return String.fromCharCode(parseInt(escape, 8))
    if (escape[0] === 'x') return String.fromCharCode(parseInt(escape.slice(1), 16))
    return ({ b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' })[escape] ?? escape
  })
}

let table = null
let columns = []
let indices = []
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  if (!table) {
    const header = /^COPY public\.(organizations|posture_photos) \(([^)]+)\) FROM stdin;$/.exec(line)
    if (!header) continue
    table = header[1]
    if (seenTables.has(table)) throw new Error('Tabela repetida na extração do dump.')
    seenTables.add(table)
    columns = header[2].split(',').map(column => column.trim().replace(/^"|"$/g, ''))
    indices = columnsByTable[table].map(column => columns.indexOf(column))
    if (indices.some(index => index < 0)) throw new Error('O dump não contém as colunas de referência esperadas.')
    continue
  }
  if (line === '\\.') { table = null; continue }
  const row = line.split('\t')
  if (row.length !== columns.length) throw new Error('Linha COPY incompleta no dump; verificação interrompida.')
  for (const index of indices) {
    const value = copyValue(row[index])
    if (value === null && table === 'organizations') continue
    references.add(safeObjectPath(table === 'organizations' ? 'logos' : 'photos', value))
  }
}
if (table || seenTables.size !== 2) throw new Error('Extração incompleta: organizações e fotos precisam ser lidas até o fim.')

const manifest = JSON.parse(await readFile(path.join(storageRoot, 'manifest.json'), 'utf8'))
if (manifest.version !== 1 || !Array.isArray(manifest.objects)) throw new Error('Formato de manifesto de Storage desconhecido.')
const objects = new Map()
for (const item of manifest.objects) {
  const key = safeObjectPath(item.bucket, item.path)
  if (objects.has(key)) throw new Error('Objeto duplicado no manifesto de Storage.')
  if (!Number.isSafeInteger(item.bytes) || item.bytes < 0 || !/^[a-f\d]{64}$/.test(item.sha256)) {
    throw new Error('Tamanho ou hash inválido no manifesto de Storage.')
  }
  objects.set(key, item)
}
const missing = [...references].filter(reference => !objects.has(reference))
if (missing.length) {
  throw new Error(`Backup incompleto: ${missing.length} referência(s) do dump sem arquivo no manifesto. Gere uma nova captura antes de publicar.`)
}

// Confere também os bytes presentes no artifact. Hashes válidos de um
// subconjunto não bastam; a verificação referencial acima vem primeiro.
for (const [key, item] of objects) {
  const filename = path.resolve(storageRoot, key)
  if (!filename.startsWith(`${storageRoot}${path.sep}`)) throw new Error('Arquivo fora da pasta de backup.')
  const fileStat = await stat(filename)
  if (!fileStat.isFile() || fileStat.size !== item.bytes) throw new Error('Arquivo ausente ou tamanho divergente no backup.')
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filename)) hash.update(chunk)
  if (hash.digest('hex') !== item.sha256) throw new Error('Hash divergente nos bytes do backup.')
}

await writeFile(path.join(storageRoot, 'reference-check.json'), JSON.stringify({
  version: 1,
  verifiedAt: new Date().toISOString(),
  referencedObjects: references.size,
  manifestObjects: objects.size,
  verifiedBytes: [...objects.values()].reduce((sum, item) => sum + item.bytes, 0),
}, null, 2))
console.log(`Backup verificado: ${references.size} referências do dump e ${objects.size} arquivos com tamanho/hash conferidos.`)
