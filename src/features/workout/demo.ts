// Demonstração de exercício SEM custo: a decisão de produto é "só se gratuito"
// — nada de hospedar mídia (storage/banda) nem API paga de biblioteca de
// vídeos. Tudo é link para o YouTube, em três níveis (0042):
//
//   1. o vídeo que o profissional escolheu para o exercício ('own');
//   2. o vídeo curado do catálogo global ('catalog');
//   3. a busca pelo nome do exercício ('search'), quando não há nenhum dos dois.

// Foca o resultado em vídeos de técnica em pt-BR.
export function exerciseDemoQuery(name: string): string {
  return `${name.trim()} execução do exercício`
}

// Busca no YouTube (vídeo é o formato que importa pra conferir a execução).
export function exerciseDemoUrl(name: string): string {
  const q = encodeURIComponent(exerciseDemoQuery(name))
  return `https://www.youtube.com/results?search_query=${q}`
}

export type ExerciseVideoKind = 'own' | 'catalog' | 'search'
export type ExerciseVideo = { url: string; kind: ExerciseVideoKind }

export function resolveExerciseVideo(exercise: {
  name: string
  own_video_url?: string | null
  catalog_video_url?: string | null
}): ExerciseVideo {
  if (exercise.own_video_url) return { url: exercise.own_video_url, kind: 'own' }
  if (exercise.catalog_video_url) return { url: exercise.catalog_video_url, kind: 'catalog' }
  return { url: exerciseDemoUrl(exercise.name), kind: 'search' }
}

// Link já resolvido pelo servidor (pacote do aluno) ou nulo -> busca.
export function videoOrSearch(url: string | null | undefined, name: string): ExerciseVideo {
  return url ? { url, kind: 'catalog' } : { url: exerciseDemoUrl(name), kind: 'search' }
}

const ID = /^[A-Za-z0-9_-]{11}$/
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'])

// "90", "90s", "1m30s", "1h02m03s" -> segundos
function parseStart(value: string | null): number | null {
  if (!value) return null
  if (/^\d+s?$/.test(value)) return Number.parseInt(value, 10) || null
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
  if (!m || (!m[1] && !m[2] && !m[3])) return null
  const total = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
  return total > 0 ? total : null
}

// O que o profissional cola -> a forma única que o banco aceita
// (https://www.youtube.com/watch?v=<id>, com &t=<segundos> opcional).
// youtu.be, shorts, embed, live e m.youtube.com são convertidos; o que não é
// vídeo do YouTube (canal, playlist, busca, outro site) volta nulo.
export function canonicalYoutubeUrl(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  let url: URL
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase()
  const parts = url.pathname.split('/').filter(Boolean)
  let id: string | null = null
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    id = parts[0] ?? null
  } else if (HOSTS.has(host)) {
    if (parts[0] === 'watch') id = url.searchParams.get('v')
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0] ?? '')) id = parts[1] ?? null
  }
  if (!id || !ID.test(id)) return null
  const start = parseStart(url.searchParams.get('t') ?? url.searchParams.get('start'))
  return `https://www.youtube.com/watch?v=${id}${start && start < 100000 ? `&t=${start}` : ''}`
}
