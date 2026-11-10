import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { estimateOneRm, percentTable, repsForLoad, roundToIncrement } from '../features/workout/oneRm'
import {
  jp3MaleBodyDensity,
  jp7BodyDensity,
  jpWardFemaleBodyDensity,
  usNavyBodyFatPct,
} from '../features/assessment/protocols/equations'
import { siriBodyFatPct } from '../features/assessment/protocols/bodyComposition'

// Páginas públicas (landing, recursos e ferramentas grátis): HTML estático
// gerado por scripts/gerar-site.mjs, fora da SPA, para o Google indexar.

type Gerador = { gerarTudo: () => Map<string, string> }
type Calculos = {
  estimateOneRm: typeof estimateOneRm
  repsForLoad: typeof repsForLoad
  roundToIncrement: typeof roundToIncrement
  percentTable: (oneRm: number, pcts?: number[]) => { pct: number; load: number; reps: number }[]
  jp7BodyDensity: typeof jp7BodyDensity
  jp3MaleBodyDensity: typeof jp3MaleBodyDensity
  jpWardFemaleBodyDensity: typeof jpWardFemaleBodyDensity
  siriBodyFatPct: typeof siriBodyFatPct
  usNavyBodyFatPct: typeof usNavyBodyFatPct
  lerNumero: (texto: string) => number | null
}

const raiz = new URL('../../', import.meta.url)
const ler = (caminho: string) => readFile(new URL(caminho, raiz), 'utf8')
// import por variável: os módulos são .mjs/.js sem tipos, fora do tsconfig do app
const importar = <T,>(caminho: string) => import(/* @vite-ignore */ new URL(caminho, raiz).href) as Promise<T>

const PUBLICAS = [
  '/avaliacao-fisica',
  '/avaliacao-postural',
  '/app-para-personal-trainer',
  '/calculadora-1rm',
  '/calculadora-percentual-de-gordura',
  '/modelo-de-anamnese',
]

function blocosDeHeaders(texto: string) {
  const blocos = new Map<string, string[]>()
  let atual: string | null = null
  for (const linha of texto.split(/\r?\n/)) {
    if (!linha.trim() || linha.startsWith('#')) continue
    if (!/^\s/.test(linha)) {
      atual = linha.trim()
      blocos.set(atual, [])
    } else if (atual) {
      blocos.get(atual)!.push(linha.trim())
    }
  }
  return blocos
}

