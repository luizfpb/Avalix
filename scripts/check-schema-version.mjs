const EXPECTED_SCHEMA_VERSION = '0020'
const REQUEST_TIMEOUT_MS = 15_000

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`variável ${name} não configurada`)
  return value
}

async function checkSchemaVersion() {
  const rawUrl = requiredEnv('VITE_SUPABASE_URL')
  const publishableKey = requiredEnv('VITE_SUPABASE_PUBLISHABLE_KEY')

  let baseUrl
  try {
    baseUrl = new URL(rawUrl)
  } catch {
    throw new Error('VITE_SUPABASE_URL não é uma URL válida')
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol)) {
    throw new Error('VITE_SUPABASE_URL deve usar HTTP ou HTTPS')
  }

  const rpcUrl = new URL('/rest/v1/rpc/app_schema_version', baseUrl)
  const response = await fetch(rpcUrl, {
    method: 'GET',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`RPC app_schema_version indisponível (HTTP ${response.status})`)
  }

  let version
  try {
    version = await response.json()
  } catch {
    throw new Error('RPC app_schema_version devolveu JSON inválido')
  }

  if (version !== EXPECTED_SCHEMA_VERSION) {
    const received = typeof version === 'string' ? version : JSON.stringify(version)
    throw new Error(
      `schema incompatível: esperado ${EXPECTED_SCHEMA_VERSION}, recebido ${received ?? 'vazio'}`
    )
  }

  console.log(`schema gate ok: ${version}`)
}

try {
  await checkSchemaVersion()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`schema gate falhou: ${message}`)
  process.exitCode = 1
}
