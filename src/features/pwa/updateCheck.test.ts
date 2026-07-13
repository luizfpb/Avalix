import { describe, expect, it, vi } from 'vitest'
import {
  entryAssetUrls,
  hasExpectedContentType,
  isPublicIntakeLocation,
  verifyPublishedShell,
} from './updateCheck'

describe('verificação da publicação do PWA', () => {
  it('extrai apenas entradas JS e CSS sem duplicar', () => {
    const html = `
      <script type="module" src="/assets/index-abc.js"></script>
      <link rel="stylesheet" href="/assets/index-def.css">
      <script src="/assets/index-abc.js"></script>
      <img src="/assets/logo.png">
    `
    expect(entryAssetUrls(html)).toEqual(['/assets/index-abc.js', '/assets/index-def.css'])
  })

  it('rejeita HTML devolvido no lugar de JavaScript', () => {
    expect(hasExpectedContentType('/assets/app.js', 'text/html; charset=utf-8')).toBe(false)
    expect(hasExpectedContentType('/assets/app.js', 'application/javascript')).toBe(true)
  })

  it('só aprova quando HTML, JS e CSS têm os tipos corretos', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.startsWith('/index.html')) {
        return new Response(
          '<script src="/assets/app.js"></script><link href="/assets/app.css" rel="stylesheet">',
          { headers: { 'content-type': 'text/html' } }
        )
      }
      if (url.startsWith('/assets/app.js')) {
        return new Response('export {}', { headers: { 'content-type': 'application/javascript' } })
      }
      return new Response('body{}', { headers: { 'content-type': 'text/css' } })
    })

    expect(await verifyPublishedShell(fetcher as typeof fetch, 1)).toBe(true)
  })

  it('bloqueia fallback HTML com status 200 no lugar do JS', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.startsWith('/index.html')) {
        return new Response('<script src="/assets/app.js"></script>', {
          headers: { 'content-type': 'text/html' },
        })
      }
      return new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })
    })

    expect(await verifyPublishedShell(fetcher as typeof fetch, 1)).toBe(false)
  })
})

describe('rota publica e PWA', () => {
  it('identifica a rota nova e o path legado', () => {
    expect(isPublicIntakeLocation('/a')).toBe(true)
    expect(isPublicIntakeLocation('/a/token-legado')).toBe(true)
    expect(isPublicIntakeLocation('/agenda')).toBe(false)
  })
})
