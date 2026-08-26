import { useState } from 'react'
import { Copy, MessageCircle, Link2, Link2Off } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { normalizeDbError } from '../../lib/errors'
import { useIssueWorkoutLink, useRevokeWorkoutLink, useWorkoutLink } from './hooks'
import { loadWorkoutLinkLocal } from './linkStore'

function dataBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

function desde(iso: string | null): string | null {
  if (!iso) return null
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (!Number.isFinite(dias)) return null
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  return `há ${dias} dias`
}

// Link do aluno para o treino: emitir, reexibir e revogar.
//
// O segredo só existe no aparelho que emitiu (mesma regra do convite de
// anamnese) — mas aqui perder o link não custa nada, porque as sessões
// pertencem ao plano e não ao token: reemitir é sempre seguro.
export function WorkoutLinkCard({
  subjectId,
  subjectName,
  orgName,
}: {
  subjectId: string
  subjectName: string
  orgName: string
}) {
  const linkQuery = useWorkoutLink(subjectId)
  const issue = useIssueWorkoutLink(subjectId)
  const revoke = useRevokeWorkoutLink(subjectId)
  const [urlRecente, setUrlRecente] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  const link = linkQuery.data ?? null
  const url = urlRecente ?? (link ? loadWorkoutLinkLocal(subjectId) : null)
  const primeiroNome = subjectName.split(' ')[0] || subjectName

  const mensagem =
    `${orgName ? `${orgName}: ` : ''}${primeiroNome}, este é o seu treino. ` +
    'Abra pelo link, marque as séries conforme for fazendo e salve no fim — funciona até sem internet.'

  async function emitir() {
    setErro(null)
    setCopiado(false)
    try {
      const { url: nova } = await issue.mutateAsync()
      setUrlRecente(nova)
    } catch (e) {
      setErro(normalizeDbError(e))
    }
  }

  async function copiar() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
    } catch {
      // clipboard bloqueado: o botão segue clicável e o link está à vista
    }
  }

  return (
    <Card>
      <CardContent className="space-y-2.5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Link do treino para o aluno</p>
            <p className="text-xs text-muted-foreground">
              O aluno abre sem login, vê o treino vigente e marca as séries. Um link por aluno.
            </p>
          </div>
          {link ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setConfirmando(true)}
              disabled={revoke.isPending}
            >
              <Link2Off /> Revogar
            </Button>
          ) : null}
        </div>

        {linkQuery.isPending ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : link ? (
          <>
            <p className="text-xs text-muted-foreground">
              Ativo até {dataBr(link.expires_at)}
              {link.last_seen_at ? ` · aluno abriu ${desde(link.last_seen_at)}` : ' · ainda não aberto'}
              {link.sessions_count > 0
                ? ` · ${link.sessions_count} ${link.sessions_count === 1 ? 'treino registrado' : 'treinos registrados'}`
                : ''}
            </p>

            {url ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Button size="xs" variant="outline" onClick={() => void copiar()}>
                  <Copy /> {copiado ? 'Copiado!' : 'Copiar link'}
                </Button>
                <Button size="xs" variant="outline" asChild>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`${mensagem} ${url}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle /> WhatsApp
                  </a>
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                O endereço fica salvo só no aparelho onde o link foi gerado. Para enviá-lo daqui,
                emita um novo — o histórico do aluno não se perde.
              </p>
            )}

            <Button size="xs" variant="ghost" onClick={() => void emitir()} disabled={issue.isPending}>
              <Link2 /> {issue.isPending ? 'Emitindo...' : 'Emitir novo link'}
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => void emitir()} disabled={issue.isPending}>
            <Link2 /> {issue.isPending ? 'Emitindo...' : 'Emitir link do treino'}
          </Button>
        )}

        {erro ? (
          <p role="alert" className="text-xs text-destructive">
            {erro}
          </p>
        ) : null}
      </CardContent>

      <ConfirmDialog
        open={confirmando}
        title="Revogar o link do aluno?"
        description="O link atual para de funcionar imediatamente. Os treinos já registrados continuam no histórico, e você pode emitir um novo link quando quiser."
        onConfirm={() => {
          setConfirmando(false)
          if (link) {
            revoke.mutate(link.id, { onError: (e) => setErro(normalizeDbError(e)) })
            setUrlRecente(null)
          }
        }}
        onCancel={() => setConfirmando(false)}
      />
    </Card>
  )
}
