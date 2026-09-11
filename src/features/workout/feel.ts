import { Frown, Meh, Smile } from 'lucide-react'

// Como o aluno disse que foi o treino. Os números são os da coluna `feel`
// (0038): 1 difícil, 2 normal, 3 bem. Três opções, e não cinco ou dez — a
// pergunta tem que caber num toque entre guardar a anilha e sair da academia.
//
// Rótulos e ícones moram aqui porque quem responde (tela do aluno) e quem lê
// (histórico do aluno, sessões na tela do profissional) precisam dizer a mesma
// coisa: "Foi difícil" virando "pesado" na outra ponta já seria outro dado.
export const FEEL_OPTIONS = [
  { value: 1, label: 'Foi difícil', icon: Frown },
  { value: 2, label: 'Normal', icon: Meh },
  { value: 3, label: 'Foi bem', icon: Smile },
] as const

export function feelOption(feel: number | null | undefined) {
  return FEEL_OPTIONS.find((o) => o.value === feel) ?? null
}
