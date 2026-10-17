// Edge Function `billing-webhook`: recebe os eventos do Asaas. Sem JWT
// (verify_jwt = false em supabase/config.toml): a autenticação é o token
// configurado no webhook, que o Asaas manda no header asaas-access-token.
//
// Responde 200 depois de gravar (billing_apply_event é idempotente pelo id do
// evento). Erro inesperado responde 500 para o Asaas tentar de novo.
import {
  HANDLED_EVENTS,
  PAID_EVENTS,
  PAID_STATUSES,
  cycleFromAsaas,
  paymentFields,
  parseWebhook,
  safeEqual,
  type Cycle,
  type PaymentFields,
} from '../_shared/billing.ts'
import { HttpError, asaas, env, json, rpcService } from '../_shared/server.ts'

type AsaasSubscription = {
  id: string
  cycle?: string
  externalReference?: string | null
  checkoutSession?: string | null
}

Deno.serve(async (req) => {
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
    let payment: PaymentFields | null = event.payment
    let cycle: Cycle | null = null

    // pagamento: confere no Asaas antes de liberar acesso (o corpo do webhook
    // sozinho não basta para ativar uma assinatura)
    if (PAID_EVENTS.has(event.event)) {
      if (!payment?.id) return json({ ok: true, outcome: 'sem_pagamento' })
      const fresh = paymentFields(
        await asaas<Record<string, unknown>>('GET', `/payments/${encodeURIComponent(payment.id)}`)
      )
      if (!fresh.status || !PAID_STATUSES.has(fresh.status)) {
        return json({ ok: true, outcome: 'pagamento_nao_confirmado' })
      }
      payment = fresh
    }

    let org = event.subscriptionId
      ? await rpcService<string | null>('billing_find_org', {
          p_subscription_id: event.subscriptionId,
          p_checkout_id: null,
          p_external_reference: null,
        })
      : null

    // assinatura ainda desconhecida: pergunta ao Asaas de qual checkout ela
    // nasceu e qual o ciclo
    if (!org && event.subscriptionId) {
      const sub = await asaas<AsaasSubscription>(
        'GET',
        `/subscriptions/${encodeURIComponent(event.subscriptionId)}`
      ).catch((error) => {
        if (error instanceof HttpError && error.status === 404) return null
        throw error
      })
      cycle = cycleFromAsaas(sub?.cycle)
      org = await rpcService<string | null>('billing_find_org', {
        p_subscription_id: null,
        p_checkout_id: sub?.checkoutSession ?? null,
        p_external_reference: sub?.externalReference ?? event.externalReference,
      })
    }

    const result = await rpcService<{ outcome: string; replaced_subscription_id?: string | null }>(
      'billing_apply_event',
      {
        p_event_id: event.eventId,
        p_event: event.event,
        p_org: org,
        p_subscription_id: event.subscriptionId,
        p_cycle: cycle,
        p_payment: payment,
      }
    )

    // assinatura nova paga substituiu outra ainda ativa: cancela a antiga no
    // Asaas para não cobrar duas vezes
    if (result.replaced_subscription_id) {
      await asaas('DELETE', `/subscriptions/${encodeURIComponent(result.replaced_subscription_id)}`)
        .catch((error) => console.error('falha ao cancelar assinatura substituída', error))
    }

    return json({ ok: true, outcome: result.outcome })
  } catch (error) {
    console.error('billing-webhook', event.event, event.eventId, error)
    return json({ error: 'falha ao processar' }, 500)
  }
})
