// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AnamnesePublica from './AnamnesePublica'
import type { PublicIntake } from '../features/anamnesis/intake'

const mocks = vi.hoisted(() => ({ intake: vi.fn() }))

vi.mock('../features/anamnesis/intake', async (original) => ({
  ...(await original<typeof import('../features/anamnesis/intake')>()),
  consumePublicIntakeToken: () => 'T'.repeat(43),
  getIntakeByToken: mocks.intake,
}))

function cadastro(over: Partial<PublicIntake> = {}): PublicIntake {
  return {
    kind: 'cadastro_anamnese', orgName: 'Estúdio Teste', subjectFirstName: null, subjectSex: null,
    specVersion: '1.3', orgContactEmail: null, orgContactPhone: null, ...over,
  }
}

function abrir() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AnamnesePublica />
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  sessionStorage.clear()
})

describe('nome de quem aceita o termo', () => {
  it('no link de cadastro acompanha o nome digitado acima, para não ser recusado por diferença', async () => {
    mocks.intake.mockResolvedValue(cadastro())
    abrir()
    fireEvent.change(await screen.findByLabelText('Nome completo'), { target: { value: 'Maria da Silva Souza' } })
    const assinatura = screen.getByLabelText('Nome completo de quem aceita') as HTMLInputElement
    expect(assinatura.value).toBe('Maria da Silva Souza')
    expect(screen.getByText('Igual ao nome completo informado acima.')).toBeTruthy()

    // Quem mexe no campo assume o controle dele.
    fireEvent.change(assinatura, { target: { value: 'Maria S. Souza' } })
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Maria da Silva' } })
    expect(assinatura.value).toBe('Maria S. Souza')
  })

  it('no link de anamnese explica que o nome precisa ser o do cadastro do profissional', async () => {
    mocks.intake.mockResolvedValue(cadastro({ kind: 'anamnese', subjectFirstName: 'Marta', subjectSex: 'F' }))
    abrir()
    expect(await screen.findByText(/Igual ao seu nome completo no cadastro de Estúdio Teste/)).toBeTruthy()
    expect((screen.getByLabelText('Nome completo de quem aceita') as HTMLInputElement).value).toBe('')
  })
})
