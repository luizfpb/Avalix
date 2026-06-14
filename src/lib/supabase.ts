import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não encontradas. ' +
      'Confira o arquivo .env.local na raiz do projeto.'
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
