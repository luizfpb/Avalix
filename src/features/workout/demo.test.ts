import { describe, it, expect } from 'vitest'
import {
  canonicalYoutubeUrl,
  exerciseDemoQuery,
  exerciseDemoUrl,
  resolveExerciseVideo,
  videoOrSearch,
} from './demo'

describe('demonstração de exercício', () => {
  it('monta a busca em pt-BR focada em execução', () => {
    expect(exerciseDemoQuery('Agachamento livre')).toBe('Agachamento livre execução do exercício')
  })

  it('apara espaços do nome', () => {
    expect(exerciseDemoQuery('  Supino reto  ')).toBe('Supino reto execução do exercício')
  })

  it('gera URL de busca do YouTube com a query codificada', () => {
    const url = exerciseDemoUrl('Agachamento sumô')
    expect(url.startsWith('https://www.youtube.com/results?search_query=')).toBe(true)
    // acentos e espaços codificados
    expect(url).toContain(encodeURIComponent('Agachamento sumô execução do exercício'))
    expect(url).not.toContain(' ')
  })
})

describe('link do YouTube colado pelo profissional', () => {
  const canon = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

  it('converte os formatos comuns para a forma canônica', () => {
    for (const colado of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=2',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share',
      'https://youtu.be/dQw4w9WgXcQ?si=abc',
      'youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      '  https://www.youtube.com/live/dQw4w9WgXcQ  ',
    ]) {
      expect(canonicalYoutubeUrl(colado)).toBe(canon)
    }
  })

  it('preserva o instante inicial em segundos', () => {
    expect(canonicalYoutubeUrl('https://youtu.be/dQw4w9WgXcQ?t=42')).toBe(`${canon}&t=42`)
    expect(canonicalYoutubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s')).toBe(`${canon}&t=90`)
    expect(canonicalYoutubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ?start=15')).toBe(`${canon}&t=15`)
  })

  it('recusa o que não é um vídeo do YouTube', () => {
    for (const colado of [
      '',
      'supino',
      'https://vimeo.com/123456',
      'https://www.youtube.com/@leandrotwin',
      'https://www.youtube.com/playlist?list=PL123',
      'https://www.youtube.com/results?search_query=supino',
      'https://www.youtube.com/watch?v=curto',
      'https://youtube.com.golpe.io/watch?v=dQw4w9WgXcQ',
      'javascript:alert(1)',
    ]) {
      expect(canonicalYoutubeUrl(colado)).toBeNull()
    }
  })
})

describe('qual vídeo o exercício usa', () => {
  it('o do profissional vence o do catálogo, que vence a busca', () => {
    const base = { name: 'Supino reto com barra' }
    expect(resolveExerciseVideo({ ...base, own_video_url: 'a', catalog_video_url: 'b' })).toEqual({ url: 'a', kind: 'own' })
    expect(resolveExerciseVideo({ ...base, own_video_url: null, catalog_video_url: 'b' })).toEqual({ url: 'b', kind: 'catalog' })
    expect(resolveExerciseVideo(base)).toEqual({ url: exerciseDemoUrl(base.name), kind: 'search' })
  })

  it('no pacote do aluno o servidor já resolveu; nulo vira busca', () => {
    expect(videoOrSearch('a', 'Remada')).toEqual({ url: 'a', kind: 'catalog' })
    expect(videoOrSearch(null, 'Remada').kind).toBe('search')
  })
})
