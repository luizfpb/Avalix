// O que os handlers de cobrança usam do mundo de fora. Em produção vem de
// server.ts (Deno, PostgREST e Asaas); nos testes, de dublês que registram as
// chamadas. Assim o caminho do dinheiro é testado sem rede.

export type AsaasMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export type BillingDeps = {
  asaas: <T>(method: AsaasMethod, path: string, body?: unknown) => Promise<T>
  rpcService: <T>(fn: string, args: Record<string, unknown>) => Promise<T>
  rpcAsUser: <T>(authorization: string, fn: string, args: Record<string, unknown>) => Promise<T>
  env: (name: string, fallback?: string) => string
  checkoutUrl: (id: string) => string
  now: () => Date
  sleep: (ms: number) => Promise<void>
}

export type WebhookDeps = Pick<BillingDeps, 'asaas' | 'rpcService' | 'env'>
