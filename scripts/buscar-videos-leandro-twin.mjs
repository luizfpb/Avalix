// Monta a planilha de CANDIDATOS a vídeo curado do catálogo global (0042):
// para cada exercício, busca no YouTube e fica só com vídeos do canal oficial
// do Leandro Twin, pontuando o quanto o título corresponde ao exercício.
//
// É uma planilha para revisão humana, não uma fonte de verdade: título
// parecido não garante que o vídeo mostre a variação certa. Só entra no banco
// o que for marcado "sim" na coluna `aprovado` (scripts/gerar-migration-videos.mjs).
//
//   node scripts/buscar-videos-leandro-twin.mjs <catalogo.csv> <saida.csv>
//
// As buscas ficam em <saida.csv>.cache.json: rodar de novo só recalcula a nota
// e busca o que faltou (o YouTube limita o ritmo, e o catálogo inteiro são
// mais de 500 consultas).
//
// catalogo.csv: name,primary_muscle,equipment,movement_pattern (com cabeçalho),
// exportado do banco com `\copy (select name, primary_muscle, equipment,
// movement_pattern from public.exercises where org_id is null ...) to ... csv header`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const CANAL = 'UCPlemwX82_QEWRDC6yYnOCg' // Leandro Twin (canal oficial)
const [entrada, saida] = process.argv.slice(2)
if (!entrada || !saida) {
  console.error('uso: node scripts/buscar-videos-leandro-twin.mjs <catalogo.csv> <saida.csv>')
  process.exit(1)
}

function lerCsv(texto) {
  const linhas = []
  let campo = ''
  let linha = []
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === ',') { linha.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      linha.push(campo); campo = ''
      if (linha.some((x) => x !== '')) linhas.push(linha)
      linha = []
    } else campo += c
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha) }
  const [cab, ...resto] = linhas
  return resto.map((l) => Object.fromEntries(cab.map((k, i) => [k, l[i] ?? ''])))
}

const PARADAS = new Set([
  'com', 'na', 'no', 'nos', 'nas', 'de', 'da', 'do', 'das', 'dos', 'em', 'o', 'a', 'os', 'as', 'e',
  'para', 'pra', 'como', 'fazer', 'faz', 'jeito', 'certo', 'correto', 'correta', 'corretamente',
  'execucao', 'exercicio', 'tecnica', 'um', 'uma', 'ao', 'aos', 'seu', 'sua', 'voce', 'mais',
  'melhor', 'treino', 'dica', 'dicas', 'guia', 'completo', 'aprenda', 'erro', 'erros',
])
const SINONIMOS = {
  halter: 'halteres', haltere: 'halteres', halteres: 'halteres',
  aparelho: 'maquina', maquina: 'maquina', maquinas: 'maquina',
  cabo: 'polia', cabos: 'polia', crossover: 'polia', cross: 'polia', polia: 'polia',
  barra: 'barra', smith: 'smith', elastico: 'elastico', kettlebell: 'kettlebell',
  faixa: 'elastico', band: 'elastico', miniband: 'elastico', afundos: 'afundo',
}
const EQUIPAMENTOS = new Set(['halteres', 'maquina', 'polia', 'barra', 'smith', 'elastico', 'kettlebell'])

function tokens(texto) {
  return texto
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !PARADAS.has(t))
    .map((t) => SINONIMOS[t] ?? (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t))
}

function segundos(duracao) {
  if (!duracao) return null
  return duracao.split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0)
}

// "Como fazer supino inclinado" mostra o movimento; "Preciso fazer cadeira
// abdutora?" discute se vale a pena. Os dois têm o nome do exercício no título.
function demonstracao(titulo) {
  const t = titulo.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  return /^como (fazer|executar)|execucao|forma correta|tecnica/.test(t) && !t.includes('?')
}

// Movimento e equipamento pesam diferente. "Como fazer afundos" serve para
// "Afundo com halteres" (o movimento bate, o equipamento só não é dito), mas
// "Como fazer leg press" não serve para "Z press" (sobra movimento no título).
// Por isso a nota do movimento é o F1 entre as palavras do nome e as do título:
// falta (cobertura) e sobra (precisão) derrubam. O que está entre parênteses
// no nome é outro nome do mesmo exercício e vale como alternativa.
function nota(nome, titulo) {
  const t = tokens(titulo)
  const tMov = new Set(t.filter((x) => !EQUIPAMENTOS.has(x)))
  const tEq = new Set(t.filter((x) => EQUIPAMENTOS.has(x)))
  const equipamentos = new Set(tokens(nome).filter((x) => EQUIPAMENTOS.has(x)))
  const principal = nome.replace(/\([^)]*\)/g, ' ')
  const alternativos = [...nome.matchAll(/\(([^)]*)\)/g)].map((m) => m[1])
  let f1 = 0
  for (const variante of [principal, ...alternativos]) {
    const mov = [...new Set(tokens(variante).filter((x) => !EQUIPAMENTOS.has(x)))]
    const comuns = mov.filter((x) => tMov.has(x)).length
    if (comuns === 0) continue
    const cobertura = comuns / mov.length
    const precisao = comuns / tMov.size
    f1 = Math.max(f1, (2 * cobertura * precisao) / (cobertura + precisao))
  }
  // equipamento no título que o exercício não usa = provavelmente outra variação
  const conflito = [...tEq].some((x) => !equipamentos.has(x))
  const equipamentoDito = [...equipamentos].every((x) => tEq.has(x))
  return { f1, conflito, equipamentoDito }
}

