import { createContext, useContext } from 'react'

// Estado de só leitura calculado uma vez pelo AppShell (ReadOnlyGate) e lido
// pelos avisos dentro das telas. Fora do AppShell vale o padrão: liberado.
export type ReadOnlyState = { readOnly: boolean; canManage: boolean }

export const ReadOnlyContext = createContext<ReadOnlyState>({ readOnly: false, canManage: false })

export function useReadOnlyState(): ReadOnlyState {
  return useContext(ReadOnlyContext)
}
