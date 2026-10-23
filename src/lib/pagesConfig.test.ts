import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

type RedirectRule = readonly [source: string, destination: string, status: string]

async function readRedirectRules() {
  const contents = await readFile(new URL('../../public/_redirects', import.meta.url), 'utf8')

  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split(/\s+/) as unknown as RedirectRule)
}

describe('configuracao do Cloudflare Pages', () => {
  it('serve todas as rotas conhecidas pelo shell sem redirect canonico', async () => {
    expect(await readRedirectRules()).toEqual([
      ['/a', '/', '200'],
      ['/t', '/', '200'],
      ['/t/', '/', '200'],
      ['/login', '/', '200'],
      ['/cadastro', '/', '200'],
      ['/recuperar-senha', '/', '200'],
      ['/mfa', '/', '200'],
      ['/onboarding', '/', '200'],
      ['/dashboard', '/', '200'],
      ['/avaliados', '/', '200'],
      ['/configuracoes', '/', '200'],
      ['/auditoria', '/', '200'],
      ['/agenda', '/', '200'],
      ['/carteira', '/', '200'],
      ['/exercicios', '/', '200'],
      ['/termos', '/', '200'],
      ['/a/*', '/', '200'],
      ['/avaliados/*', '/', '200'],
      ['/ferramentas/*', '/', '200'],
      ['/configuracoes/*', '/', '200'],
    ])
  })

  it('publica o app do aluno sem cachear shell nem manifest', async () => {
    const headers = await readFile(new URL('../../public/_headers', import.meta.url), 'utf8')
    const manifest = JSON.parse(
      await readFile(new URL('../../public/treino.webmanifest', import.meta.url), 'utf8')
    ) as { id?: string; start_url?: string; scope?: string }

    for (const path of ['/t', '/t/', '/treino.webmanifest']) {
      expect(headers).toMatch(new RegExp(`(?:^|\\n)${path.replace('/', '\\/')}\\r?\\n(?:  .+\\r?\\n)*  Cache-Control: [^\\n]*(?:no-store|no-cache)`, 'm'))
    }
    expect(manifest).toMatchObject({ id: '/t', start_url: '/t', scope: '/t' })
  })

  // O MediaPipe junta tres pecas que precisam da MESMA versao: o JS do npm, o
  // WASM baixado do jsdelivr e o caminho liberado na CSP. Com "^" no
  // package.json um npm update trocava o JS sozinho; com o dominio inteiro na
  // CSP, qualquer pacote do jsdelivr podia rodar como script.
  it('fixa a versao do MediaPipe no package, no carregador e na CSP', async () => {
    const { MEDIAPIPE_VERSION } = await import('../features/posture/poseDetect')
    const pkg = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8')
    ) as { dependencies: Record<string, string> }
    const headers = await readFile(new URL('../../public/_headers', import.meta.url), 'utf8')
    const csp = /Content-Security-Policy: (.+)/.exec(headers)?.[1] ?? ''
    const directive = (name: string) =>
      csp.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? ''
    const liberado = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/`

    expect(pkg.dependencies['@mediapipe/tasks-vision']).toBe(MEDIAPIPE_VERSION)
    for (const name of ['script-src', 'connect-src']) {
      const sources = directive(name).split(/\s+/)
      expect(sources).toContain(liberado)
      expect(sources.filter((s) => s.startsWith('https://cdn.jsdelivr.net'))).toEqual([liberado])
    }
    expect(directive('connect-src').split(/\s+/)).not.toContain('https://storage.googleapis.com')
  })

  // A lista acima é escrita à mão, e as rotas novas da 0049 (/termos e
  // /configuracoes/plano) ficaram de fora: em produção as duas respondiam 404
  // para quem chegava sem o service worker — inclusive o retorno do checkout
  // do Asaas e o link dos Termos no cadastro. Aqui a fonte é o próprio App.tsx.
  it('toda rota declarada no App.tsx chega ao shell pelo _redirects', async () => {
    const app = await readFile(new URL('../App.tsx', import.meta.url), 'utf8')
    const paths = [...app.matchAll(/path=["']([^"']+)["']/g)]
      .map((m) => m[1])
      .filter((path) => path !== '/' && path !== '*')
    expect(paths.length).toBeGreaterThan(20)
    const rules = await readRedirectRules()
    const coberta = (path: string) => {
      const concreta = path.replace(/:[^/]+/g, 'x')
      return rules.some(([source, destination, status]) => {
        if (destination !== '/' || status !== '200') return false
        if (source.endsWith('/*')) return concreta.startsWith(source.slice(0, -1))
        return source === concreta
      })
    }
    expect(paths.filter((path) => !coberta(path))).toEqual([])
  })

  // Irmão do teste acima: o _headers também tem lista por rota (o HTML do
  // shell nunca fica em cache). /termos e /configuracoes/plano passaram a ser
  // servidas pelo _redirects em 23/10, mas ficaram sem o no-store, e o smoke
  // do deploy reprovou ("public, max-age=0, must-revalidate").
  it('toda rota declarada no App.tsx serve o shell sem cache', async () => {
    const app = await readFile(new URL('../App.tsx', import.meta.url), 'utf8')
    const headers = await readFile(new URL('../../public/_headers', import.meta.url), 'utf8')
    const semCache = headers
      .split(/\r?\n(?=\S)/)
      .filter((bloco) => /Cache-Control: [^\n]*no-store/.test(bloco))
      .map((bloco) => bloco.split(/\r?\n/)[0].trim())
    const paths = [...app.matchAll(/path=["']([^"']+)["']/g)]
      .map((m) => m[1])
      .filter((path) => path !== '*')
    const coberta = (path: string) => {
      const concreta = path.replace(/:[^/]+/g, 'x')
      return semCache.some((source) =>
        source.endsWith('/*') ? concreta.startsWith(source.slice(0, -1)) : source === concreta
      )
    }
    expect(paths.filter((path) => !coberta(path))).toEqual([])
  })

  it('mantem 404 real para caminhos que nao pertencem a SPA', async () => {
    const rules = await readRedirectRules()
    const notFound = await readFile(new URL('../../public/404.html', import.meta.url), 'utf8')

    expect(rules.some(([source]) => source === '/*')).toBe(false)
    expect(notFound).toContain('<h1>Página não encontrada</h1>')
  })
})
