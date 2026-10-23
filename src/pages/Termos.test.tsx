// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Termos from './Termos'
import { PROVIDER, TERMS_SECTIONS } from '../features/legal/terms'

afterEach(cleanup)

describe('Termos de Uso', () => {
  it('mostra todas as cláusulas e o contato', () => {
    render(
      <MemoryRouter>
        <Termos />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Termos de Uso' })).toBeTruthy()
    for (const section of TERMS_SECTIONS) {
      expect(screen.getByRole('heading', { level: 2, name: section.title })).toBeTruthy()
    }
    expect(screen.getByRole('link', { name: PROVIDER.email }).getAttribute('href')).toBe(`mailto:${PROVIDER.email}`)
  })

  it('não mostra rótulo de CPF enquanto o documento não foi preenchido', () => {
    render(
      <MemoryRouter>
        <Termos />
      </MemoryRouter>
    )
    if (!PROVIDER.document) expect(screen.queryByText(/CPF\/CNPJ/)).toBeNull()
  })

  // Cláusula 5 contra a regra do banco (0049/0052, suíte pgTAP da 0052): no só
  // leitura o profissional corrige o CADASTRO do aluno, inativa, revoga e
  // exclui; avaliação, anamnese, sessão postural, agendamento e sessão de
  // treino ficam travados. O texto prometia "corrigindo seus dados".
  it('a cláusula do só leitura não promete corrigir o que o banco trava', () => {
    const clausula = TERMS_SECTIONS.find((s) => s.title.startsWith('5.'))!.paragraphs.join(' ')
    expect(clausula).not.toMatch(/corrigindo seus dados/)
    expect(clausula).toMatch(/corrigir o cadastro/)
    expect(clausula).toMatch(/excluir/)
  })
})

