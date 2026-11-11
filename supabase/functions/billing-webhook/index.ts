// Edge Function `billing-webhook`: liga a regra (handler.ts) ao Deno e às
// integrações reais. Sem JWT (verify_jwt = false em supabase/config.toml).
// Aplicar a migration 0058 ANTES de publicar esta versão (ela usa a fila
// billing_pending_cancellations).
import { asaas, env, rpcService } from '../_shared/server.ts'
import { createWebhookHandler } from './handler.ts'

Deno.serve(createWebhookHandler({ asaas, rpcService, env }))
