// O Safari inicia o download do blob depois do clique, de forma assíncrona:
// revogar a URL logo em seguida cancelava o arquivo (PDF em branco ou nenhum
// download). A URL fica viva por um minuto, o bastante para ele ler o blob.
const REVOKE_AFTER_MS = 60_000

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}

// BOM UTF-8 pra o Excel reconhecer os acentos do CSV.
const BOM = String.fromCharCode(0xfeff)

export function csvBlob(csv: string): Blob {
  return new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' })
}
