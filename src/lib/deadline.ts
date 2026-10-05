// Prazo das chamadas feitas pelas páginas públicas (treino e anamnese do
// aluno). Wi-Fi de academia e 4G no subsolo deixam a requisição pendurada por
// minutos, com a tela travada em "Enviando...". Estourado o prazo, a chamada
// falha como falta de rede, e a tela oferece tentar de novo.
export const READ_TIMEOUT_MS = 15_000
export const WRITE_TIMEOUT_MS = 20_000

export function deadline(ms: number): AbortSignal {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}
