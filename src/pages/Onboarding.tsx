import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { normalizeAuthError, normalizeDbError } from '../lib/errors'
import { useAuth } from '../features/auth/context'
import { useOrganization } from '../features/organization/context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BrandLogo } from '../components/BrandLogo'

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
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    let orgId = createdOrgId
    if (!orgId) {
      const result = await supabase.rpc('create_organization', {
        p_name: nome.trim(),
      })
      if (result.error) {
        setLoading(false)
        setError(normalizeAuthError(result.error))
        return
      }
      orgId = result.data
      setCreatedOrgId(orgId)
    }
    // A RPC cria a org com subject_term padrão. Aqui gravamos o termo escolhido.
    if (orgId) {
      const { error: termErr } = await supabase
        .from('organizations')
        .update({ subject_term: termo })
        .eq('id', orgId)
      if (termErr) {
        setLoading(false)
        setError(`A organização foi criada, mas não foi possível salvar o termo escolhido. Tente novamente. ${normalizeDbError(termErr)}`)
        return
      }
    }
    await refresh() // recarrega a org -> o RouteGuard manda pro dashboard
    setLoading(false)
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ backgroundColor: '#2A0E52' }}
    >
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo height={26} className="mb-4 text-[#ECE3FA]" />
          <h1 className="text-xl font-semibold tracking-tight text-[#ECE3FA]">Quase lá</h1>
          <p className="mt-1.5 text-sm text-[#ECE3FA]/70">
            Crie sua organização para começar a usar o Avalix.
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border bg-card p-6 text-card-foreground shadow-xl"
        >
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
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button
            type="submit"
            className="w-full"
            disabled={loading || nome.trim().length === 0}
          >
            {loading ? 'Salvando...' : createdOrgId ? 'Tentar salvar novamente' : 'Criar organização'}
          </Button>
        </form>
        <button
          onClick={() => signOut()}
          className="mt-4 block w-full text-center text-xs text-[#ECE3FA]/60 hover:text-[#ECE3FA]"
        >
          Sair
        </button>
      </div>
    </div>
  )
}
