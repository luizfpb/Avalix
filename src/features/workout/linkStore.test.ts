import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  clearAllWorkoutLinksLocal,
  clearWorkoutLinkLocal,
  loadWorkoutLinkLocal,
  saveWorkoutLinkLocal,
  setWorkoutLinkScope,
} from './linkStore'

const TOKEN = 'B'.repeat(43)
const URL_OK = `https://app.local/t#${TOKEN}`
const DAQUI_A_UM_MES = new Date(Date.now() + 30 * 86_400_000).toISOString()

function localStorageFake() {
  const dados = new Map<string, string>()
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
    clear: () => dados.clear(),
    key: (i: number) => [...dados.keys()][i] ?? null,
    get length() {
      return dados.size
    },
  } as unknown as Storage
}

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageFake())
  vi.stubGlobal('location', { origin: 'https://app.local' })
  setWorkoutLinkScope('user-a', 'org-a')
})

describe('linkStore do treino', () => {
  it('guarda e devolve o link do aparelho que o emitiu', () => {
    saveWorkoutLinkLocal('subj-1', URL_OK, DAQUI_A_UM_MES)
    expect(loadWorkoutLinkLocal('subj-1')).toBe(URL_OK)
  })

  it('isola por usuário e por organização', () => {
    saveWorkoutLinkLocal('subj-1', URL_OK, DAQUI_A_UM_MES)
    setWorkoutLinkScope('user-b', 'org-a')
    expect(loadWorkoutLinkLocal('subj-1')).toBeNull()
    setWorkoutLinkScope('user-a', 'org-b')
    expect(loadWorkoutLinkLocal('subj-1')).toBeNull()
    setWorkoutLinkScope('user-a', 'org-a')
    expect(loadWorkoutLinkLocal('subj-1')).toBe(URL_OK)
  })

  it('sem escopo definido não guarda nada', () => {
    setWorkoutLinkScope(null, null)
    saveWorkoutLinkLocal('subj-1', URL_OK, DAQUI_A_UM_MES)
    expect(loadWorkoutLinkLocal('subj-1')).toBeNull()
  })

  it('recusa URL de outra origem', () => {
    // uma entrada adulterada no localStorage não pode virar link para outro
    // domínio no botão de compartilhar
    saveWorkoutLinkLocal('subj-1', `https://malicioso.example/t#${TOKEN}`, DAQUI_A_UM_MES)
    expect(loadWorkoutLinkLocal('subj-1')).toBeNull()
  })

  it('recusa URL sem token válido no fragmento', () => {
    saveWorkoutLinkLocal('subj-1', 'https://app.local/t#curto', DAQUI_A_UM_MES)
    expect(loadWorkoutLinkLocal('subj-1')).toBeNull()
  })

  it('recusa link já expirado', () => {
    const ontem = new Date(Date.now() - 86_400_000).toISOString()
    saveWorkoutLinkLocal('subj-1', URL_OK, ontem)
    expect(loadWorkoutLinkLocal('subj-1')).toBeNull()
  })

  it('revogar apaga a cópia local', () => {
    saveWorkoutLinkLocal('subj-1', URL_OK, DAQUI_A_UM_MES)
    clearWorkoutLinkLocal('subj-1')
    expect(loadWorkoutLinkLocal('subj-1')).toBeNull()
  })

  it('logout apaga todos os links e zera o escopo', () => {
    saveWorkoutLinkLocal('subj-1', URL_OK, DAQUI_A_UM_MES)
    saveWorkoutLinkLocal('subj-2', URL_OK, DAQUI_A_UM_MES)
    clearAllWorkoutLinksLocal()
    setWorkoutLinkScope('user-a', 'org-a')
    expect(loadWorkoutLinkLocal('subj-1')).toBeNull()
    expect(loadWorkoutLinkLocal('subj-2')).toBeNull()
  })
})
