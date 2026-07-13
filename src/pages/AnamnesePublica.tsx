import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2 } from 'lucide-react'
import {
  consumePublicIntakeToken,
  getIntakeByToken,
  intakeDraftFingerprint,
  submitIntake,
} from '../features/anamnesis/intake'
import { emptyAnamnesis, PARQ_ITEMS, type AnamnesisAnswers } from '../features/anamnesis/spec'
import { AnamneseCamadaA, AnamneseCamadaB } from '../features/anamnesis/AnamneseForm'
import { subjectFormSchema, emptySubjectForm, type SubjectFormValues } from '../features/subjects/schema'
import { ageFromBirthDate } from '../lib/age'
import { consentText } from '../features/consent/text'
import type { SignerKind } from '../features/consent/api'
import { BrandMark } from '../components/BrandLogo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { controlClass } from '@/lib/ui'
import { normalizeDbError } from '../lib/errors'
import { clearDraft, useFormDraft } from '../lib/draft'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8">{children}</div>
    </div>
  )
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string
  label: string
  error?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {hint ? <span className="ml-1 text-xs font-normal text-muted-foreground">({hint})</span> : null}
      </Label>
      {children}
      {error ? <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

// Captura o capability token uma unica vez por carga da pagina. O StrictMode
// (dev) chama o initializer do useState duas vezes e um remount reexecutaria a
// captura sobre a URL ja limpa (fragmento removido) devolvendo null; o memo de
// modulo garante idempotencia — o replaceState roda uma vez e o mesmo token
// sobrevive a remounts dentro da mesma carga.
let capturedIntakeToken: string | null | undefined
function captureIntakeTokenOnce(): string | null {
  if (capturedIntakeToken === undefined) {
    capturedIntakeToken = consumePublicIntakeToken()
  }
  return capturedIntakeToken
}

export default function AnamnesePublica() {
  const [token] = useState(captureIntakeTokenOnce)
  const query = useQuery({
    queryKey: ['public-intake', token],
    queryFn: () => getIntakeByToken(token as string),
    enabled: !!token,
    retry: false,
  })

  if (token && query.isPending) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </Shell>
    )
  }

  if (query.isError) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <BrandMark size={40} />
          <h1 className="text-xl font-semibold">Não foi possível verificar o link</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Confira sua conexão e tente novamente. O link não foi descartado.
          </p>
          <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? 'Tentando...' : 'Tentar de novo'}
          </Button>
        </div>
      </Shell>
    )
  }

  if (!token || !query.data) {
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

  return <Form token={token} intake={query.data} />
}

