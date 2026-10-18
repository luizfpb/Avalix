import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink } from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import { useAuth } from '../features/auth/context'
import { validCpfCnpj } from '../../supabase/functions/_shared/billing'
import { billingRequest, useOrgBilling } from '../features/billing/api'
import {
  daysLeft,
  formatBRL,
  formatDate,
  freeMonths,
  monthlyEquivalent,
  planLimitLabel,
  plural,
  statusLabel,
  SUPPORT_EMAIL,
  yearlySavings,
  type BillingCycle,
  type BillingPlan,
  type OrgBilling,
} from '../features/billing/rules'
import { subjectTermLabels } from '../lib/subjectTerm'
import { normalizeDbError } from '../lib/errors'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { QueryError } from '../components/QueryError'

// Depois do checkout, o webhook do Asaas leva alguns segundos (cartão) ou o
// tempo de o aluno pagar o Pix. A tela consulta de novo por até 3 minutos.
const POLL_MS = 5_000
const POLL_LIMIT_MS = 3 * 60_000

export default function Plano() {
  const { organization } = useOrganization()
  const orgId = organization?.id
  const query = useOrgBilling(orgId)
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const retorno = params.get('retorno')
  const terms = subjectTermLabels(organization?.subject_term)

  const [pixUrl, setPixUrl] = useState<string | null>(null)

  const billing = query.data
  const waiting =
    (retorno === 'ok' || retorno === 'pix') &&
    !!billing && billing.status !== 'active' && billing.status !== 'courtesy'

  useEffect(() => {
    if (!waiting) return
    const started = Date.now()
    const timer = window.setInterval(() => {
      if (Date.now() - started > POLL_LIMIT_MS) {
        window.clearInterval(timer)
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['billing', orgId] })
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [waiting, orgId, queryClient])

  return (
    <div className="max-w-5xl space-y-5">
      <h1 className="text-xl font-semibold">Plano e cobrança</h1>

      {retorno ? (
        <ReturnNotice
          retorno={retorno}
          active={billing?.status === 'active'}
          pixUrl={pixUrl ?? billing?.pending_invoice_url ?? null}
          onDismiss={() => setParams({}, { replace: true })}
        />
      ) : null}

      {query.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">Carregando...</p>
      ) : query.isError || !billing ? (
        <QueryError onRetry={() => void query.refetch()} />
      ) : (
        <>
          <CurrentPlan billing={billing} subjectPlural={terms.plural} />
          {billing.status === 'courtesy' ? null : billing.can_manage ? (
            <PlanPicker
              billing={billing}
              orgId={orgId as string}
              subjectPlural={terms.plural}
              onPix={(url) => {
                setPixUrl(url)
                setParams({ retorno: 'pix' }, { replace: true })
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Só o dono ou um administrador da organização gerencia a assinatura.
            </p>
          )}
          <FinePrint />
        </>
      )}
    </div>
  )
}

function ReturnNotice({
  retorno,
  active,
  pixUrl,
  onDismiss,
}: {
  retorno: string
  active: boolean
  pixUrl: string | null
  onDismiss: () => void
}) {
  const ok = retorno === 'ok' || retorno === 'pix'
  const text = active && ok
    ? 'Pagamento confirmado. Obrigado por assinar o Avalix!'
    : retorno === 'pix'
      ? 'Fatura Pix gerada. Pague pelo link abaixo (também enviamos por e-mail); a assinatura ativa assim que o pagamento for confirmado. Esta tela atualiza sozinha.'
      : retorno === 'ok'
        ? 'Recebemos seu pedido. O cartão costuma ser confirmado em instantes. Esta tela atualiza sozinha.'
        : retorno === 'expirado'
          ? 'O link de pagamento expirou. Escolha o plano de novo para gerar outro.'
          : 'Pagamento não concluído. Nada foi cobrado.'
  return (
    <div
      role="status"
      className={[
        'flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm',
        ok ? 'border-success/30 bg-success/5' : 'bg-muted/40',
      ].join(' ')}
    >
      <span className="space-y-2">
        <span className="block">{text}</span>
        {retorno === 'pix' && !active && pixUrl ? (
          <Button asChild size="sm">
            <a href={pixUrl} target="_blank" rel="noopener noreferrer">
              Pagar com Pix <ExternalLink />
            </a>
          </Button>
        ) : null}
      </span>
      <button type="button" onClick={onDismiss} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
        Fechar
      </button>
    </div>
  )
}

function CurrentPlan({ billing, subjectPlural }: { billing: OrgBilling; subjectPlural: string }) {
  const now = new Date()
  const tone =
    billing.access === 'blocked' ? 'destructive' : billing.access === 'grace' ? 'warn' : 'success'
  const trialDays = daysLeft(billing.trial_ends_at, now)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {billing.status === 'courtesy' ? 'Cortesia' : billing.plan_name ?? 'Plano'}
          <Badge variant={tone}>{statusLabel(billing)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {billing.status === 'courtesy' ? (
          <p className="text-sm text-muted-foreground">
            Sua organização tem acesso de cortesia, sem cobrança e sem limite de {subjectPlural}.
          </p>
        ) : null}

        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          {billing.status !== 'courtesy' ? (
            <Item
              label={`${subjectPlural.charAt(0).toUpperCase()}${subjectPlural.slice(1)} ativos`}
              value={
                billing.max_subjects === null
                  ? String(billing.active_subjects)
                  : `${billing.active_subjects} de ${billing.max_subjects}`
              }
            />
          ) : null}
          {billing.status === 'trial' ? (
            <Item
              label="Teste grátis até"
              value={
                billing.access === 'blocked'
                  ? `${formatDate(billing.trial_ends_at)} (encerrado)`
                  : `${formatDate(billing.trial_ends_at)} (${trialDays} ${plural(trialDays ?? 0, 'dia', 'dias')})`
              }
            />
          ) : null}
          {billing.billing_cycle && billing.status !== 'trial' ? (
            <Item label="Cobrança" value={billing.billing_cycle === 'yearly' ? 'Anual' : 'Mensal'} />
          ) : null}
          {billing.current_period_end && billing.status !== 'trial' ? (
            <Item
              label={billing.status === 'canceled' ? 'Acesso até' : 'Pago até'}
              value={formatDate(billing.current_period_end)}
            />
          ) : null}
          {billing.access === 'grace' && billing.grace_ends_at ? (
            <Item label="Só leitura a partir de" value={formatDate(billing.grace_ends_at)} />
          ) : null}
        </dl>

        {billing.access === 'blocked' ? (
          <p className="text-sm">
            Seus dados estão guardados e continuam disponíveis para consulta e exportação. Para criar
            ou editar, assine abaixo.
          </p>
        ) : null}

        {billing.pending_invoice_url ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-warning/30 bg-warning/5 px-4 py-3">
            <span className="text-sm">
              Fatura em aberto
              {billing.pending_due_date ? `, vence em ${formatDate(billing.pending_due_date)}` : ''}.
            </span>
            <Button asChild size="sm">
              <a href={billing.pending_invoice_url} target="_blank" rel="noopener noreferrer">
                Pagar fatura <ExternalLink />
              </a>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

type Pending =
  | { kind: 'change'; plan: BillingPlan; cycle: BillingCycle }
  | { kind: 'cancel' }

function PlanPicker({
  billing,
  orgId,
  subjectPlural,
  onPix,
}: {
  billing: OrgBilling
  orgId: string
  subjectPlural: string
  onPix: (url: string) => void
}) {
  const queryClient = useQueryClient()
  const [cycle, setCycle] = useState<BillingCycle>(billing.billing_cycle ?? 'monthly')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [chosen, setChosen] = useState<BillingPlan | null>(null)
  const subscribed = billing.has_subscription
  const bestFreeMonths = Math.max(0, ...billing.plans.map(freeMonths))

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(normalizeDbError(e))
    } finally {
      setBusy(null)
    }
  }

  function payWithCard(plan: BillingPlan) {
    void run('card', async () => {
      const { url } = await billingRequest(orgId, { action: 'checkout', plan: plan.id, cycle, method: 'card' })
      if (!url) throw new Error('O serviço de pagamento não devolveu o link.')
      window.location.assign(url)
    })
  }

  function payWithPix(plan: BillingPlan, payer: { name: string; cpf_cnpj: string; email?: string }) {
    void run('pix', async () => {
      const { url } = await billingRequest(orgId, {
        action: 'checkout',
        plan: plan.id,
        cycle,
        method: 'pix',
        ...payer,
      })
      if (!url) throw new Error('O serviço de pagamento não devolveu a fatura.')
      setChosen(null)
      await queryClient.invalidateQueries({ queryKey: ['billing', orgId] })
      onPix(url)
    })
  }

  function confirmPending() {
    const p = pending
    setPending(null)
    if (!p) return
    void run(p.kind === 'cancel' ? 'cancel' : p.plan.id, async () => {
      await billingRequest(
        orgId,
        p.kind === 'cancel' ? { action: 'cancel' } : { action: 'change', plan: p.plan.id, cycle: p.cycle }
      )
      await queryClient.invalidateQueries({ queryKey: ['billing', orgId] })
    })
  }

  return (
    <section className="space-y-4" aria-labelledby="planos-titulo">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="planos-titulo" className="text-base font-semibold">
          {subscribed ? 'Trocar plano' : 'Escolha seu plano'}
        </h2>
        <div className="inline-flex rounded-md bg-muted p-1" role="radiogroup" aria-label="Ciclo de cobrança">
          {(['monthly', 'yearly'] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={cycle === c}
              onClick={() => setCycle(c)}
              className={[
                'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                cycle === c ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {c === 'monthly' ? 'Mensal' : 'Anual'}
              {c === 'yearly' && bestFreeMonths > 0 ? (
                <span className="ml-1.5 text-xs text-success">
                  {bestFreeMonths} {plural(bestFreeMonths, 'mês grátis', 'meses grátis')}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {billing.plans.map((plan) => {
          const current =
            (subscribed && plan.id === billing.plan_id && cycle === billing.billing_cycle) ||
            chosen?.id === plan.id
          const tooMany = plan.max_subjects !== null && billing.active_subjects > plan.max_subjects
          const price = cycle === 'yearly' ? plan.yearly_price_brl : plan.monthly_price_brl
          return (
            <Card key={plan.id} className={current ? 'border-primary' : undefined}>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">{planLimitLabel(plan.max_subjects, subjectPlural)}</p>
                </div>
                <div>
                  <span className="text-2xl font-semibold tabular-nums">{formatBRL(price)}</span>
                  <span className="text-sm text-muted-foreground">{cycle === 'yearly' ? ' por ano' : ' por mês'}</span>
                  {cycle === 'yearly' ? (
                    <p className="text-xs text-muted-foreground">
                      Equivale a {formatBRL(monthlyEquivalent(plan))} por mês. Economia de{' '}
                      {formatBRL(yearlySavings(plan))}.
                    </p>
                  ) : null}
                </div>
                <ul className="space-y-1 text-sm">
                  <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" /> Avaliação física, postural e anamnese</li>
                  <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" /> Treinos com link para o aluno</li>
                  <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" /> Relatórios em PDF com a sua marca</li>
                </ul>
                {chosen?.id === plan.id ? (
                  <Button type="button" variant="outline" className="w-full" onClick={() => setChosen(null)}>
                    Escolhido · trocar
                  </Button>
                ) : current ? (
                  <Button type="button" variant="outline" className="w-full" disabled>
                    Plano atual
                  </Button>
                ) : tooMany ? (
                  <p className="text-xs text-muted-foreground">
                    Você tem {billing.active_subjects} {subjectPlural} ativos. Inative cadastros para usar este plano.
                  </p>
                ) : (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={busy !== null}
                    onClick={() =>
                      subscribed ? setPending({ kind: 'change', plan, cycle }) : setChosen(plan)
                    }
                  >
                    {busy === plan.id ? 'Trocando...' : subscribed ? 'Trocar para este' : 'Assinar'}
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {chosen && !subscribed ? (
        <PaymentChooser
          plan={chosen}
          cycle={cycle}
          busy={busy}
          onCard={() => payWithCard(chosen)}
          onPix={(payer) => payWithPix(chosen, payer)}
        />
      ) : null}

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      {!subscribed ? (
        <p className="text-xs text-muted-foreground">
          A assinatura começa no dia do pagamento{billing.status === 'trial' ? ' e encerra o teste grátis' : ''}.
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            O novo valor vale a partir da próxima cobrança; o limite novo vale na hora.
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={busy !== null}
            onClick={() => setPending({ kind: 'cancel' })}
          >
            {busy === 'cancel' ? 'Cancelando...' : 'Cancelar assinatura'}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'cancel' ? 'Cancelar a assinatura?' : `Trocar para o plano ${pending?.kind === 'change' ? pending.plan.name : ''}?`}
        description={
          pending?.kind === 'cancel'
            ? `Nada mais será cobrado. Você continua com acesso completo até ${formatDate(billing.current_period_end)}; depois disso, seus dados ficam disponíveis só para consulta e exportação.`
            : pending?.kind === 'change'
              ? `A partir da próxima cobrança, o valor passa a ser ${formatBRL(pending.cycle === 'yearly' ? pending.plan.yearly_price_brl : pending.plan.monthly_price_brl)} ${pending.cycle === 'yearly' ? 'por ano' : 'por mês'}.`
              : undefined
        }
        confirmLabel={pending?.kind === 'cancel' ? 'Cancelar assinatura' : 'Trocar plano'}
        cancelLabel="Voltar"
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />
    </section>
  )
}

function PaymentChooser({
  plan,
  cycle,
  busy,
  onCard,
  onPix,
}: {
  plan: BillingPlan
  cycle: BillingCycle
  busy: string | null
  onCard: () => void
  onPix: (payer: { name: string; cpf_cnpj: string; email?: string }) => void
}) {
  const { user } = useAuth()
  const [pix, setPix] = useState(false)
  const [name, setName] = useState('')
  const [doc, setDoc] = useState('')
  const [touched, setTouched] = useState(false)
  const price = cycle === 'yearly' ? plan.yearly_price_brl : plan.monthly_price_brl
  const docOk = validCpfCnpj(doc)
  const nameOk = name.trim().length >= 3

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Como você quer pagar? {plan.name}, {formatBRL(price)} {cycle === 'yearly' ? 'por ano' : 'por mês'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-md border p-4">
            <p className="font-medium">Cartão de crédito</p>
            <p className="text-xs text-muted-foreground">
              Renova sozinho a cada {cycle === 'yearly' ? 'ano' : 'mês'}. Você digita o cartão na página
              segura do Asaas.
            </p>
            <Button type="button" className="w-full" disabled={busy !== null} onClick={onCard}>
              {busy === 'card' ? 'Abrindo pagamento...' : 'Pagar com cartão'}
            </Button>
          </div>
          <div className="space-y-2 rounded-md border p-4">
            <p className="font-medium">Pix</p>
            <p className="text-xs text-muted-foreground">
              Uma fatura Pix a cada {cycle === 'yearly' ? 'ano' : 'mês'}, enviada para{' '}
              {user?.email ?? 'o seu e-mail'}.
            </p>
            {!pix ? (
              <Button type="button" variant="outline" className="w-full" disabled={busy !== null} onClick={() => setPix(true)}>
                Pagar com Pix
              </Button>
            ) : null}
          </div>
        </div>

        {pix ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              setTouched(true)
              if (!docOk || !nameOk) return
              onPix({ name: name.trim(), cpf_cnpj: doc, email: user?.email ?? undefined })
            }}
          >
            <p className="text-xs text-muted-foreground">
              O Asaas exige nome e CPF (ou CNPJ) de quem paga para emitir a cobrança Pix. Esses dados
              vão só para o Asaas; o Avalix não os guarda.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pix-name">Nome completo</Label>
                <Input
                  id="pix-name"
                  autoComplete="name"
                  value={name}
                  aria-invalid={touched && !nameOk}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pix-doc">CPF ou CNPJ</Label>
                <Input
                  id="pix-doc"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={doc}
                  aria-invalid={touched && !docOk}
                  onChange={(e) => setDoc(e.target.value)}
                />
              </div>
            </div>
            {touched && (!nameOk || !docOk) ? (
              <p role="alert" className="text-sm text-destructive">
                {!nameOk ? 'Informe o nome completo.' : 'CPF ou CNPJ inválido.'}
              </p>
            ) : null}
            <Button type="submit" disabled={busy !== null}>
              {busy === 'pix' ? 'Gerando Pix...' : 'Gerar Pix'}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  )
}

function FinePrint() {
  return (
    <p className="text-xs text-muted-foreground">
      Pagamentos processados pelo Asaas. Cancele quando quiser, sem multa. Desistiu em até 7 dias da
      primeira cobrança? Escreva para{' '}
      <a className="underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>
        {SUPPORT_EMAIL}
      </a>{' '}
      e devolvemos o valor integral. Ao assinar, você concorda com os{' '}
      <Link to="/termos" target="_blank" className="underline underline-offset-2">
        Termos de Uso
      </Link>
      .
    </p>
  )
}
