import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { getIntakeByToken, submitIntake } from '../features/anamnesis/intake'
import { emptyAnamnesis, PARQ_ITEMS, type AnamnesisAnswers } from '../features/anamnesis/spec'
import { AnamneseCamadaA, AnamneseCamadaB } from '../features/anamnesis/AnamneseForm'
import { consentText } from '../features/consent/text'
import type { SignerKind } from '../features/consent/api'
import { BrandMark } from '../components/BrandLogo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { controlClass } from '@/lib/ui'
import { normalizeDbError } from '../lib/errors'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8">{children}</div>
    </div>
  )
}

export default function AnamnesePublica() {
  const { token } = useParams()
  const query = useQuery({
    queryKey: ['public-intake', token],
    queryFn: () => getIntakeByToken(token as string),
    enabled: !!token,
    retry: false,
  })

  if (query.isPending) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </Shell>
    )
  }

  if (query.isError || !query.data) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <BrandMark size={40} />
          <h1 className="text-xl font-semibold">Link inválido ou expirado</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Este link não é mais válido. Peça um novo ao seu profissional.
          </p>
        </div>
      </Shell>
    )
  }

  return <Form token={token as string} intake={query.data} />
}

function Form({
  token,
  intake,
}: {
  token: string
  intake: NonNullable<Awaited<ReturnType<typeof getIntakeByToken>>>
}) {
  const [a, setA] = useState<AnamnesisAnswers>(emptyAnamnesis)
  const [signerKind, setSignerKind] = useState<SignerKind>('titular')
  const [signerName, setSignerName] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [showTerm, setShowTerm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const term = useMemo(() => consentText(intake.orgName), [intake.orgName])

  function set(patch: Partial<AnamnesisAnswers>) {
    setA((prev) => ({ ...prev, ...patch }))
  }

  const parqComplete = PARQ_ITEMS.every((i) => a.parq[i.key] !== null)
  const canSubmit = parqComplete && signerName.trim().length >= 3 && accepted

  const submit = useMutation({
    mutationFn: () =>
      submitIntake({
        token,
        orgName: intake.orgName,
        answers: { ...a, declaracao_veracidade: true, consentimento_lgpd: true },
        signerKind,
        signerName,
      }),
  })

  async function handleSubmit() {
    setError(null)
    if (!parqComplete) return setError('Responda todos os itens da triagem inicial.')
    if (signerName.trim().length < 3) return setError('Preencha o nome de quem está aceitando o termo.')
    if (!accepted) return setError('É preciso aceitar o termo de consentimento para enviar.')
    try {
      await submit.mutateAsync()
    } catch (e) {
      setError(normalizeDbError(e))
    }
  }

  if (submit.isSuccess) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <CheckCircle2 className="size-12 text-success" />
          <h1 className="text-xl font-semibold">Recebido!</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Suas respostas foram enviadas. {intake.orgName} vai revisar. Você já pode fechar esta
            página.
          </p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="space-y-6">
        <header className="flex items-center gap-3 border-b pb-4">
          <BrandMark size={36} />
          <div className="min-w-0">
            <p className="truncate text-sm text-muted-foreground">{intake.orgName}</p>
            <h1 className="text-xl font-semibold tracking-tight">Anamnese</h1>
          </div>
        </header>

        <p className="text-sm text-muted-foreground">
          Olá, {intake.subjectFirstName}. Responda com sinceridade — leva alguns minutos. Isto é uma
          triagem de segurança e não substitui avaliação médica.
        </p>

        <AnamneseCamadaA a={a} set={set} />
        <AnamneseCamadaB a={a} set={set} isFemale={intake.subjectSex === 'F'} />

        {/* consentimento dado pelo proprio aluno */}
        <Card>
          <CardContent className="space-y-4 py-4 text-sm">
            <div>
              <h2 className="text-base font-semibold">Consentimento</h2>
              <p className="mt-1 text-muted-foreground">
                Seus dados de saúde são sensíveis. Leia e aceite o termo para enviar.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowTerm((v) => !v)}
              className="text-primary underline-offset-4 hover:underline"
            >
              {showTerm ? 'Ocultar termo' : 'Ler o termo de consentimento'}
            </button>
            {showTerm ? (
              <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
                {term}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Quem está respondendo</Label>
                <select
                  value={signerKind}
                  onChange={(e) => setSignerKind(e.target.value as SignerKind)}
                  className={controlClass}
                >
                  <option value="titular">Eu mesmo(a)</option>
                  <option value="responsavel">Responsável legal (menor de idade)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Nome completo de quem aceita</Label>
                <Input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Nome completo"
                />
              </div>
            </div>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              <span>
                Declaro que li e aceito o termo de consentimento e que as informações que forneci são
                verdadeiras.
              </span>
            </label>
          </CardContent>
        </Card>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button className="w-full" onClick={handleSubmit} disabled={!canSubmit || submit.isPending}>
          {submit.isPending ? 'Enviando...' : 'Enviar respostas'}
        </Button>
        <p className="pb-8 text-center text-xs text-muted-foreground">
          Ao enviar, guardamos a versão do termo, quem aceitou e quando.
        </p>
      </div>
    </Shell>
  )
}