async function buscar(consulta) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(consulta)}&hl=pt-BR&gl=BR`
  const res = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept-Language': 'pt-BR,pt;q=0.9' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${consulta}`)
  const html = await res.text()
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s)
  if (!m) return []
  const achados = []
  ;(function andar(o) {
    if (!o || typeof o !== 'object') return
    if (o.videoRenderer) {
      const v = o.videoRenderer
      const dono = v.ownerText?.runs?.[0]
      achados.push({
        id: v.videoId,
        titulo: (v.title?.runs ?? []).map((r) => r.text).join(''),
        canal: dono?.text ?? '',
        canalId: dono?.navigationEndpoint?.browseEndpoint?.browseId ?? '',
        duracao: v.lengthText?.simpleText ?? '',
      })
    }
    for (const k in o) andar(o[k])
  })(JSON.parse(m[1]))
  return achados
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms))

const arquivoCache = `${saida}.cache.json`
const cache = existsSync(arquivoCache) ? JSON.parse(readFileSync(arquivoCache, 'utf8')) : {}

async function buscarComCache(consulta) {
  if (cache[consulta]) return cache[consulta]
  // A rede oscila ("fetch failed"): três tentativas antes de desistir da
  // consulta. O que falhou não entra no cache e é buscado na próxima rodada.
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const doCanal = (await buscar(consulta)).filter((v) => v.canalId === CANAL)
      cache[consulta] = doCanal
      writeFileSync(arquivoCache, JSON.stringify(cache))
      await espera(800)
      return doCanal
    } catch (e) {
      if (tentativa === 3) console.error(`desisti de "${consulta}": ${String(e)}`)
      else await espera(3000 * tentativa)
    }
  }
  return []
}

async function avaliar(ex) {
  const vistos = new Map()
  for (const consulta of [`leandro twin como fazer ${ex.name}`, `leandro twin ${ex.name}`]) {
    for (const v of await buscarComCache(consulta)) {
      if (!vistos.has(v.id)) vistos.set(v.id, v)
    }
  }
  const candidatos = [...vistos.values()]
    .map((v) => ({ ...v, ...nota(ex.name, v.titulo), s: segundos(v.duracao) }))
    // vídeo de demonstração: curto vence palestra de 20 minutos
    .map((v) => ({ ...v, demo: demonstracao(v.titulo) }))
    .map((v) => ({
      ...v,
      pontos: v.f1 - (v.conflito ? 0.3 : 0) - (v.s != null && v.s > 900 ? 0.2 : 0) + (v.demo ? 0.15 : 0)
        + (v.equipamentoDito ? 0.05 : 0),
    }))
    .sort((a, b) => b.pontos - a.pontos)
  const [melhor, segundo] = candidatos
  let confianca = 'nenhum'
  if (melhor) {
    confianca =
      melhor.f1 >= 0.99 && melhor.equipamentoDito && !melhor.conflito && melhor.demo && (melhor.s ?? 0) <= 900 ? 'alta'
        : melhor.f1 >= 0.66 && !melhor.conflito && melhor.demo ? 'média'
          : 'baixa'
  }
  const link = (v) => (v ? `https://www.youtube.com/watch?v=${v.id}` : '')
  return {
    exercicio: ex.name,
    grupo: ex.primary_muscle,
    equipamento: ex.equipment,
    confianca,
    link: link(melhor),
    titulo_do_video: melhor?.titulo ?? '',
    duracao: melhor?.duracao ?? '',
    alternativa_link: link(segundo),
    alternativa_titulo: segundo?.titulo ?? '',
    aprovado: '',
  }
}

// Quatro buscas em paralelo: uma de cada vez levava mais de uma hora para o
// catálogo inteiro. A ordem da planilha segue a do catálogo.
const catalogo = lerCsv(readFileSync(entrada, 'utf8'))
const linhas = new Array(catalogo.length)
let proximo = 0
let feitos = 0
await Promise.all(Array.from({ length: 4 }, async () => {
  while (proximo < catalogo.length) {
    const i = proximo++
    linhas[i] = await avaliar(catalogo[i])
    feitos++
    console.log(`${feitos}/${catalogo.length} ${linhas[i].confianca.padEnd(6)} ${catalogo[i].name} -> ${linhas[i].titulo_do_video || '—'}`)
  }
}))

// Separador ";" e BOM: abre direto no Excel em pt-BR com os acentos certos.
const colunas = Object.keys(linhas[0])
const celula = (v) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
writeFileSync(
  saida,
  String.fromCharCode(0xfeff) + [colunas.join(';'), ...linhas.map((l) => colunas.map((c) => celula(String(l[c]))).join(';'))].join('\r\n') + '\r\n',
  'utf8'
)
const conta = (c) => linhas.filter((l) => l.confianca === c).length
console.log(`\nalta ${conta('alta')} · média ${conta('média')} · baixa ${conta('baixa')} · nenhum ${conta('nenhum')}`)
