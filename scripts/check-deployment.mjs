const baseUrl = process.env.DEPLOYMENT_URL?.trim()

if (!baseUrl) {
  throw new Error('smoke HTTP: DEPLOYMENT_URL não informada')
}

const base = new URL(baseUrl)
if (base.protocol !== 'https:' || base.username || base.password) {
  throw new Error('smoke HTTP: DEPLOYMENT_URL precisa ser uma URL HTTPS sem credenciais')
}

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

async function request(path, init = {}) {
  const url = new URL(path, base)
  let lastError

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
        ...init,
      })
      if (response.status < 500 || attempt === 5) return response
      lastError = new Error(`${url.pathname} respondeu ${response.status}`)
    } catch (error) {
      lastError = error
      if (attempt === 5) break
    }
    await sleep(attempt * 1_000)
  }

  throw new Error(`smoke HTTP: falha ao acessar ${url.pathname}`, {
    cause: lastError,
  })
}

function expectStatus(response, status, path) {
  if (response.status !== status) {
    const location = response.headers.get('location')
    throw new Error(
      `smoke HTTP: ${path} respondeu ${response.status}, esperado ${status}` +
        (location ? ` (Location: ${location})` : '')
    )
  }
}

function expectHeader(response, name, pattern, path) {
  const value = response.headers.get(name) ?? ''
  if (!pattern.test(value)) {
    throw new Error(
      `smoke HTTP: ${path} sem ${name} compatível com ${pattern}; recebido ${JSON.stringify(value)}`
    )
  }
}

const root = await request('/')
expectStatus(root, 200, '/')
expectHeader(root, 'content-type', /^text\/html\b/i, '/')
expectHeader(root, 'cache-control', /(?:no-store|no-cache)/i, '/')
expectHeader(root, 'strict-transport-security', /max-age=31536000/i, '/')
expectHeader(root, 'x-content-type-options', /^nosniff$/i, '/')
expectHeader(root, 'x-frame-options', /^DENY$/i, '/')
expectHeader(root, 'content-security-policy', /frame-ancestors 'none'/i, '/')

const rootHtml = await root.text()
if (!rootHtml.includes('<div id="root"></div>')) {
  throw new Error('smoke HTTP: / não contém o shell do aplicativo')
}

const entryPath = rootHtml.match(
  /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']([^"']+\.js)["'])[^>]*>/i
)?.[1]
if (!entryPath) throw new Error('smoke HTTP: entry JS não encontrado em /')

for (const path of ['/login', '/dashboard', '/a/smoke-token-inexistente']) {
  const response = await request(path)
  expectStatus(response, 200, path)
  expectHeader(response, 'content-type', /^text\/html\b/i, path)
  const html = await response.text()
  if (!html.includes(entryPath)) {
    throw new Error(`smoke HTTP: ${path} não serviu o mesmo shell de /`)
  }
}

const entry = await request(entryPath, { method: 'HEAD' })
expectStatus(entry, 200, entryPath)
expectHeader(entry, 'content-type', /javascript/i, entryPath)
expectHeader(entry, 'cache-control', /max-age=31536000.*immutable/i, entryPath)

const serviceWorker = await request('/sw.js', { method: 'HEAD' })
expectStatus(serviceWorker, 200, '/sw.js')
expectHeader(serviceWorker, 'content-type', /javascript/i, '/sw.js')
expectHeader(serviceWorker, 'cache-control', /(?:no-store|no-cache)/i, '/sw.js')

const missingAsset = await request('/assets/__avalix_smoke_missing__.js', {
  method: 'HEAD',
})
expectStatus(missingAsset, 404, '/assets/__avalix_smoke_missing__.js')

console.log(`smoke HTTP ok: ${base.origin}`)
