import { useEffect } from 'react'

// Devolve o foco a quem abriu um <dialog> modal. O navegador só faz isso no
// close(), e os diálogos do app saem da árvore ainda abertos (o componente
// devolve null ou é desmontado pelo pai): no Chrome o foco caía no <body>, e
// quem usa teclado voltava ao topo da página depois de cada confirmação.
//
// Tem de ser chamado ANTES do efeito que faz showModal(), para ler o elemento
// focado antes de o foco entrar no diálogo. Se a ação moveu o foco para outro
// lugar de propósito, ou se quem abriu saiu da tela, não mexe.
export function useReturnFocus(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      const current = document.activeElement
      if (opener?.isConnected && (!current || current === document.body)) opener.focus()
    }
  }, [active])
}
