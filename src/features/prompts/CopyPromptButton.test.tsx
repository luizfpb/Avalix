// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { CopyPromptButton } from './CopyPromptButton'

// O que se testa aqui é o contrato do botão com o mundo real: copiar chama o
// clipboard e a auditoria; clipboard bloqueado (permissão negada, contexto
// inseguro, WebView) não pode falhar em silêncio, tem que abrir o texto para
// seleção manual.

function setClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
}

beforeEach(() => setClipboard(() => Promise.resolve()))
afterEach(cleanup)

describe('CopyPromptButton', () => {
  it('copia o texto construído e avisa a auditoria', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    setClipboard(writeText)
    const onCopied = vi.fn()
    render(<CopyPromptButton build={() => 'PROMPT GERADO'} onCopied={onCopied} />)

    fireEvent.click(screen.getByRole('button', { name: /Copiar prompt para IA/ }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('PROMPT GERADO'))
    expect(onCopied).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/Copiado!/)).toBeTruthy()
  })

  it('reconstrói o texto a cada clique, sem servir versão velha', async () => {
    let n = 0
    const writeText = vi.fn(() => Promise.resolve())
    setClipboard(writeText)
    render(<CopyPromptButton build={() => `versão ${++n}`} />)

    const botao = screen.getByRole('button', { name: /Copiar prompt/ })
    fireEvent.click(botao)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('versão 1'))
    fireEvent.click(botao)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('versão 2'))
  })

  it('clipboard bloqueado abre o texto para seleção manual em vez de falhar calado', async () => {
    setClipboard(() => Promise.reject(new Error('NotAllowedError')))
    const onCopied = vi.fn()
    render(<CopyPromptButton build={() => 'PROMPT GERADO'} onCopied={onCopied} />)

    fireEvent.click(screen.getByRole('button', { name: /Copiar prompt/ }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    const area = await screen.findByLabelText('Prompt gerado')
    expect((area as HTMLTextAreaElement).value).toBe('PROMPT GERADO')
    expect(onCopied).not.toHaveBeenCalled()
  })

  it('deixa ler o texto antes de colar em serviço de terceiro', () => {
    render(<CopyPromptButton build={() => 'PROMPT GERADO'} />)
    expect(screen.queryByLabelText('Prompt gerado')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Ver o texto/ }))
    expect((screen.getByLabelText('Prompt gerado') as HTMLTextAreaElement).value).toBe('PROMPT GERADO')

    fireEvent.click(screen.getByRole('button', { name: /Ocultar texto/ }))
    expect(screen.queryByLabelText('Prompt gerado')).toBeNull()
  })

  it('avisa sobre dado de saúde e responsabilidade antes de qualquer clique', () => {
    render(<CopyPromptButton build={() => 'x'} />)
    expect(screen.getByText(/contém dados de saúde/i)).toBeTruthy()
    expect(screen.getByText(/responsabilidade sua/i)).toBeTruthy()
    expect(screen.getByText(/rascunho para você revisar/i)).toBeTruthy()
  })
})
