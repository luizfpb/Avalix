import { useEffect, useState, type ReactNode } from 'react'
import { ThemeContext, type Theme } from './context'

// Preferência de tema (claro/escuro/sistema). Padrão = escuro. Guardada só no
// localStorage (preferência de UI, dado não sensível). Um script inline no
// index.html já aplica a classe antes do React montar, evitando "flash".
const KEY = 'theme'

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function isDark(t: Theme): boolean {
  return t === 'dark' || (t === 'system' && prefersDark())
}

function apply(t: Theme): void {
  document.documentElement.classList.toggle('dark', isDark(t))
}

function readStored(): Theme {
  const s = localStorage.getItem(KEY)
  return s === 'light' || s === 'dark' || s === 'system' ? s : 'dark'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStored)

  useEffect(() => {
    apply(theme)
  }, [theme])

  // quando em "sistema", acompanha a troca do SO em tempo real
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  function setTheme(t: Theme) {
    localStorage.setItem(KEY, t)
    setThemeState(t)
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}
