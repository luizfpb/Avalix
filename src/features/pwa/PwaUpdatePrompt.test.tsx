// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PwaUpdatePrompt } from './PwaUpdatePrompt'

type RegisterOptions = {
  immediate?: boolean
  onNeedRefresh?: () => void
}

const { registerSWMock, updateSWMock, verifyMock } = vi.hoisted(() => {
  const updateSWMock = vi.fn(async (_reload?: boolean) => {})
  return {
    updateSWMock,
    registerSWMock: vi.fn((_options: RegisterOptions) => updateSWMock),
    verifyMock: vi.fn(async () => true),
  }
})

vi.mock('virtual:pwa-register', () => ({ registerSW: registerSWMock }))
vi.mock('./updateCheck', async (original) => ({
  ...(await original<typeof import('./updateCheck')>()),
  verifyPublishedShell: verifyMock,
}))

function abrir(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <PwaUpdatePrompt />
    </MemoryRouter>
  )
  const options = registerSWMock.mock.calls.at(-1)?.[0]
  expect(options).toBeDefined()
  return options!
}

beforeEach(() => {
  sessionStorage.clear()
  verifyMock.mockResolvedValue(true)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('registro do service worker', () => {
  it('registra silenciosamente na pagina publica do treino', () => {
    const options = abrir('/t')
    expect(registerSWMock).toHaveBeenCalledWith(expect.objectContaining({ immediate: true }))
    options.onNeedRefresh?.()
    expect(screen.queryByText(/Nova versão disponível/i)).toBeNull()
  })
})

describe('versão nova na página do aluno', () => {
  it('aplica ao abrir, antes de qualquer toque, para a correção chegar ao aparelho', async () => {
    const options = abrir('/t')
    await act(async () => { options.onNeedRefresh?.() })
    expect(verifyMock).toHaveBeenCalled()
    expect(updateSWMock).toHaveBeenCalledWith(true)
  })

  it('não recarrega depois que a pessoa começou a mexer', async () => {
    const options = abrir('/a')
    fireEvent.pointerDown(window)
    await act(async () => { options.onNeedRefresh?.() })
    expect(updateSWMock).not.toHaveBeenCalled()
  })

  it('não recarrega no meio do treino quando a versão nova chega depois de aberto', async () => {
    vi.useFakeTimers()
    const options = abrir('/t')
    vi.advanceTimersByTime(11_000)
    await act(async () => { options.onNeedRefresh?.() })
    expect(updateSWMock).not.toHaveBeenCalled()
  })

  it('não entra em ciclo de recarga nem aplica uma publicação incompleta', async () => {
    let options = abrir('/t')
    await act(async () => { options.onNeedRefresh?.() })
    expect(updateSWMock).toHaveBeenCalledOnce()
    cleanup()
    options = abrir('/t')
    await act(async () => { options.onNeedRefresh?.() })
    expect(updateSWMock).toHaveBeenCalledOnce()

    sessionStorage.clear()
    verifyMock.mockResolvedValue(false)
    cleanup()
    options = abrir('/t')
    await act(async () => { options.onNeedRefresh?.() })
    expect(updateSWMock).toHaveBeenCalledOnce()
  })

  it('na área do profissional continua perguntando antes de atualizar', async () => {
    const options = abrir('/dashboard')
    await act(async () => { options.onNeedRefresh?.() })
    expect(await screen.findByText('Nova versão disponível')).toBeTruthy()
    expect(updateSWMock).not.toHaveBeenCalled()
  })
})
