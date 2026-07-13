const ENTRY_ASSET_RE = /(?:src|href)=["'](\/assets\/[^"']+\.(?:js|css))["']/g

export function entryAssetUrls(html: string): string[] {
  return [...new Set([...html.matchAll(ENTRY_ASSET_RE)].map((match) => match[1]))]
}

export function hasExpectedContentType(url: string, contentType: string | null): boolean {
  const type = contentType?.toLowerCase() ?? ''
  if (url.endsWith('.js')) return type.includes('javascript')
  if (url.endsWith('.css')) return type.includes('text/css')
  return false
}

function withCheckParam(url: string, nonce: number): string {
  return `${url}${url.includes('?') ? '&' : '?'}pwa-check=${nonce}`
}

// Status 200 não basta: o fallback SPA pode devolver HTML para um JS ausente.
export async function verifyPublishedShell(
  fetcher: typeof fetch = fetch,
  nonce = Date.now()
): Promise<boolean> {
  try {
    const htmlResponse = await fetcher(withCheckParam('/index.html', nonce), {
      cache: 'no-store',
    })
    if (!htmlResponse.ok || !htmlResponse.headers.get('content-type')?.includes('text/html')) {
      return false
    }

    const assets = entryAssetUrls(await htmlResponse.text())
    if (!assets.some((url) => url.endsWith('.js'))) return false

    const responses = await Promise.all(
      assets.map(async (url) => ({
        url,
        response: await fetcher(withCheckParam(url, nonce), { cache: 'no-store' }),
      }))
    )
    return responses.every(
      ({ url, response }) =>
        response.ok && hasExpectedContentType(url, response.headers.get('content-type'))
    )
  } catch {
    return false
  }
}
