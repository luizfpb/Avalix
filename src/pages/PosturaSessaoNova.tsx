import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useOrganization } from '../features/organization/context'
import { useSubject } from '../features/subjects/hooks'
import { useActiveConsent } from '../features/consent/hooks'
import { useCreateSession } from '../features/posture/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { controlClass } from '@/lib/ui'
import { normalizeDbError } from '../lib/errors'

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

export default function PosturaSessaoNova() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { organization } = useOrganization()
  const subjectQuery = useSubject(id)
  const consentQuery = useActiveConsent(id)
  const createMut = useCreateSession(id)
  const [takenAt, setTakenAt] = useState(todayLocal)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (subjectQuery.isPending || consentQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }
  if (!consentQuery.data) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="text-xl font-semibold">Nova sessão postural</h1>
        <p className="text-sm text-muted-foreground">
          É preciso registrar o consentimento do avaliado antes de coletar fotos.
        </p>
        <Button asChild variant="outline">
          <Link to={`/avaliados/${id}`}>Ir para o cadastro e registrar</Link>
        </Button>
      </div>
    )
  }

  async function handleCreate() {
    if (!organization || !id) return
    setError(null)
    try {
      const session = await createMut.mutateAsync({
        orgId: organization.id,
        subjectId: id,
        takenAt,
        notes: notes.trim() || null,
      })
      navigate(`/avaliados/${id}/postural/${session.id}`)
    } catch (e) {
      setError(normalizeDbError(e))
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link to={`/avaliados/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← {subjectQuery.data?.full_name ?? 'Voltar'}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Nova sessão postural</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Crie a sessão e depois adicione as fotos.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Data</Label>
          <Input type="date" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Observações (opcional)</Label>
          <textarea
            rows={3}
            className={controlClass}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex gap-3">
          <Button onClick={handleCreate} disabled={createMut.isPending}>
            {createMut.isPending ? 'Criando...' : 'Criar sessão'}
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/avaliados/${id}`}>Cancelar</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