function Form({
  token,
  intake,
}: {
  token: string
  intake: NonNullable<Awaited<ReturnType<typeof getIntakeByToken>>>
}) {
  const isCadastro = intake.kind === 'cadastro_anamnese'

  const [a, setA] = useState<AnamnesisAnswers>(emptyAnamnesis)
  const [signerKind, setSignerKind] = useState<SignerKind>('titular')
  const [signerName, setSignerName] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [showTerm, setShowTerm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // cadastro preenchido pelo proprio aluno (so no link de cadastro); mesmo
  // schema zod do cadastro manual do personal — revalidado de novo no aceite
  const {
    register,
    watch,
    trigger,
    getValues,
    reset,
    formState: { errors },
  } = useForm<SubjectFormValues>({
    resolver: zodResolver(subjectFormSchema),
    defaultValues: emptySubjectForm(),
    mode: 'onTouched',
  })


  const watchedSex = watch('sex')
  const age = ageFromBirthDate(watch('birth_date') ?? '')
  const isMinor = isCadastro && age !== null && age < 18
  // sem avaliado pre-existente, o sexo escolhido no cadastro decide a secao B6
  const isFemale = isCadastro ? watchedSex === 'F' : intake.subjectSex === 'F'

  // menor de idade: quem aceita o termo e o responsavel legal (LGPD)
  useEffect(() => {
    if (isMinor) setSignerKind('responsavel')
  }, [isMinor])

  const term = useMemo(() => consentText(intake.orgName), [intake.orgName])

  function set(patch: Partial<AnamnesisAnswers>) {
    setA((prev) => ({ ...prev, ...patch }))
  }

  const parqComplete = PARQ_ITEMS.every((i) => a.parq[i.key] !== null)
  const canSubmit = parqComplete && signerName.trim().length >= 3 && accepted

  const submit = useMutation({
    mutationFn: (registration: SubjectFormValues | undefined) =>
      submitIntake({
        token,
        orgName: intake.orgName,
        answers: { ...a, declaracao_veracidade: true, consentimento_lgpd: true },
        signerKind,
        signerName,
        registration,
      }),
  })

  // rascunho local (P4): o aluno responde no celular, muitas vezes com sinal
  // ruim — um refresh não pode perder tudo. TTL 24h; limpo no envio (a chave
  // vira null após o sucesso pra o debounce não ressuscitar o rascunho). O
  // aceite do termo NÃO é restaurado (a pessoa reconfirma). A chave usa só um
  // prefixo do token pra não duplicar o segredo inteiro no storage.
  const registrationValues = watch()
  const publicDraftKey = `intake:${intakeDraftFingerprint(token)}`
  const draftKey = submit.isSuccess ? null : publicDraftKey
  const draft = useFormDraft<{
    a: AnamnesisAnswers
    signerKind: SignerKind
    signerName: string
    registration?: SubjectFormValues
  }>(
    draftKey,
    { a, signerKind, signerName, registration: isCadastro ? registrationValues : undefined },
    (d) => {
      setA({ ...emptyAnamnesis(), ...d.a })
      setSignerKind(d.signerKind === 'responsavel' ? 'responsavel' : 'titular')
      setSignerName(typeof d.signerName === 'string' ? d.signerName : '')
      if (isCadastro && d.registration) reset({ ...emptySubjectForm(), ...d.registration })
    },
    { storage: 'session' }
  )

  async function handleSubmit() {
    setError(null)
    if (isCadastro) {
      const ok = await trigger()
      if (!ok) return setError('Confira os campos do cadastro destacados em vermelho.')
    }
    if (!parqComplete) return setError('Responda todos os itens da seção "Sobre sua saúde".')
    if (signerName.trim().length < 3) return setError('Preencha o nome de quem está aceitando o termo.')
    if (!accepted) return setError('É preciso aceitar o termo de consentimento para enviar.')
    if (isMinor && signerKind !== 'responsavel')
      return setError('Menor de idade: o responsável legal deve aceitar o termo.')
    try {
      await submit.mutateAsync(isCadastro ? getValues() : undefined)
      clearDraft(publicDraftKey, { storage: 'session' })
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
            {isCadastro ? 'Seu cadastro e suas respostas foram enviados. ' : 'Suas respostas foram enviadas. '}
            {intake.orgName} vai revisar. Você já pode fechar esta página.
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
            <h1 className="text-xl font-semibold tracking-tight">
              {isCadastro ? 'Cadastro e anamnese' : 'Anamnese'}
            </h1>
          </div>
        </header>

        <p className="text-sm text-muted-foreground">
          {isCadastro
            ? 'Olá! Preencha seus dados e responda com sinceridade — leva alguns minutos. Não há respostas certas ou erradas: elas orientam um acompanhamento seguro e sob medida pra você.'
            : `Olá, ${intake.subjectFirstName}. Responda com sinceridade — leva alguns minutos. Não há respostas certas ou erradas: suas respostas orientam um acompanhamento seguro e sob medida pra você.`}
        </p>

        {draft.restored ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
            <span>Recuperamos o que você já tinha preenchido — continue de onde parou.</span>
            <button
              type="button"
              onClick={draft.dismiss}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Fechar aviso"
            >
              ✕
            </button>
          </div>
        ) : null}

        {isCadastro ? (
          <Card>
            <CardContent className="space-y-4 py-4">
              <div>
                <h2 className="text-base font-semibold">Seus dados</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Usados pelo profissional para criar sua ficha.
                </p>
              </div>

              <Field id="public-full-name" label="Nome completo" error={errors.full_name?.message}>
                <Input id="public-full-name" {...register('full_name')} autoComplete="name" aria-invalid={!!errors.full_name} aria-describedby={errors.full_name ? 'public-full-name-error' : undefined} />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="public-birth-date" label="Data de nascimento" error={errors.birth_date?.message}>
                  <Input id="public-birth-date" type="date" {...register('birth_date')} aria-invalid={!!errors.birth_date} aria-describedby={errors.birth_date ? 'public-birth-date-error' : undefined} />
                </Field>
                <Field id="public-sex" label="Sexo" error={errors.sex?.message}>
                  <select id="public-sex" className={controlClass} {...register('sex')} aria-invalid={!!errors.sex} aria-describedby={errors.sex ? 'public-sex-error' : undefined}>
                    <option value="">Selecione</option>
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="public-height" label="Altura (cm)" error={errors.height_cm?.message} hint="opcional">
                  <Input id="public-height" type="number" step="0.1" {...register('height_cm')} aria-invalid={!!errors.height_cm} aria-describedby={errors.height_cm ? 'public-height-error' : undefined} />
                </Field>
                <Field id="public-phone" label="Telefone" error={errors.phone?.message} hint="opcional">
                  <Input id="public-phone" {...register('phone')} autoComplete="tel" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'public-phone-error' : undefined} />
                </Field>
              </div>

              <Field id="public-email" label="E-mail" error={errors.email?.message} hint="opcional">
                <Input id="public-email" type="email" {...register('email')} autoComplete="email" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'public-email-error' : undefined} />
              </Field>

              {isMinor ? (
                <fieldset className="space-y-4 rounded-md border p-4">
                  <legend className="px-1 text-sm font-medium">
                    Responsável legal <span className="text-destructive">(obrigatório para menor de 18)</span>
                  </legend>
                  <Field id="public-guardian-name" label="Nome do responsável" error={errors.guardian_name?.message}>
                    <Input id="public-guardian-name" {...register('guardian_name')} aria-invalid={!!errors.guardian_name} aria-describedby={errors.guardian_name ? 'public-guardian-name-error' : undefined} />
                  </Field>
                  <Field id="public-guardian-relationship" label="Parentesco" error={errors.guardian_relationship?.message}>
                    <Input id="public-guardian-relationship" {...register('guardian_relationship')} placeholder="mãe, pai, tutor..." aria-invalid={!!errors.guardian_relationship} aria-describedby={errors.guardian_relationship ? 'public-guardian-relationship-error' : undefined} />
                  </Field>
                </fieldset>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <AnamneseCamadaA a={a} set={set} isAluno />
        <AnamneseCamadaB a={a} set={set} isFemale={isFemale} isAluno />

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
                <Label htmlFor="public-signer-kind">Quem está respondendo</Label>
                <select
                  id="public-signer-kind"
                  value={signerKind}
                  onChange={(e) => setSignerKind(e.target.value as SignerKind)}
                  className={controlClass}
                  disabled={isMinor}
                >
                  <option value="titular">Eu mesmo(a)</option>
                  <option value="responsavel">Responsável legal (menor de idade)</option>
                </select>
                {isMinor ? (
                  <p className="text-xs text-muted-foreground">
                    Menor de idade: o responsável legal deve aceitar.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="public-signer-name">Nome completo de quem aceita</Label>
                <Input
                  id="public-signer-name"
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

        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

        <Button className="w-full" onClick={handleSubmit} disabled={!canSubmit || submit.isPending}>
          {submit.isPending ? 'Enviando...' : isCadastro ? 'Enviar cadastro e respostas' : 'Enviar respostas'}
        </Button>
        <p className="pb-8 text-center text-xs text-muted-foreground">
          Ao enviar, guardamos a versão do termo, quem aceitou e quando.
        </p>
      </div>
    </Shell>
  )
}
