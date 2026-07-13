// Aplica o tema antes do React montar para evitar flash. Arquivo externo para
// permitir uma Content-Security-Policy sem script inline.
try {
  const theme = localStorage.getItem('theme') || 'dark'
  const dark =
    theme === 'dark' ||
    (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
} catch {
  // Preferência visual indisponível: o HTML já nasce no tema escuro.
}
