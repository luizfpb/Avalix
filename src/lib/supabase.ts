import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY não encontradas. ' +
      'Confira o arquivo .env.local na raiz do projeto.'
  )
}

const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
export const SUPABASE_AUTH_STORAGE_KEY = `sb-${projectRef}-auth-token`

export function clearPersistedAuthSession(): void {
  try {
    localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY)
    localStorage.removeItem(`${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`)
  } catch {
    // O estado React ainda e encerrado; storage indisponivel nao pode reabrir UI.
  }
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: { storageKey: SUPABASE_AUTH_STORAGE_KEY },
})
