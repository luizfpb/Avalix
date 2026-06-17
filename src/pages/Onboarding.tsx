import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { normalizeAuthError } from '../lib/errors'
import { useAuth } from '../features/auth/context'
import { useOrganization } from '../features/organization/context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const SUBJECT_TERMS = [
  { value: 'aluno', label: 'Aluno' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'paciente', label: 'Paciente' },
  { value: 'atleta', label: 'Atleta' },
  { value: 'avaliado', label: 'Avaliado' },
] as const

export default function Onboarding() {
  const { signOut } = useAuth()
  const { refresh } = useOrganization()
  const [nome, setNome] = useState('')
  const [termo, setTermo] = useState<string>('aluno')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    // ATENÇÃO (Ponto 2): nomes dos parâmetros devem bater com a função no banco.
    const { data: orgId, error } = await supabase.rpc('create_organization', {
      p_name: nome.trim(),
    })
    if (error) {
      setLoading(false)
      setError(normalizeAuthError(error))
      return
    }
    // A RPC cria a org com subject_term padrão. Aqui gravamos o termo escolhido.
    if (orgId) {
      const { error: termErr } = await supabase
        .from('organizations')
        .update({ subject_term: termo })
        .eq('id', orgId)
      if (termErr) {
        // Não bloqueia: a org já foi criada. Só avisa no console.
        console.warn('Não foi possível salvar o termo:', termErr.message)
      }
    }
    await refresh() // recarrega a org -> o RouteGuard manda pro dashboard
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 grid size-12 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">
            B
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Quase lá</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Crie sua organização para começar a usar o BodyTrack.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome da organização ou profissional</Label>
            <Input
              id="nome"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Estúdio Corpo & Movimento"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="termo">Como você chama quem é avaliado?</Label>
            <select
              id="termo"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {SUBJECT_TERMS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Esse termo aparece nas telas do app (ex.: lista de {termo}s).
            </p>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button
            type="submit"
            className="w-full"
            disabled={loading || nome.trim().length === 0}
          >
            {loading ? 'Criando...' : 'Criar organização'}
          </Button>
        </form>
        <button
          onClick={() => signOut()}
          className="mt-4 block w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Sair
        </button>
      </div>
    </div>
  )
}
