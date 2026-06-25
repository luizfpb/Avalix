// Demonstração de exercício SEM custo: a decisão de produto é "só se gratuito"
// — nada de hospedar mídia (storage/banda) nem API paga de biblioteca de
// vídeos. Em vez disso, geramos um link de BUSCA de vídeo pelo nome do
// exercício: o profissional abre, escolhe a melhor demonstração e, se quiser,
// manda o link pro aluno. Zero armazenamento, zero licença, sempre atualizado.

// Foca o resultado em vídeos de técnica em pt-BR.
export function exerciseDemoQuery(name: string): string {
  return `${name.trim()} execução do exercício`
}

// Busca no YouTube (vídeo é o formato que importa pra conferir a execução).
export function exerciseDemoUrl(name: string): string {
  const q = encodeURIComponent(exerciseDemoQuery(name))
  return `https://www.youtube.com/results?search_query=${q}`
}
