// Edge Function `billing`: liga a regra (handler.ts) ao Deno e às integrações
// reais. Aplicar a migration 0058 ANTES de publicar esta versão (ela usa
// billing_try_lock/billing_unlock).
import { asaas, asaasCheckoutUrl, env, rpcAsUser, rpcService } from '../_shared/server.ts'
import { createBillingHandler } from './handler.ts'

Deno.serve(
  createBillingHandler({
    asaas,
    rpcService,
    rpcAsUser,
    env,
    checkoutUrl: asaasCheckoutUrl,
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  })
)
