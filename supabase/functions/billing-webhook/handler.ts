// Regra da Edge Function `billing-webhook` (o index.ts só liga isto ao
// Deno.serve). Recebe os eventos do Asaas, sem JWT: a autenticação é o token
// configurado no webhook, que o Asaas manda no header asaas-access-token (o
// Asaas não assina o corpo).
//
// Pagamento: o corpo recebido não decide nada. O pagamento é reconsultado no
// Asaas, e a organização, a assinatura e o valor saem dessa resposta; o plano
// sai do checkout de onde a assinatura nasceu (0058). Responde 200 depois de
// gravar (billing_apply_event é idempotente pelo id do evento); erro
// inesperado responde 500 para o Asaas tentar de novo.
//
// Depois de cada evento, a fila de assinaturas substituídas
// (billing_pending_cancellations, 0058) é cancelada no Asaas; o que falhar
// fica para o próximo webhook.
import {
  HANDLED_EVENTS,
  PAID_EVENTS,
  PAID_STATUSES,
  cycleFromAsaas,
  paymentFields,
  parseWebhook,
  safeEqual,
  type PaymentFields,
} from '../_shared/billing.ts'
import type { WebhookDeps } from '../_shared/deps.ts'
import { HttpError, json } from '../_shared/http.ts'

type AsaasSubscription = {
  id: string
  cycle?: string
  externalReference?: string | null
  checkoutSession?: string | null
}

// Poucas por evento: o webhook precisa responder rápido ao Asaas.
export const CANCELLATIONS_PER_EVENT = 5

export function createWebhookHandler(deps: WebhookDeps): (req: Request) => Promise<Response> {
  const { asaas, rpcService, env } = deps

  function findOrg(subscriptionId: string | null, checkoutId: string | null, externalReference: string | null) {
    return rpcService<string | null>('billing_find_org', {
      p_subscription_id: subscriptionId,
      p_checkout_id: checkoutId,
      p_external_reference: externalReference,
    })
  }

  function getSubscription(id: string) {
    return asaas<AsaasSubscription>('GET', `/subscriptions/${encodeURIComponent(id)}`).catch((error) => {
      if (error instanceof HttpError && error.status === 404) return null
      throw error
    })
  }

  async function drainCancellations() {
    let due: { subscription_id: string }[]
    try {
      due = (await rpcService<{ subscription_id: string }[] | null>('billing_cancellations_due', {
        p_limit: CANCELLATIONS_PER_EVENT,
      })) ?? []
    } catch (error) {
      console.error('falha ao ler a fila de cancelamento', error)
      return
    }
    for (const { subscription_id } of due) {
      try {
        await asaas('DELETE', `/subscriptions/${encodeURIComponent(subscription_id)}`).catch((error) => {
          // já removida no Asaas: missão cumprida
          if (!(error instanceof HttpError && error.status === 404)) throw error
        })
        await rpcService('billing_cancellation_done', { p_subscription_id: subscription_id })
      } catch (error) {
        console.error('falha ao cancelar assinatura substituída', subscription_id, error)
        await rpcService('billing_cancellation_failed', {
          p_subscription_id: subscription_id,
          p_error: error instanceof Error ? error.message : String(error),
        }).catch((e) => console.error('falha ao registrar tentativa de cancelamento', e))
      }
    }
  }

  return async function handle(req: Request): Promise<Response> {
    if (req.method !== 'POST') return json({ error: 'método não permitido' }, 405)

    const token = req.headers.get('asaas-access-token') ?? ''
    if (!safeEqual(token, env('ASAAS_WEBHOOK_TOKEN'))) {
      return json({ error: 'token inválido' }, 401)
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return json({ error: 'corpo inválido' }, 400)
    }
    const event = parseWebhook(body)
    if (!event) return json({ error: 'evento inválido' }, 400)
    if (!HANDLED_EVENTS.has(event.event)) return json({ ok: true, outcome: 'nao_tratado' })

    try {
      const paid = PAID_EVENTS.has(event.event)
      let payment: PaymentFields | null = event.payment
      let subscriptionId = event.subscriptionId
      let externalReference = event.externalReference

      if (paid) {
        if (!payment?.id) return json({ ok: true, outcome: 'sem_pagamento' })
        const fresh = paymentFields(
          await asaas<Record<string, unknown>>('GET', `/payments/${encodeURIComponent(payment.id)}`)
        )
        if (!fresh.status || !PAID_STATUSES.has(fresh.status)) {
          return json({ ok: true, outcome: 'pagamento_nao_confirmado' })
        }
        payment = fresh
        subscriptionId = fresh.subscription
        externalReference = fresh.externalReference
      }

      let org = subscriptionId ? await findOrg(subscriptionId, null, null) : null

      // pagamento sempre, e assinatura desconhecida: pergunta ao Asaas de qual
      // checkout ela nasceu e qual o ciclo
      const sub = subscriptionId && (paid || !org) ? await getSubscription(subscriptionId) : null
      const cycle = cycleFromAsaas(sub?.cycle)
      if (!org && subscriptionId) {
        org = await findOrg(null, sub?.checkoutSession ?? null, sub?.externalReference ?? externalReference)
      }

      const result = await rpcService<{ outcome: string }>('billing_apply_event', {
        p_event_id: event.eventId,
        p_event: event.event,
        p_org: org,
        p_subscription_id: subscriptionId,
        p_cycle: cycle,
        p_payment: payment && {
          ...payment,
          checkout_id: paid ? (sub?.checkoutSession ?? null) : null,
        },
      })

      await drainCancellations()
      return json({ ok: true, outcome: result.outcome })
    } catch (error) {
      console.error('billing-webhook', event.event, event.eventId, error)
      return json({ error: 'falha ao processar' }, 500)
    }
  }
}
