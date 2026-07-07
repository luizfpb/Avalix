// Teste ponta a ponta do 2FA (TOTP) contra o projeto Supabase de produção.
// Pendência pré-beta do DECISIONS: "ligar TOTP no painel e testar 2FA".
//
// O que ele valida, na ordem:
//   1. login por senha (aal1);
//   2. enrollment TOTP (se o toggle do painel estiver DESLIGADO, falha AQUI
//      com erro claro — é o teste do toggle);
//   3. desafio + verificação com código TOTP calculado localmente (RFC 6238,
//      HMAC-SHA1, 30s) a partir do segredo devolvido pelo enroll;
//   4. sessão elevada a aal2 (getAuthenticatorAssuranceLevel);
//   5. unenroll ao final — a conta volta EXATAMENTE ao estado anterior.
//
// Se a conta JÁ tem 2FA ativo, o script pede o código do app autenticador e
// testa o desafio (sem mexer no fator existente).
//
// Rodar (cmd):
//   set AVALIX_EMAIL=voce@exemplo.com
//   set AVALIX_PASSWORD=suasenha
//   node scripts/test-2fa.mjs
//
// Lê VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY do .env.local.

import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { createClient } from '@supabase/supabase-js'

function readEnvLocal() {
  const out = {}
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (m) out[m[1]] = m[2]
  }
  return out
}

// ---- TOTP (RFC 6238) sem dependências -----------------------------------
function base32Decode(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  const bytes = []
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const idx = alphabet.indexOf(ch)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function totp(secretBase32, timeMs = Date.now(), stepSec = 30, digits = 6) {
  const counter = Math.floor(timeMs / 1000 / stepSec)
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', base32Decode(secretBase32)).update(msg).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3]
  return String(code % 10 ** digits).padStart(digits, '0')
}

// ---- fluxo ---------------------------------------------------------------
const env = readEnvLocal()
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key) {
  console.error('ERRO: VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY nao encontradas no .env.local')
  process.exit(1)
}

const rl = createInterface({ input: process.stdin, output: process.stdout })
const email = process.env.AVALIX_EMAIL || (await rl.question('E-mail: '))
const password = process.env.AVALIX_PASSWORD || (await rl.question('Senha (visivel!): '))

const supabase = createClient(url, key)

function fail(step, error) {
  console.error(`\nFALHOU em "${step}": ${error?.message ?? error}`)
  process.exit(1)
}

console.log('\n[1/5] Login por senha...')
const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
  email,
  password,
})
if (signInErr) fail('login', signInErr)
console.log(`      ok (user ${signIn.user.id.slice(0, 8)}…)`)

const { data: factorsData, error: factorsErr } = await supabase.auth.mfa.listFactors()
if (factorsErr) fail('listar fatores', factorsErr)
const verified = (factorsData?.totp ?? []).find((f) => f.status === 'verified')

if (verified) {
  console.log('\n[2/5] Conta JA tem TOTP verificado — testando o desafio com o seu autenticador.')
  const code = (await rl.question('Codigo de 6 digitos do app autenticador: ')).trim()
  const { error: chErr } = await supabase.auth.mfa.challengeAndVerify({
    factorId: verified.id,
    code,
  })
  if (chErr) fail('desafio/verificacao', chErr)
  console.log('      ok')
} else {
  // remove fatores pendentes acumulados
  for (const f of factorsData?.totp ?? []) {
    if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
  }
  console.log('\n[2/5] Enrollment TOTP (testa o toggle do painel)...')
  const { data: enroll, error: enrollErr } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'teste-2fa (temporario)',
  })
  if (enrollErr) {
    fail(
      'enrollment — provavelmente o TOTP esta DESLIGADO no painel (Authentication > Sign In / Providers > Multi-Factor)',
      enrollErr
    )
  }
  console.log('      ok (segredo recebido)')

  console.log('[3/5] Desafio + verificacao com codigo TOTP calculado localmente...')
  const code = totp(enroll.totp.secret)
  const { error: verErr } = await supabase.auth.mfa.challengeAndVerify({
    factorId: enroll.id,
    code,
  })
  if (verErr) {
    await supabase.auth.mfa.unenroll({ factorId: enroll.id }).catch(() => {})
    fail('verificacao do codigo', verErr)
  }
  console.log('      ok')

  console.log('[4/5] Conferindo AAL da sessao...')
  const { data: aal, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalErr) fail('leitura do AAL', aalErr)
  if (aal.currentLevel !== 'aal2') {
    await supabase.auth.mfa.unenroll({ factorId: enroll.id }).catch(() => {})
    fail('AAL', new Error(`esperado aal2, veio ${aal.currentLevel}`))
  }
  console.log('      ok (aal2 — as policies de MFA do banco reconhecem esta sessao)')

  console.log('[5/5] Unenroll (a conta volta ao estado anterior)...')
  const { error: unErr } = await supabase.auth.mfa.unenroll({ factorId: enroll.id })
  if (unErr) fail('unenroll — REMOVA O FATOR "teste-2fa" MANUALMENTE em Configuracoes > 2FA', unErr)
  console.log('      ok')
}

await supabase.auth.signOut()
rl.close()
console.log('\nSUCESSO: fluxo de 2FA (TOTP) funcionando ponta a ponta.')
