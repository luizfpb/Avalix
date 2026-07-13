import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL?.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const outputArg = process.argv.indexOf('--output')
const output = path.resolve(outputArg >= 0 ? process.argv[outputArg + 1] : 'storage-backup')
const buckets = ['photos', 'logos']
const PAGE_SIZE = 1000

if (!url || !key) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias')
}
if (outputArg >= 0 && !process.argv[outputArg + 1]) {
  throw new Error('Informe o diretório depois de --output')
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

function safeDestination(bucket, objectPath) {
  const parts = objectPath.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Objeto do Storage contém path inseguro')
  }
  const destination = path.resolve(output, bucket, ...parts)
  const root = path.resolve(output, bucket)
  if (!destination.startsWith(`${root}${path.sep}`)) {
    throw new Error('Objeto do Storage saiu do diretório de backup')
  }
  return destination
}

async function listDirectory(bucket, prefix) {
  const rows = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw error
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  objects: [],
}
const visited = new Set()

async function backupDirectory(bucket, prefix = '') {
  const visitKey = `${bucket}:${prefix}`
  if (visited.has(visitKey)) throw new Error('Ciclo inesperado ao listar Storage')
  visited.add(visitKey)

  for (const item of await listDirectory(bucket, prefix)) {
    if (!item || typeof item.name !== 'string' || item.name.length === 0) continue
    const objectPath = prefix ? `${prefix}/${item.name}` : item.name
    const isFolder = item.id == null && item.metadata == null
    if (isFolder) {
      await backupDirectory(bucket, objectPath)
      continue
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .download(objectPath, {}, { cache: 'no-store' })
    if (error) throw error
    const bytes = Buffer.from(await data.arrayBuffer())
    const destination = safeDestination(bucket, objectPath)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, bytes)
    manifest.objects.push({
      bucket,
      path: objectPath,
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
  }
}

await mkdir(output, { recursive: true })
for (const bucket of buckets) await backupDirectory(bucket)
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2))

const totalBytes = manifest.objects.reduce((sum, item) => sum + item.bytes, 0)
console.log(`Storage backup: ${manifest.objects.length} objetos, ${totalBytes} bytes`)
