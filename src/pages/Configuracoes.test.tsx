// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Configuracoes from './Configuracoes'

const { refreshMock, signedLogoUrlMock, uploadOrgLogoMock, updateMock, eqMock, setThemeMock, selectResult } = vi.hoisted(() => ({
  setThemeMock: vi.fn(),
  // a policy de update recusa em silêncio: 0 linhas, sem erro
  selectResult: { rows: [{ id: 'org-1' }] as { id: string }[] },
  refreshMock: vi.fn(async () => {}),
  signedLogoUrlMock: vi.fn(),
  uploadOrgLogoMock: vi.fn(),
  updateMock: vi.fn(),
  eqMock: vi.fn(),
}))

const ORG = {
  id: 'org-1',
  name: 'Estúdio Fit',
  subject_term: 'aluno',
  logo_path: 'org-1/logo.png',
  contact_email: null,
  contact_phone: null,
}

vi.mock('../features/organization/context', () => ({
  useOrganization: () => ({ organization: ORG, role: 'owner', refresh: refreshMock }),
}))

vi.mock('../features/auth/context', () => ({
  useAuth: () => ({ user: { email: 'dono@estudio.test' }, refreshMfa: vi.fn() }),
}))

vi.mock('../features/theme/context', () => ({
  useTheme: () => ({ theme: 'system', setTheme: setThemeMock }),
}))

vi.mock('../features/organization/logo', () => ({
  signedLogoUrl: signedLogoUrlMock,
  uploadOrgLogo: uploadOrgLogoMock,
  removeOrgLogo: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { mfa: { listFactors: async () => ({ data: { all: [] }, error: null }) } },
    from: () => ({
      update: (values: unknown) => {
        updateMock(values)
        return {
          eq: (...args: unknown[]) => {
            eqMock(...args)
            const result = { data: selectResult.rows, error: null }
            return Object.assign(Promise.resolve({ error: null }), { select: async () => result })
          },
        }
      },
    }),
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  selectResult.rows = [{ id: 'org-1' }]
})

function renderPage() {
  return render(
    <MemoryRouter>
      <Configuracoes />
    </MemoryRouter>
  )
}

describe('Ajustes', () => {
  it('trocar o logo por outro do mesmo formato atualiza a prévia', async () => {
    signedLogoUrlMock.mockResolvedValueOnce('https://storage.test/logo.png?token=antigo')
    signedLogoUrlMock.mockResolvedValueOnce('https://storage.test/logo.png?token=novo')
    uploadOrgLogoMock.mockResolvedValue('org-1/logo.png')
    renderPage()
    await waitFor(() =>
      expect(screen.getByAltText('Logo da organização').getAttribute('src')).toContain('token=antigo')
    )

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['png'], 'novo.png', { type: 'image/png' })] } })

    await waitFor(() =>
      expect(screen.getByAltText('Logo da organização').getAttribute('src')).toContain('token=novo')
    )
    expect(uploadOrgLogoMock).toHaveBeenCalledWith('org-1', expect.any(File))
  })

  it('o dono corrige o nome da organização e o termo', async () => {
    signedLogoUrlMock.mockResolvedValue(null)
    renderPage()
    const save = screen.getByRole('button', { name: 'Salvar organização' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Nome da organização'), { target: { value: '  Estúdio Fit Centro ' } })
    fireEvent.change(screen.getByLabelText('Termo usado no app'), { target: { value: 'cliente' } })
    fireEvent.click(save)

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith({ name: 'Estúdio Fit Centro', subject_term: 'cliente' }))
    expect(eqMock).toHaveBeenCalledWith('id', 'org-1')
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('não salva nome vazio', () => {
    signedLogoUrlMock.mockResolvedValue(null)
    renderPage()
    fireEvent.change(screen.getByLabelText('Nome da organização'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar organização' }))
    expect(screen.getByText('Informe o nome da organização.')).toBeTruthy()
    expect(updateMock).not.toHaveBeenCalled()
  })
})

describe('Ajustes: grupo de opções pelo teclado', () => {
  // role="radio" promete o padrão do ARIA: as setas trocam a opção e só a
  // marcada fica na ordem do Tab. Antes as setas não faziam nada.
  it('as setas trocam o tema e levam o foco junto', () => {
    renderPage()
    const grupo = screen.getByRole('radiogroup', { name: 'Tema da interface' })
    const sistema = screen.getByRole('radio', { name: /Sistema/ })
    expect(sistema.getAttribute('tabindex')).toBe('0')
    expect(screen.getByRole('radio', { name: /Claro/ }).getAttribute('tabindex')).toBe('-1')
    sistema.focus()
    fireEvent.keyDown(sistema, { key: 'ArrowRight' })
    expect(setThemeMock).toHaveBeenLastCalledWith('light')
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: /Claro/ }))
    fireEvent.keyDown(sistema, { key: 'ArrowLeft' })
    expect(setThemeMock).toHaveBeenLastCalledWith('dark')
    expect(grupo.contains(document.activeElement)).toBe(true)
  })
})

describe('Ajustes: contato do controlador', () => {
  it('não diz "Contato salvo" quando a policy recusa em silêncio (0 linhas)', async () => {
    selectResult.rows = []
    renderPage()
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'contato@estudio.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Não foi possível salvar/)
    expect(screen.queryByText('Contato salvo.')).toBeNull()
  })

  it('telefone curto demais é recusado na tela, não pelo CHECK do banco em inglês', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Telefone / WhatsApp'), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/entre 8 e 30/)
    expect(updateMock).not.toHaveBeenCalled()
  })
})

describe('Ajustes: envio do logo pelo teclado', () => {
  // O input do logo era sr-only (alcançável), mas o botão visível não mudava
  // com o foco: no Chrome 156, outline none e nenhuma sombra.
  it('o texto visível do botão mostra o foco do input escondido', () => {
    signedLogoUrlMock.mockResolvedValue(null)
    renderPage()
    const input = screen.getByLabelText(/Trocar logo|Enviar logo/) as HTMLInputElement
    expect(input.type).toBe('file')
    expect(input.className).toMatch(/\bpeer\b/)
    expect(input.nextElementSibling?.className).toMatch(/peer-focus-visible:ring/)
  })
})

