// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Configuracoes from './Configuracoes'

const { refreshMock, signedLogoUrlMock, uploadOrgLogoMock, updateMock, eqMock } = vi.hoisted(() => ({
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
  useTheme: () => ({ theme: 'system', setTheme: vi.fn() }),
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
            return { select: async () => ({ data: [{ id: 'org-1' }], error: null }) }
          },
        }
      },
    }),
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
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
