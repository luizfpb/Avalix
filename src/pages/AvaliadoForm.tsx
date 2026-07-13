import { useEffect, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useParams } from 'react-router'
import { useOrganization } from '../features/organization/context'
import { subjectTermLabels } from '../lib/subjectTerm'
import { ageFromBirthDate } from '../lib/age'
import {
  subjectFormSchema,
  emptySubjectForm,
  subjectToForm,
  formToInsert,
  formToUpdate,
  type SubjectFormValues,
} from '../features/subjects/schema'
import {
  useSubject,
  useCreateSubject,
  useUpdateSubject,
  useDeleteSubject,
} from '../features/subjects/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { controlClass } from '@/lib/ui'
import { normalizeDbError } from '../lib/errors'
import { QueryError } from '../components/QueryError'

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

export default function AvaliadoForm() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const { organization, role } = useOrganization()
  const labels = subjectTermLabels(organization?.subject_term)

  const subjectQuery = useSubject(isEdit ? id : undefined)
  const createMut = useCreateSubject(organization?.id)
  const updateMut = useUpdateSubject(id, organization?.id)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<SubjectFormValues>({
    resolver: zodResolver(subjectFormSchema),
    defaultValues: emptySubjectForm(),
  })

  // no modo edição, preenche o formulário quando o subject carregar; ao voltar
  // pro modo "novo" (mesma rota montada), limpa pra não vazar dados do anterior
  useEffect(() => {
    if (isEdit && subjectQuery.data) reset(subjectToForm(subjectQuery.data))
    if (!isEdit) reset(emptySubjectForm())
  }, [isEdit, subjectQuery.data, reset])

  const age = ageFromBirthDate(watch('birth_date') ?? '')
  const isMinor = age !== null && age < 18

  const mutationError = (createMut.error ?? updateMut.error) as Error | null
  const submitting = createMut.isPending || updateMut.isPending

  async function onSubmit(values: SubjectFormValues) {
    if (!organization) return
    try {
      if (isEdit) {
        await updateMut.mutateAsync(formToUpdate(values))
        navigate(`/avaliados/${id}`)
      } else {
        const created = await createMut.mutateAsync(formToInsert(values, organization.id))
        navigate(`/avaliados/${created.id}`)
      }
    } catch {
      // erro mostrado via mutationError
    }
  }

  if (isEdit && subjectQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }

  if (isEdit && (subjectQuery.isError || !subjectQuery.data)) {
    return (
      <div className="max-w-xl space-y-4">
        <Link to={`/avaliados/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar
        </Link>
        <QueryError
          message={`Não foi possível carregar este ${labels.singular}. O formulário foi bloqueado para evitar sobrescrever o cadastro com campos vazios.`}
          onRetry={() => void subjectQuery.refetch()}
        />
      </div>
    )
  }

  const backTo = isEdit ? `/avaliados/${id}` : '/avaliados'

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link to={backTo} className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar
        </Link>
        <h1 className="mt-2 text-xl font-semibold">
          {isEdit ? `Editar ${labels.singular}` : `Novo ${labels.singular}`}
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field id="subject-full-name" label="Nome completo" error={errors.full_name?.message}>
          <Input id="subject-full-name" aria-describedby={errors.full_name ? 'subject-full-name-error' : undefined} {...register('full_name')} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="subject-birth-date" label="Data de nascimento" error={errors.birth_date?.message}>
            <Input id="subject-birth-date" aria-describedby={errors.birth_date ? 'subject-birth-date-error' : undefined} type="date" {...register('birth_date')} />
          </Field>
          <Field id="subject-sex" label="Sexo" error={errors.sex?.message}>
            <select id="subject-sex" aria-describedby={errors.sex ? 'subject-sex-error' : undefined} className={controlClass} {...register('sex')}>
              <option value="">Selecione</option>
              <option value="M">Masculino</option>
              <option value="F">Feminino</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="subject-height" label="Altura (cm)" error={errors.height_cm?.message} hint="opcional">
            <Input id="subject-height" aria-describedby={errors.height_cm ? 'subject-height-error' : undefined} type="number" step="0.1" {...register('height_cm')} />
          </Field>
          <Field id="subject-phone" label="Telefone" hint="opcional">
            <Input id="subject-phone" type="tel" autoComplete="tel" {...register('phone')} />
          </Field>
        </div>

        <Field id="subject-email" label="E-mail" error={errors.email?.message} hint="opcional">
          <Input id="subject-email" aria-describedby={errors.email ? 'subject-email-error' : undefined} type="email" autoComplete="email" {...register('email')} />
        </Field>

        <fieldset className="space-y-4 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">
            Responsável legal{' '}
            {isMinor ? (
              <span className="text-destructive">(obrigatório)</span>
            ) : (
              <span className="text-muted-foreground">(exigido para menor de 18)</span>
            )}
          </legend>
          <Field id="subject-guardian-name" label="Nome do responsável" error={errors.guardian_name?.message}>
            <Input id="subject-guardian-name" aria-describedby={errors.guardian_name ? 'subject-guardian-name-error' : undefined} {...register('guardian_name')} />
          </Field>
          <Field id="subject-guardian-relationship" label="Parentesco" error={errors.guardian_relationship?.message}>
            <Input id="subject-guardian-relationship" aria-describedby={errors.guardian_relationship ? 'subject-guardian-relationship-error' : undefined} {...register('guardian_relationship')} />
          </Field>
        </fieldset>

        <Field id="subject-notes" label="Observações" hint="opcional">
          <textarea id="subject-notes" rows={3} className={controlClass} {...register('notes')} />
        </Field>

        {isEdit ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('is_active')} />
            Ativo
          </label>
        ) : null}

        {mutationError ? (
          <p role="alert" className="text-sm text-destructive">{normalizeDbError(mutationError)}</p>
        ) : null}

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to={backTo}>Cancelar</Link>
          </Button>
        </div>
      </form>

      {isEdit && subjectQuery.data && (role === 'owner' || role === 'admin') ? (
        <DangerZone
          subjectId={subjectQuery.data.id}
          subjectName={subjectQuery.data.full_name}
          orgId={organization?.id}
          termSingular={labels.singular}
        />
      ) : null}
    </div>
  )
}

// Exclusão definitiva (LGPD). Fica fora do <form> pra não disparar submit e
// exige digitar o nome exato como trava contra clique acidental.
// Exportado pra teste de componente (fluxo crítico).
export function DangerZone({
  subjectId,
  subjectName,
  orgId,
  termSingular,
}: {
  subjectId: string
  subjectName: string
  orgId: string | undefined
  termSingular: string
}) {
  const navigate = useNavigate()
  const del = useDeleteSubject(orgId)
  const [confirmName, setConfirmName] = useState('')
  const matches = confirmName.trim() === subjectName.trim()
  const error = del.error as Error | null

  async function onDelete() {
    if (!matches) return
    try {
      await del.mutateAsync(subjectId)
      navigate('/avaliados')
    } catch {
      // erro mostrado abaixo
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-destructive/40 p-4">
      <div>
        <h2 className="text-sm font-semibold text-destructive">Excluir definitivamente</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Apaga este {termSingular} e todos os dados ligados a ele — avaliações, medidas, sessões,
          fotos e o registro de consentimento. As fotos são removidas do armazenamento. Esta ação é
          irreversível e atende ao direito de eliminação (LGPD).
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="delete-subject-name">
          Para confirmar, digite o nome exato: <span className="font-semibold">{subjectName}</span>
        </Label>
        <Input
          id="delete-subject-name"
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          placeholder={subjectName}
        />
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{normalizeDbError(error)}</p> : null}
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={!matches || del.isPending}
        onClick={onDelete}
      >
        {del.isPending ? 'Excluindo...' : 'Excluir definitivamente'}
      </Button>
    </div>
  )
}
