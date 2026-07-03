import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2 } from 'lucide-react'
import { getIntakeByToken, submitIntake } from '../features/anamnesis/intake'
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8">{children}</div>
    </div>
  )
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string
  error?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {hint ? <span className="ml-1 text-xs font-normal text-muted-foreground">({hint})</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
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

        {isCadastro ? (
          <Card>
            <CardContent className="space-y-4 py-4">
              <div>
                <h2 className="text-base font-semibold">Seus dados</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Usados pelo profissional para criar sua ficha.
                </p>
              </div>

              <Field label="Nome completo" error={errors.full_name?.message}>
                <Input {...register('full_name')} autoComplete="name" />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Data de nascimento" error={errors.birth_date?.message}>
                  <Input type="date" {...register('birth_date')} />
                </Field>
                <Field label="Sexo" error={errors.sex?.message}>
                  <select className={controlClass} {...register('sex')}>
                    <option value="">Selecione</option>
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Altura (cm)" error={errors.height_cm?.message} hint="opcional">
                  <Input type="number" step="0.1" {...register('height_cm')} />
                </Field>
                <Field label="Telefone" hint="opcional">
                  <Input {...register('phone')} autoComplete="tel" />
                </Field>
              </div>

              <Field label="E-mail" error={errors.email?.message} hint="opcional">
                <Input type="email" {...register('email')} autoComplete="email" />
              </Field>

              {isMinor ? (
                <fieldset className="space-y-4 rounded-md border p-4">
                  <legend className="px-1 text-sm font-medium">
                    Responsável legal <span className="text-destructive">(obrigatório para menor de 18)</span>
                  </legend>
                  <Field label="Nome do responsável" error={errors.guardian_name?.message}>
                    <Input {...register('guardian_name')} />
                  </Field>
                  <Field label="Parentesco" error={errors.guardian_relationship?.message}>
                    <Input {...register('guardian_relationship')} placeholder="mãe, pai, tutor..." />
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
                <Label>Quem está respondendo</Label>
                <select
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
          {submit.isPending ? 'Enviando...' : isCadastro ? 'Enviar cadastro e respostas' : 'Enviar respostas'}
        </Button>
        <p className="pb-8 text-center text-xs text-muted-foreground">
          Ao enviar, guardamos a versão do termo, quem aceitou e quando.
        </p>
      </div>
    </Shell>
  )
}
