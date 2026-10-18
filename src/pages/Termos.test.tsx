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
})
