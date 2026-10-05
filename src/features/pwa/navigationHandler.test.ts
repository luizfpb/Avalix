import { afterEach, describe, expect, it, vi } from 'vitest'
import { navigateNetworkFirst } from './navigationHandler'

const shell = () => new Response('<html>shell guardado</html>', { status: 200 })

function ambiente(rede: () => Promise<Response>, copia: Response | null = shell()) {
  vi.stubGlobal('fetch', vi.fn(rede))
  vi.stubGlobal('caches', { match: vi.fn(async () => copia ?? undefined) })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const pedido = new Request('https://avalixfit.com.br/dashboard')

describe('abrir uma página pelo service worker', () => {
  it('com rede, entrega a página da rede (versão mais nova)', async () => {
    ambiente(async () => new Response('<html>da rede</html>', { status: 200 }))
    expect(await (await navigateNetworkFirst({ request: pedido })).text()).toBe('<html>da rede</html>')
  })

  it('sem rede, abre pela cópia guardada no aparelho', async () => {
    ambiente(async () => { throw new TypeError('Failed to fetch') })
    expect(await (await navigateNetworkFirst({ request: pedido })).text()).toBe('<html>shell guardado</html>')
  })

  it('rede que não responde em 3,5 s: abre pela cópia em vez de esperar', async () => {
    vi.useFakeTimers()
    ambiente(() => new Promise(() => {}))
    const resposta = navigateNetworkFirst({ request: pedido })
    await vi.advanceTimersByTimeAsync(3500)
    expect(await (await resposta).text()).toBe('<html>shell guardado</html>')
  })

  // O defeito que deixava o site em ERR_FAILED: resposta redirecionada
  // usada para abrir a página.
  it('resposta redirecionada nunca chega à página como redirecionada', async () => {
    const redirecionada = new Response('<html>da rede</html>', { status: 200 })
    Object.defineProperty(redirecionada, 'redirected', { value: true })
    ambiente(async () => redirecionada)
    const resposta = await navigateNetworkFirst({ request: pedido })
    expect(resposta.redirected).toBe(false)
    expect(await resposta.text()).toBe('<html>da rede</html>')
  })

  it('rota que o servidor não conhece abre o app pela cópia, que leva à tela certa', async () => {
    ambiente(async () => new Response('não encontrada', { status: 404 }))
    expect(await (await navigateNetworkFirst({ request: pedido })).text()).toBe('<html>shell guardado</html>')
  })

  it('sem rede e sem cópia, devolve erro de rede em vez de travar', async () => {
    ambiente(async () => { throw new TypeError('Failed to fetch') }, null)
    expect((await navigateNetworkFirst({ request: pedido })).type).toBe('error')
  })
})
