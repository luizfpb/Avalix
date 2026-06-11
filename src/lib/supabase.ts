import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// false enquanto o .env.local nao existir; a pagina de status explica o que fazer.
export const supabaseEnvOk = Boolean(url && key)

// Client unico da aplicacao. Sem env, qualquer uso lanca erro claro
// em vez de uma chamada silenciosa para lugar nenhum.
export const supabase: SupabaseClient<Database> = supabaseEnvOk
  ? createClient<Database>(url, key)
  : (new Proxy(
      {},
      {
        get() {
          throw new Error(
            "Supabase sem configuracao: crie .env.local a partir do .env.example e reinicie o dev server",
          )
        },
      },
    ) as SupabaseClient<Database>)
