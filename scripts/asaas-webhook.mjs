// Cria (ou lista) o webhook do Asaas que avisa o Avalix sobre pagamentos.
// Uso no CMD, depois de definir as variáveis da sessão:
//   set ASAAS_API_KEY=<chave da conta>
//   set ASAAS_WEBHOOK_TOKEN=<o mesmo token gravado nos secrets do Supabase>
//   set ASAAS_ENV=sandbox            (ou production)
//   node scripts/asaas-webhook.mjs          -> cria
//   node scripts/asaas-webhook.mjs listar   -> só lista os existentes
// A URL do webhook sai do VITE_SUPABASE_URL do .env.local.
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const EVENTS = [
  'PAYMENT_CREATED',
  'PAYMENT_UPDATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_DELETED',
  'PAYMENT_REFUNDED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'SUBSCRIPTION_DELETED',
  'SUBSCRIPTION_INACTIVATED',
]

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`defina ${name} antes (set ${name}=...)`)
  return value
}

const production = (process.env.ASAAS_ENV ?? 'sandbox').trim() === 'production'
const base = production ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3'
const headers = {
  'Content-Type': 'application/json',
  'User-Agent': 'Avalix',
  access_token: required('ASAAS_API_KEY'),
}

async function call(method, path, body) {
  const response = await fetch(`${base}${path}`, { method, headers, body: body && JSON.stringify(body) })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = data?.errors?.map((e) => e.description).join('; ') ?? response.status
    throw new Error(`Asaas recusou: ${detail}`)
  }
  return data
}

async function main() {
  const existing = await call('GET', '/webhooks')
  for (const w of existing?.data ?? []) {
    console.log(`- ${w.id} ${w.enabled ? 'ativo' : 'inativo'} ${w.interrupted ? '(fila pausada) ' : ''}${w.url}`)
  }
  if (process.argv[2] === 'listar') return

  const env = loadEnv('production', fileURLToPath(new URL('../', import.meta.url)), 'VITE_SUPABASE_')
  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL)?.replace(/\/+$/, '')
  if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL não encontrado no .env.local')
  const url = `${supabaseUrl}/functions/v1/billing-webhook`
  if ((existing?.data ?? []).some((w) => w.url === url)) {
    console.log('Já existe um webhook para esta URL; nada foi criado.')
    return
  }

  const token = required('ASAAS_WEBHOOK_TOKEN')
  if (token.length < 32) throw new Error('ASAAS_WEBHOOK_TOKEN precisa de pelo menos 32 caracteres')
  const created = await call('POST', '/webhooks', {
    name: 'Avalix',
    url,
    email: process.env.ASAAS_WEBHOOK_EMAIL?.trim() || undefined,
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    authToken: token,
    sendType: 'SEQUENTIALLY',
    events: EVENTS,
  })
  console.log(`Webhook criado (${production ? 'produção' : 'sandbox'}): ${created.id} -> ${url}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
