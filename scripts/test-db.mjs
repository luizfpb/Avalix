#!/usr/bin/env node
// Roda as suítes pgTAP (supabase/tests/*.test.sql) num PostgreSQL DESCARTÁVEL:
// cria um cluster novo numa pasta temporária, aplica o stub do Supabase e
// todas as migrations em ordem, roda os testes e apaga tudo no fim.
// Não lê .env, não usa o CLI do Supabase e nunca conecta em outro banco.
//
// Uso:
//   node scripts/test-db.mjs                 todas as suítes
//   node scripts/test-db.mjs 0058 0049       só as suítes cujo nome contém o filtro
//   node scripts/test-db.mjs --keep          não apaga o cluster (para investigar)
//
// Variáveis:
//   PG_BIN     pasta com initdb, pg_ctl e psql (padrão: PATH; no Windows,
//              C:\Program Files\PostgreSQL\18\bin se existir)
//   PGTAP_SQL  arquivo SQL do pgTAP, usado quando a extensão pgtap não está
//              instalada no PostgreSQL (no CI ela vem do pacote postgresql-18-pgtap)
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const TESTS = join(ROOT, 'supabase', 'tests')
const BOOTSTRAP = join(TESTS, 'harness', 'bootstrap.sql')

const args = process.argv.slice(2)
const keep = args.includes('--keep')
const filters = args.filter((a) => !a.startsWith('--'))

const exe = process.platform === 'win32' ? '.exe' : ''
const winDefault = 'C:\\Program Files\\PostgreSQL\\18\\bin'
const binDir = process.env.PG_BIN || (process.platform === 'win32' && existsSync(winDefault) ? winDefault : '')
const bin = (name) => (binDir ? join(binDir, name + exe) : name)

const port = String(55000 + Math.floor(Math.random() * 900))
const dir = mkdtempSync(join(tmpdir(), 'avalix-pg-'))
const data = join(dir, 'data')
const env = {
  ...process.env,
  PGCLIENTENCODING: 'UTF8',
  PGOPTIONS: '-c search_path=public,extensions,pg_catalog',
}
const conn = ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1']

// `detached`: o pg_ctl start deixa o postgres vivo herdando os pipes; com
// stdout capturado o spawnSync esperaria o servidor terminar. A saída dele vai
// para o -l (postgres.log).
function run(cmd, cmdArgs, { allowFail = false, detached = false } = {}) {
  const r = spawnSync(cmd, cmdArgs, {
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: detached ? 'ignore' : 'pipe',
  })
  if (r.error) throw r.error
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (r.status !== 0 && !allowFail) {
    throw new Error(`${cmd} ${cmdArgs.join(' ')}\n${output.slice(-4000)}`)
  }
  return { status: r.status, output }
}

const psqlFile = (file, opts) => run(bin('psql'), [...conn, '-f', file], opts)
const psqlCmd = (sql) => run(bin('psql'), [...conn, '-At', '-c', sql]).output.trim()

let started = false
let failed = false
try {
  run(bin('initdb'), ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=C'])
  // No Linux o postgres do pgdg cria o socket em /var/run/postgresql, que é do
  // usuário postgres: no runner do GitHub a subida morre com "Permission
  // denied". O socket vai para a pasta descartável (a conexão é por TCP).
  const socket = process.platform === 'win32' ? '' : ` -k ${dir}`
  const log = join(dir, 'postgres.log')
  try {
    run(bin('pg_ctl'), ['-D', data, '-l', log, '-o', `-p ${port} -h 127.0.0.1${socket}`, '-w', 'start'], {
      detached: true,
    })
  } catch (error) {
    // com stdio ignorado, o motivo real só aparece no log do servidor
    const tail = existsSync(log) ? readFileSync(log, 'utf8').slice(-3000) : '(sem postgres.log)'
    throw new Error(`${error.message}\n--- postgres.log ---\n${tail}`)
  }
  started = true

  psqlFile(BOOTSTRAP)
  const migrations = readdirSync(MIGRATIONS).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()
  for (const m of migrations) {
    try {
      psqlFile(join(MIGRATIONS, m))
    } catch (error) {
      throw new Error(`migration ${m} falhou:\n${error.message}`)
    }
  }
  console.log(`${migrations.length} migrations aplicadas (até ${migrations.at(-1)})`)

  if (psqlCmd("select count(*) from pg_available_extensions where name = 'pgtap'") === '1') {
    psqlCmd('create extension if not exists pgtap with schema extensions')
  } else if (process.env.PGTAP_SQL && existsSync(process.env.PGTAP_SQL)) {
    psqlFile(resolve(process.env.PGTAP_SQL))
  } else {
    throw new Error('pgTAP indisponível: instale a extensão pgtap ou aponte PGTAP_SQL para o pgtap.sql')
  }

  const tests = readdirSync(TESTS)
    .filter((f) => f.endsWith('.test.sql'))
    .filter((f) => filters.length === 0 || filters.some((x) => f.includes(x)))
    .sort()
  let total = 0
  for (const t of tests) {
    const { status, output } = psqlFile(join(TESTS, t), { allowFail: true })
    const lines = output.split(/\r?\n/).map((l) => l.trim())
    const ok = lines.filter((l) => /^ok \d+/.test(l)).length
    const bad = lines.filter((l) => /^not ok \d+/.test(l) || l.includes('Looks like you'))
    total += ok
    if (status !== 0 || bad.length > 0) {
      failed = true
      console.log(`FALHOU  ${t}  (${ok} ok)`)
      for (const l of bad) console.log(`        ${l}`)
      if (status !== 0) console.log(output.slice(-2000).replace(/^/gm, '        '))
    } else {
      console.log(`ok      ${t}  (${ok})`)
    }
  }
  console.log(`${failed ? 'FALHA' : 'tudo verde'}: ${total} verificações em ${tests.length} suítes`)
} catch (error) {
  failed = true
  console.error(error.message)
} finally {
  if (started) run(bin('pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'], { allowFail: true })
  if (keep) console.log(`cluster mantido em ${data} (porta ${port})`)
  else rmSync(dir, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
