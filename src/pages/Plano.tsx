import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink } from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import { billingRequest, useOrgBilling } from '../features/billing/api'
import {
  daysLeft,
  formatBRL,
  formatDate,
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

  const billing = query.data
  const waiting = retorno === 'ok' && !!billing && billing.status !== 'active' && billing.status !== 'courtesy'

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
    <div className="max-w-3xl space-y-5">
      <div>
        <Link to="/configuracoes" className="text-sm text-muted-foreground hover:text-foreground">
          ← Ajustes
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Plano e cobrança</h1>
      </div>

      {retorno ? (
        <ReturnNotice
          retorno={retorno}
          active={billing?.status === 'active'}
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
            <PlanPicker billing={billing} orgId={orgId as string} subjectPlural={terms.plural} />
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
  onDismiss,
}: {
  retorno: string
  active: boolean
  onDismiss: () => void
}) {
  const text =
    retorno === 'ok'
      ? active
        ? 'Pagamento confirmado. Obrigado por assinar o Avalix!'
        : 'Recebemos seu pedido. Cartão costuma ser confirmado em instantes; Pix, assim que você pagar. Esta tela atualiza sozinha.'
      : retorno === 'expirado'
        ? 'O link de pagamento expirou. Escolha o plano de novo para gerar outro.'
        : 'Pagamento não concluído. Nada foi cobrado.'
  return (
    <div
      role="status"
      className={[
        'flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm',
        retorno === 'ok' ? 'border-success/30 bg-success/5' : 'bg-muted/40',
      ].join(' ')}
    >
      <span>{text}</span>
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
}: {
  billing: OrgBilling
  orgId: string
  subjectPlural: string
}) {
  const queryClient = useQueryClient()
  const [cycle, setCycle] = useState<BillingCycle>(billing.billing_cycle ?? 'monthly')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const subscribed = billing.has_subscription
  const bestSavings = Math.max(0, ...billing.plans.map(yearlySavings))

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

  function subscribe(plan: BillingPlan) {
    void run(plan.id, async () => {
      const { url } = await billingRequest(orgId, { action: 'checkout', plan: plan.id, cycle })
      if (!url) throw new Error('O serviço de pagamento não devolveu o link.')
      window.location.assign(url)
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
              {c === 'yearly' && bestSavings > 0 ? (
                <span className="ml-1.5 text-xs text-success">2 meses grátis</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {billing.plans.map((plan) => {
          const current = subscribed && plan.id === billing.plan_id && cycle === billing.billing_cycle
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
                {current ? (
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
                      subscribed ? setPending({ kind: 'change', plan, cycle }) : subscribe(plan)
                    }
                  >
                    {busy === plan.id
                      ? subscribed ? 'Trocando...' : 'Abrindo pagamento...'
                      : subscribed ? 'Trocar para este' : 'Assinar'}
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      {!subscribed ? (
        <p className="text-xs text-muted-foreground">
          Você será levado à página segura do Asaas para pagar com cartão de crédito ou Pix. A
          assinatura começa no dia do pagamento{billing.status === 'trial' ? ' e encerra o teste grátis' : ''}.
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

function FinePrint() {
  return (
    <p className="text-xs text-muted-foreground">
      Pagamentos processados pelo Asaas. Cancele quando quiser, sem multa. Desistiu em até 7 dias da
      primeira cobrança? Escreva para{' '}
      <a className="underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>
        {SUPPORT_EMAIL}
      </a>{' '}
      e devolvemos o valor integral.
    </p>
  )
}
