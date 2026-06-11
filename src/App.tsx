import { useQuery } from "@tanstack/react-query"
import { Route, Routes } from "react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase, supabaseEnvOk } from "@/lib/supabase"

// Smoke test provisorio da Etapa 3.1: qualquer resposta HTTP da API prova URL e chave.
// "subjects" vem do schema da Etapa 2; se o gen types acusar outro nome, ajuste aqui.
async function checarSupabase(): Promise<string> {
  const { error } = await supabase.from("subjects").select("id").limit(1)
  if (!error) return "API ok; select anonimo liberado (lista vazia esperada)"
  const msg = error.message
  if (/api key|invalid key/i.test(msg)) {
    throw new Error("chave invalida; confira VITE_SUPABASE_PUBLISHABLE_KEY no .env.local")
  }
  if (/failed to fetch|fetch failed|networkerror|load failed/i.test(msg)) {
    throw new Error("rede: URL do Supabase inacessivel; confira VITE_SUPABASE_URL no .env.local")
  }
  // Bloqueio por RLS/grants sem sessao tambem e sucesso: a API respondeu.
  return "API ok; acesso anonimo bloqueado como esperado (" + msg + ")"
}

function StatusPage() {
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: ["status-supabase"],
    queryFn: checarSupabase,
    enabled: supabaseEnvOk,
    retry: false,
  })

  const linhaSupabase = !supabaseEnvOk
    ? "aguardando .env.local"
    : isFetching
      ? "testando..."
      : error
        ? "erro: " + error.message
        : (data ?? "...")

  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>BodyTrack: setup (Etapa 3.1)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>Vite + React + Tailwind + shadcn/ui: ok (esta pagina renderizou).</p>
          <p>
            Env:{" "}
            {supabaseEnvOk
              ? "ok (VITE_SUPABASE_* carregadas)"
              : "ausente; crie .env.local a partir do .env.example e reinicie o npm run dev"}
          </p>
          <p>Supabase: {linhaSupabase}</p>
          <Button onClick={() => refetch()} disabled={!supabaseEnvOk || isFetching}>
            Testar conexao de novo
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<StatusPage />} />
    </Routes>
  )
}
