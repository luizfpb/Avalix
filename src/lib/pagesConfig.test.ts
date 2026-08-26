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
      ['/a/*', '/', '200'],
      ['/avaliados/*', '/', '200'],
      ['/ferramentas/*', '/', '200'],
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

  it('mantem 404 real para caminhos que nao pertencem a SPA', async () => {
    const rules = await readRedirectRules()
    const notFound = await readFile(new URL('../../public/404.html', import.meta.url), 'utf8')

    expect(rules.some(([source]) => source === '/*')).toBe(false)
    expect(notFound).toContain('<h1>Página não encontrada</h1>')
  })
})
