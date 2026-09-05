// Varredura de fotos ORFAS no Storage: objetos do bucket 'photos' sem linha
// correspondente em posture_photos. Fecha o residual do achado LGPD da v2.0:
// a exclusao verificada evita criar orfaos novos, mas se algum existir de
// antes, so o service role enxerga (a policy resolve o objeto pela linha).
//
// SO LISTA por padrao; passe --delete para remover os orfaos encontrados.
//
// POR QUE A PAGINACAO AQUI E QUESTAO DE SEGURANCA, E NAO DE DESEMPENHO.
// A versao anterior lia posture_photos com um select sem paginacao e percorria
// o Storage INTEIRO. O PostgREST corta a resposta no max-rows do projeto (mil
// linhas por padrao) e nao devolve erro nenhum: o script simplesmente passava a
// desconhecer as fotos alem do corte e a classificar TODAS elas como orfas. Em
// modo --delete, com service role, isso apaga foto clinica legitima - o pior
// desfecho possivel para um utilitario de limpeza. Agora:
//
//   1. a leitura pagina ate o fim e CONFERE o total com o count exato;
//   2. divergencia entre os dois aborta antes de qualquer exclusao;
//   3. cada candidato e revalidado no banco imediatamente antes de apagar.
//
// Nenhuma das tres sozinha basta: (1) e (2) fecham o corte silencioso, e (3)
// cobre a foto que foi registrada entre a leitura e a exclusao.
//
// Rodar (cmd, service role NUNCA vai pro .env.local nem pro repo):
//   set SUPABASE_SERVICE_ROLE_KEY=eyJ...
//   node scripts/find-orphan-photos.mjs
//   node scripts/find-orphan-photos.mjs --delete

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const PAGE = 1000
// A API de Storage tem limite por chamada; remover em blocos tambem evita que
// um erro no fim da lista deixe estado ambiguo sobre o que ja saiu.
const DELETE_CHUNK = 100

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

function abortar(motivo) {
  console.error(`ERRO: ${motivo}`)
  console.error('Nada foi removido.')
  process.exit(1)
}

// ---------------------------------------------------------------- banco
// Paginacao por range, avancando pelo TAMANHO RECEBIDO e nao pelo pedido: se o
// max-rows do projeto for menor que PAGE, o laco continua correto em vez de
// parar cedo achando que acabou.
async function readAllPhotoPaths() {
  const { count, error: countErr } = await supabase
    .from('posture_photos')
    .select('id', { count: 'exact', head: true })
  if (countErr) abortar(`ao contar posture_photos: ${countErr.message}`)

  const paths = new Set()
  let lidas = 0
  for (let offset = 0; ; ) {
    const { data, error } = await supabase
      .from('posture_photos')
      // ordem estavel: sem ela, duas paginas podem repetir ou pular linhas
      .select('id, storage_path, thumb_path')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) abortar(`ao ler posture_photos: ${error.message}`)
    if (!data || data.length === 0) break
    for (const row of data) {
      if (row.storage_path) paths.add(row.storage_path)
      if (row.thumb_path) paths.add(row.thumb_path)
    }
    lidas += data.length
    offset += data.length
  }

  if (count == null) abortar('o banco nao devolveu o total de posture_photos')
  if (lidas !== count) {
    abortar(
      `leitura incompleta de posture_photos: ${lidas} linha(s) lidas de ${count}. ` +
        'Rodar a limpeza com a lista incompleta classificaria foto legitima como orfa.'
    )
  }
  return { paths, linhas: lidas }
}

// Revalidacao imediatamente antes de apagar: confirma que NENHUM candidato tem
// linha no banco agora. Consulta os dois campos, em blocos, para caber no
// tamanho de URL do PostgREST.
async function candidatosAindaOrfaos(candidatos) {
  const conhecidos = []
  for (let i = 0; i < candidatos.length; i += DELETE_CHUNK) {
    const bloco = candidatos.slice(i, i + DELETE_CHUNK)
    for (const coluna of ['storage_path', 'thumb_path']) {
      const { data, error } = await supabase
        .from('posture_photos')
        .select(coluna)
        .in(coluna, bloco)
      if (error) abortar(`ao revalidar candidatos (${coluna}): ${error.message}`)
      for (const row of data ?? []) if (row[coluna]) conhecidos.push(row[coluna])
    }
  }
  return conhecidos
}

// ---------------------------------------------------------------- storage
// anda a arvore org/subject/session do bucket
async function listDir(prefix) {
  const out = []
  let page = 0
  for (;;) {
    const { data, error } = await supabase.storage
      .from('photos')
      .list(prefix, { limit: PAGE, offset: page * PAGE })
    if (error) throw new Error(`list ${prefix || '(raiz)'}: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
    page++
  }
}

const { paths: known, linhas } = await readAllPhotoPaths()
console.log(`${linhas} linha(s) em posture_photos, ${known.size} caminho(s) conhecido(s).`)

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

if (!doDelete) {
  console.log('\n(nada removido — rode com --delete para apagar)')
  process.exit(0)
}

const conhecidos = await candidatosAindaOrfaos(orphans)
if (conhecidos.length > 0) {
  abortar(
    `${conhecidos.length} candidato(s) TEM linha em posture_photos na revalidacao ` +
      `(ex.: ${conhecidos[0]}). A lista nao e confiavel; investigue antes de apagar.`
  )
}

for (let i = 0; i < orphans.length; i += DELETE_CHUNK) {
  const bloco = orphans.slice(i, i + DELETE_CHUNK)
  const { error } = await supabase.storage.from('photos').remove(bloco)
  if (error) {
    console.error('ERRO ao remover:', error.message)
    console.error(`Removidos ${i} de ${orphans.length} antes da falha.`)
    process.exit(1)
  }
}
console.log(`Removidos ${orphans.length} objeto(s).`)
