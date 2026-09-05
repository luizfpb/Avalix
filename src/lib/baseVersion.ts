import { useCallback, useState } from 'react'

// A VERSÃO-BASE de um editor: o carimbo (`updated_at`) do registro com que a
// tela abriu, congelado enquanto ela estiver aberta.
//
// Por que isto existe. A concorrência otimista da 0023 recusa uma gravação
// quando o `updated_at` informado pelo cliente não é mais o da linha — é o que
// impede a aba antiga do PC de apagar em silêncio o que foi salvo pelo celular.
// Só que as telas liam esse carimbo direto do resultado da query, e o React
// Query REVALIDA por foco/reconexão. O valor do formulário fica no estado
// inicial (não acompanha o refetch), mas o carimbo acompanhava: a tela passava
// a mandar a versão NOVA junto com os valores VELHOS, e o guard do banco
// deixava de reconhecer a edição defasada. A proteção existia e se
// autodesarmava exatamente no cenário para o qual foi escrita.
//
// Congelar a base também conserta a chave do rascunho, que carrega a mesma
// versão: sem isto ela mudava no meio da edição e o rascunho já gravado ficava
// órfão.
//
// `conflict` é a outra metade: alteração externa vira aviso explícito na tela,
// e não uma recusa surpresa só na hora de salvar.

export type BaseVersion = {
  /** carimbo com que o editor abriu; é este que vai para o guard do banco */
  base: string | null
  /** o servidor já está numa versão diferente da que este editor carregou */
  conflict: boolean
  /** adota uma versão nova como base (usar depois de gravar com sucesso) */
  adopt: (version: string | null | undefined) => void
}

export function useBaseVersion(current: string | null | undefined): BaseVersion {
  const [base, setBase] = useState<string | null>(current ?? null)

  // Ajuste de estado durante o render (padrão documentado do React): o editor
  // pode montar antes de a query entregar a primeira versão. Sem base, o
  // comportamento é o antigo — nenhuma versão é enviada e o banco não recusa.
  if (base == null && current != null) setBase(current)

  const adopt = useCallback((version: string | null | undefined) => {
    if (version != null) setBase(version)
  }, [])

  return {
    base,
    conflict: base != null && current != null && current !== base,
    adopt,
  }
}