describe('páginas públicas', () => {
  it('os arquivos em public/ são os que o gerador produz', async () => {
    const { gerarTudo } = await importar<Gerador>('scripts/gerar-site.mjs')
    for (const [arquivo, esperado] of gerarTudo()) {
      const atual = await ler(arquivo)
      expect(atual.replace(/\r\n/g, '\n'), `${arquivo}: rode node scripts/gerar-site.mjs`).toBe(esperado)
    }
  })

  it('só a raiz e as páginas públicas saem do noindex', async () => {
    const blocos = blocosDeHeaders(await ler('public/_headers'))
    expect(blocos.get('/*')).toContain('X-Robots-Tag: noindex, nofollow, noarchive')
    const liberadas = [...blocos].filter(([, linhas]) => linhas.includes('! X-Robots-Tag')).map(([rota]) => rota)
    expect(liberadas.sort()).toEqual(['/', ...PUBLICAS, '/robots.txt', '/sitemap.xml'].sort())
    // o shell da SPA continua noindex também no HTML
    expect(await ler('index.html')).toContain('<meta name="robots" content="noindex, nofollow, noarchive" />')
  })

  it('toda página pública está no sitemap, com a URL canônica', async () => {
    const sitemap = await ler('public/sitemap.xml')
    for (const rota of ['/', ...PUBLICAS]) {
      expect(sitemap).toContain(`<loc>https://avalixfit.com.br${rota}</loc>`)
      const arquivo = rota === '/' ? 'public/inicio.html' : `public${rota}.html`
      expect(await ler(arquivo)).toContain(`<link rel="canonical" href="https://avalixfit.com.br${rota}" />`)
    }
    expect(await ler('public/robots.txt')).toContain('Sitemap: https://avalixfit.com.br/sitemap.xml')
  })

  it('os links do aluno não são rastreados', async () => {
    const robots = await ler('public/robots.txt')
    for (const regra of ['Disallow: /a/', 'Disallow: /t/', 'Disallow: /t$']) expect(robots).toContain(regra)
    // nenhuma página pública pode cair nos bloqueios
    for (const rota of PUBLICAS) expect(rota.startsWith('/a/') || rota.startsWith('/t/') || rota === '/t').toBe(false)
  })

  it('só a landing manda quem tem sessão para o painel', async () => {
    expect(await ler('public/inicio.html')).toContain('<script src="/site/entrar.js"></script>')
    for (const rota of PUBLICAS) {
      expect(await ler(`public${rota}.html`)).not.toContain('entrar.js')
    }
  })

  // Preço na página e preço cobrado não podem divergir.
  it('os preços da landing são os de billing_plans', async () => {
    const sql = await ler('supabase/migrations/0050_tres_planos.sql')
    const planos = [...sql.matchAll(/\('(\w+)', '([^']+)', ([\d.]+), ([\d.]+), (\d+|null), \d+\)/g)]
    expect(planos).toHaveLength(3)
    const landing = await ler('public/inicio.html')
    const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
      .format(v).replace(/,00$/, '').replace(/\u00a0/g, ' ')
    for (const [, , nome, mensal, anual, limite] of planos) {
      expect(landing).toContain(`<h3>${nome}</h3>`)
      expect(landing).toContain(`${brl(Number(mensal))} <small>/mês</small>`)
      expect(landing).toContain(`ou ${brl(Number(anual))} no plano anual`)
      expect(landing).toContain(limite === 'null' ? 'Alunos ilimitados' : `Até ${limite} alunos ativos`)
    }
  })
})

describe('fórmulas das ferramentas grátis', () => {
  it('1RM igual ao app', async () => {
    const c = await importar<Calculos>('public/site/calculos.js')
    for (const [carga, reps] of [[80, 1], [80, 8], [100, 5], [42.5, 12], [60, 36]]) {
      expect(c.estimateOneRm(carga, reps)).toBe(estimateOneRm(carga, reps))
      expect(c.estimateOneRm(carga, reps, 'brzycki')).toBe(estimateOneRm(carga, reps, 'brzycki'))
      expect(c.repsForLoad(carga * 1.2, carga)).toBe(repsForLoad(carga * 1.2, carga))
    }
    expect(c.roundToIncrement(81.3)).toBe(roundToIncrement(81.3))
    const pcts = [100, 85, 70, 50]
    expect(c.percentTable(101.33, pcts)).toEqual(percentTable(101.33, pcts))
  })

  it('dobras, Siri e US Navy iguais ao app', async () => {
    const c = await importar<Calculos>('public/site/calculos.js')
    for (const sexo of ['M', 'F'] as const) {
      expect(c.jp7BodyDensity(sexo, 112, 34)).toBe(jp7BodyDensity(sexo, 112, 34))
    }
    expect(c.jp3MaleBodyDensity(60, 28)).toBe(jp3MaleBodyDensity(60, 28))
    expect(c.jpWardFemaleBodyDensity(70, 41)).toBe(jpWardFemaleBodyDensity(70, 41))
    expect(c.siriBodyFatPct(1.0471)).toBe(siriBodyFatPct(1.0471))
    expect(c.usNavyBodyFatPct('M', 178, 38, 88)).toBe(usNavyBodyFatPct('M', 178, 38, 88))
    expect(c.usNavyBodyFatPct('F', 165, 32, 72, 98)).toBe(usNavyBodyFatPct('F', 165, 32, 72, 98))
  })

  it('o exemplo da landing é o que a fórmula dá', async () => {
    const pct = siriBodyFatPct(jp7BodyDensity('F', 9 + 11 + 18 + 14 + 21 + 15 + 24, 34))
    expect(pct.toFixed(1)).toBe('22.8')
    expect((62.4 - (62.4 * pct) / 100).toFixed(1)).toBe('48.2')
    const landing = await ler('public/inicio.html')
    expect(landing).toContain('<strong>22,8%</strong>')
    expect(landing).toContain('massa magra 48,2 kg')
  })

  it('lê número no formato brasileiro', async () => {
    const c = await importar<Calculos>('public/site/calculos.js')
    expect(c.lerNumero('72,5')).toBe(72.5)
    expect(c.lerNumero(' 80 ')).toBe(80)
    expect(c.lerNumero('')).toBeNull()
    expect(c.lerNumero('abc')).toBeNaN()
  })
})
