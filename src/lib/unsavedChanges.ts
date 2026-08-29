import { useCallback, useEffect, useRef } from 'react'
import { useBlocker, type BlockerFunction } from 'react-router'

// Guarda de saída dos formulários longos: sair de um mesociclo ou de uma
// avaliação pela metade não pode ser silencioso.
//
// O rascunho do `lib/draft` já impedia a perda por reload, mas só o reload. Sair
// pelo "Cancelar", pelo link do avaliado ou pelo Voltar do Android é navegação
// interna do router, e o rascunho de um formulário que o usuário abandonou não
// se anuncia sozinho na próxima vez — ele volta como surpresa ou não volta.
// Aqui a pergunta acontece na hora em que ainda dá para desistir.
//
// Duas saídas, dois mecanismos, porque nenhum cobre a outra:
// - navegação dentro do app: `useBlocker` do router (exige data router, que é o
//   caso desde o main.tsx com createBrowserRouter);
// - fechar a aba, recarregar ou ir para outro site: `beforeunload`, cujo texto é
//   do navegador e não dá para customizar.
export type UnsavedChangesGuard = {
  // navegação interna interceptada, esperando a resposta do usuário
  blocked: boolean
  // sai e descarta (o rascunho local continua guardado para a próxima abertura)
  leave: () => void
  // fica onde estava
  stay: () => void
  // Libera a PRÓXIMA navegação sem perguntar. Chamado logo antes do navigate()
  // que sucede um salvamento: nesse instante `dirty` ainda pode estar true, e
  // perguntar "descartar alterações?" depois de salvar seria absurdo. É um ref
  // de propósito — o router chama a condição durante a navegação, antes de um
  // novo render entregar um `dirty` atualizado.
  allowNext: () => void
}

export function useUnsavedChanges(dirty: boolean): UnsavedChangesGuard {
  const bypass = useRef(false)

  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) => {
      if (bypass.current) return false
      // troca de query/hash na mesma tela não é sair do formulário
      return dirty && currentLocation.pathname !== nextLocation.pathname
    },
    [dirty]
  )
  const blocker = useBlocker(shouldBlock)

  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      // preventDefault é o contrato atual; returnValue segue para os navegadores
      // que ainda exigem o campo preenchido para exibir o aviso.
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  return {
    blocked: blocker.state === 'blocked',
    leave: () => blocker.proceed?.(),
    stay: () => blocker.reset?.(),
    allowNext: () => {
      bypass.current = true
    },
  }
}
