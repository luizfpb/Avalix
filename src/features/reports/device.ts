// Resumo legível do aparelho a partir do user agent gravado com o erro. O que
// separa um defeito do iPhone de um do Android é a primeira pergunta de
// qualquer diagnóstico — e o user agent inteiro não cabe na lista.
export function deviceLabel(userAgent: string | null | undefined): string | null {
  const ua = userAgent ?? ''
  if (!ua) return null
  const ios = /\b(iPhone|iPad|iPod)\b.*?OS (\d+)[_.](\d+)/.exec(ua)
  if (ios) {
    const app = /CriOS/.test(ua) ? ' · Chrome' : /FxiOS/.test(ua) ? ' · Firefox' : ''
    return `${ios[1]} · iOS ${ios[2]}.${ios[3]}${app}`
  }
  const android = /Android (\d+(?:\.\d+)?)/.exec(ua)
  if (android) {
    const browser = /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox/.test(ua) ? 'Firefox' : 'Chrome'
    return `Android ${android[1]} · ${browser}`
  }
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : null
  return [os, browser].filter(Boolean).join(' · ') || null
}
