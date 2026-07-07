// Varredura de fotos ORFAS no Storage: objetos do bucket 'photos' sem linha
// correspondente em posture_photos. Fecha o residual do achado LGPD da v2.0:
// a exclusao verificada evita criar orfaos novos, mas se algum existir de
// antes, so o service role enxerga (a policy resolve o objeto pela linha).
//
// SO LISTA por padrao; passe --delete para remover os orfaos encontrados.
//
// Rodar (cmd, service role NUNCA vai pro .env.local nem pro repo):
//   set SUPABASE_SERVICE_ROLE_KEY=eyJ...
//   node scripts/find-orphan-photos.mjs
//   node scripts/find-orphan-photos.mjs --delete

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function readEnvLocal() {
  const out = {}
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (m) out[m[1]] = m[2]
  }
  return out
}

const url = readEnvLocal().VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('ERRO: defina SUPABASE_SERVICE_ROLE_KEY no ambiente (URL vem do .env.local).')
  process.exit(1)
}

const supabase = createClient(url, serviceKey)
const doDelete = process.argv.includes('--delete')

// paths registrados no banco
const { data: rows, error: rowsErr } = await supabase
  .from('posture_photos')
  .select('storage_path, thumb_path')
if (rowsErr) {
  console.error('ERRO ao ler posture_photos:', rowsErr.message)
  process.exit(1)
}
const known = new Set(rows.flatMap((r) => [r.storage_path, r.thumb_path]))

// anda a arvore org/subject/session do bucket
async function listDir(prefix) {
  const out = []
  let page = 0
  for (;;) {
    const { data, error } = await supabase.storage
      .from('photos')
      .list(prefix, { limit: 1000, offset: page * 1000 })
    if (error) throw new Error(`list ${prefix || '(raiz)'}: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
    page++
  }
}

const orphans = []
for (const org of await listDir('')) {
  if (!org.id && org.name) {
    // pasta (org)
    for (const subject of await listDir(org.name)) {
      const p1 = `${org.name}/${subject.name}`
      for (const session of await listDir(p1)) {
        const p2 = `${p1}/${session.name}`
        for (const obj of await listDir(p2)) {
          const full = `${p2}/${obj.name}`
          if (!known.has(full)) orphans.push(full)
        }
      }
    }
  }
}

if (orphans.length === 0) {
  console.log('Nenhum orfao: todo objeto do bucket tem linha em posture_photos.')
  process.exit(0)
}

console.log(`${orphans.length} objeto(s) orfao(s):`)
for (const p of orphans) console.log('  ' + p)

if (doDelete) {
  const { error } = await supabase.storage.from('photos').remove(orphans)
  if (error) {
    console.error('ERRO ao remover:', error.message)
    process.exit(1)
  }
  console.log('Removidos.')
} else {
  console.log('\n(nada removido — rode com --delete para apagar)')
}
