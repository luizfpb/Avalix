import { createContext, useContext } from 'react'

export type Theme = 'light' | 'dark' | 'system'

export type ThemeContextValue = {
  theme: Theme
  setTheme: (t: Theme) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const v = useContext(ThemeContext)
  if (!v) throw new Error('useTheme deve ser usado dentro de ThemeProvider')
  return v
}
