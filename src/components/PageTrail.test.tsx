// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { PageTrail } from './PageTrail'

afterEach(cleanup)

function renderTrail() {
  return render(
    <MemoryRouter>
      <PageTrail
        steps={[
          { label: 'Alunos', to: '/avaliados' },
          { label: 'Maria Silva', to: '/avaliados/s1' },
        ]}
        current="Avaliação de 12/10/2026"
      />
    </MemoryRouter>
  )
}

describe('PageTrail', () => {
  it('cada nível é um link para o destino, uma vez só, e a página atual fica marcada', () => {
    renderTrail()
    const nav = screen.getByRole('navigation', { name: 'Navegação' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Alunos', '/avaliados'],
      ['Maria Silva', '/avaliados/s1'],
    ])
    expect(within(nav).getByText('Avaliação de 12/10/2026').getAttribute('aria-current')).toBe('page')
    // nenhuma seta de texto: os ícones são do lucide e ficam fora do nome acessível
    expect(nav.textContent).not.toMatch(/[←‹]/)
  })

  it('no celular só o nível de cima aparece; o resto é da trilha do computador', () => {
    renderTrail()
    const itens = within(screen.getByRole('navigation')).getAllByRole('listitem')
    expect(itens[0].className).toMatch(/\bhidden\b.*\blg:flex\b/)
    expect(itens[1].className).not.toMatch(/\bhidden\b/)
    expect(itens[2].className).toMatch(/\bhidden\b.*\blg:block\b/)
  })
})
