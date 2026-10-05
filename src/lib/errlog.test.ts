import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(() => Promise.resolve({ data: null, error: null })) }))
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc } }))

import {
  reportClientError,
  reportHandledError,
  sanitizeClientErrorText,
  sanitizedClientPath,
  setErrlogLink,
} from './errlog'

describe('higienizacao do log do cliente', () => {
  const token = 'Ab_'.repeat(14) + 'Z'

  it('remove capability token de path, fragmento e query', () => {
    const input = `falhou em /a/${token}, depois /a#${token}?token=${token}`
    const output = sanitizeClientErrorText(input, 600)
    expect(output).not.toContain(token)
    expect(output).toContain('[redacted]')
  })

  it('remove o token do link de treino do aluno (/t#token)', () => {
    const output = sanitizeClientErrorText(`falhou em https://avalixfit.com.br/t#${token}`, 600)
    expect(output).not.toContain(token)
    expect(output).toContain('/t#[redacted]')
  })

  it('reduz qualquer rota publica ao path sem segredo', () => {
    expect(sanitizedClientPath(`/a/${token}`)).toBe('/a')
    expect(sanitizedClientPath('/agenda')).toBe('/agenda')
  })

  it('remove tokens de auth em fragmento e query (callback OAuth/recuperacao)', () => {
    const secret = 'x'.repeat(48)
    const input =
      `erro em https://app/auth#access_token=${secret}&refresh_token=${secret}` +
      `&id_token=${secret}&provider_token=${secret}&code=${secret}?apikey=${secret}`
    const output = sanitizeClientErrorText(input, 600)
    expect(output).not.toContain(secret)
    expect(output).toContain('[redacted]')
  })
})

describe('erros das páginas do aluno', () => {
  const token = 'Tk_'.repeat(14) + 'Z'

  it('sem organização nem link, nada sai do aparelho', () => {
    setErrlogLink(null, null)
    reportClientError('erro sem dono')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('vai pelo token do link, com o contexto da tela e sem o token no texto', () => {
    setErrlogLink('treino', token)
    reportHandledError('treino:concluir', new TypeError(`Load failed em /t#${token}`))
    expect(mocks.rpc).toHaveBeenCalledOnce()
    const [nome, args] = mocks.rpc.mock.calls[0] as unknown as [string, Record<string, string>]
    expect(nome).toBe('report_link_error')
    expect(args.p_kind).toBe('treino')
    expect(args.p_token).toBe(token)
    expect(args.p_message).toBe('treino:concluir: TypeError: Load failed em /t#[redacted]')
    expect(args.p_message).not.toContain(token)
  })

  it('o mesmo erro repetido em laço sai uma vez só', () => {
    mocks.rpc.mockClear()
    setErrlogLink('anamnese', token)
    reportHandledError('anamnese:enviar', { message: 'link invalido, expirado ou ja utilizado' })
    reportHandledError('anamnese:enviar', { message: 'link invalido, expirado ou ja utilizado' })
    expect(mocks.rpc).toHaveBeenCalledOnce()
    expect((mocks.rpc.mock.calls[0] as unknown as [string, { p_kind: string }])[1].p_kind).toBe('anamnese')
    setErrlogLink(null, null)
  })
})
