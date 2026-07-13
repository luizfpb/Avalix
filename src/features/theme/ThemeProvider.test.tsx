/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTheme } from './context'
import { ThemeProvider } from './ThemeProvider'

function ThemeProbe() {
  const { theme, setTheme } = useTheme()
  return (
    <button type="button" onClick={() => setTheme('light')}>
      {theme}
    </button>
  )
}

describe('ThemeProvider', () => {
  afterEach(() => vi.restoreAllMocks())

  it('continua funcional quando o localStorage está bloqueado', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('storage blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('storage blocked', 'SecurityError')
    })

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    )

    const button = screen.getByRole('button', { name: 'dark' })
    fireEvent.click(button)
    expect(button.textContent).toBe('light')
  })
})
