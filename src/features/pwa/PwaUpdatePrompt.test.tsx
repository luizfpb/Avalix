// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PwaUpdatePrompt } from './PwaUpdatePrompt'

type RegisterOptions = {
  immediate?: boolean
  onNeedRefresh?: () => void
}

const { registerSWMock } = vi.hoisted(() => ({
  registerSWMock: vi.fn((_options: RegisterOptions) => vi.fn()),
}))

vi.mock('virtual:pwa-register', () => ({ registerSW: registerSWMock }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('registro do service worker', () => {
  it('registra silenciosamente na pagina publica do treino', () => {
    render(
      <MemoryRouter initialEntries={['/t']}>
        <PwaUpdatePrompt />
      </MemoryRouter>
    )

    expect(registerSWMock).toHaveBeenCalledWith(expect.objectContaining({ immediate: true }))
    const options = registerSWMock.mock.calls[0]?.[0]
    expect(options).toBeDefined()
    options?.onNeedRefresh?.()
    expect(screen.queryByText(/Nova versao disponivel/i)).toBeNull()
  })
})
