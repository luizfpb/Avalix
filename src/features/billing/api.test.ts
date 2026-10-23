import { beforeEach, describe, expect, it, vi } from 'vitest'

// O supabase-js guarda o fetch global ao criar o cliente: o falso entra antes.
const { fetchMock } = vi.hoisted(() => {
  const fetchMock = vi.fn()
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return { fetchMock }
})

import { billingRequest } from './api'
import { normalizeDbError } from '../../lib/errors'

beforeEach(() => fetchMock.mockReset())

async function mensagemDaTela(): Promise<string> {
  try {
    await billingRequest('org-1', { action: 'cancel' })
  } catch (error) {
    return normalizeDbError(error)
  }
  throw new Error('deveria ter falhado')
}

describe('billingRequest: o que a tela mostra quando a function falha', () => {
  it('erro da própria function: a mensagem em português do corpo', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Não há assinatura em vigor para cancelar.' }), {
      status: 409, headers: { 'Content-Type': 'application/json' },
    }))
    expect(await mensagemDaTela()).toBe('Não há assinatura em vigor para cancelar.')
  })

  // 503 do gateway (function fora do ar, deploy em andamento) vem sem o JSON
  // da function; antes a tela mostrava "Edge Function returned a non-2xx status code".
  it('503 sem corpo: mensagem em português, sem o texto interno do SDK', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }))
    const texto = await mensagemDaTela()
    expect(texto).toMatch(/serviço de pagamento/i)
    expect(texto).not.toMatch(/Edge Function|non-2xx/i)
  })

  it('500 com HTML: mensagem em português', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }))
    expect(await mensagemDaTela()).toMatch(/serviço de pagamento/i)
  })

  // Sem internet, o SDK devolve FunctionsFetchError("Failed to send a request
  // to the Edge Function"), que ia para a tela em inglês. Aqui o retorno do SDK
  // é simulado direto: com o fetch falso rejeitando, o próprio supabase-js
  // deixa uma rejeição derivada sem tratamento, e o vitest a acusa.
  it('sem rede: diz que é a conexão', async () => {
    const { supabase } = await import('../../lib/supabase')
    const { FunctionsFetchError } = await import('@supabase/supabase-js')
    const spy = vi.spyOn(supabase, 'functions', 'get').mockReturnValue({
      invoke: async () => ({ data: null, error: new FunctionsFetchError(new TypeError('Failed to fetch')) }),
    } as unknown as typeof supabase.functions)
    expect(await mensagemDaTela()).toBe('Falha de conexão. Verifique sua internet e tente de novo.')
    spy.mockRestore()
  })
})
