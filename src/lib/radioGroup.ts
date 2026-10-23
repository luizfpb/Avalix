import type { KeyboardEvent } from 'react'

// Grupo de botões com role="radio": o leitor de tela anuncia "botão de opção,
// 1 de 3" e quem usa teclado espera o padrão do ARIA. As setas (e Home/End)
// trocam a opção marcada e levam o foco junto; o Tab entra e sai do grupo de
// uma vez, porque só a opção marcada fica na ordem do Tab (radioTabIndex).
export function radioTabIndex(checked: boolean): 0 | -1 {
  return checked ? 0 : -1
}

export function onRadioKeyDown<T extends string>(
  event: KeyboardEvent<HTMLElement>,
  values: readonly T[],
  current: T,
  select: (value: T) => void
): void {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
  const from = values.indexOf(current)
  let next: number
  if (step !== undefined) next = (Math.max(from, 0) + step + values.length) % values.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = values.length - 1
  else return
  event.preventDefault()
  select(values[next])
  const group = event.currentTarget.closest('[role="radiogroup"]')
  group?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus()
}
