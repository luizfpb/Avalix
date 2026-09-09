import { afterEach, beforeEach, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../../scripts/verify-backup.mjs', import.meta.url))
const bytes = Buffer.from('conteudo ficticio')
const hash = createHash('sha256').update(bytes).digest('hex')
let directory: string
const dumpData = [
  '-- Dados extraidos do snapshot de pg_dump',
  'COPY public.organizations (id, name, logo_path) FROM stdin;',
  'o1\tOrg\\tTeste\torg/logo.png',
  '\\.',
  'COPY public.posture_photos (id, thumb_path, storage_path) FROM stdin;',
  'p1\torg/foto_thumb.jpg\torg/foto.jpg',
  '\\.',
].join('\n')

async function manifest(paths = ['logos/org/logo.png', 'photos/org/foto.jpg', 'photos/org/foto_thumb.jpg']) {
  const objects = []
  for (const filename of paths) {
    await mkdir(path.dirname(path.join(directory, filename)), { recursive: true })
    await writeFile(path.join(directory, filename), bytes)
    const [bucket, ...parts] = filename.split('/')
    objects.push({ bucket, path: parts.join('/'), bytes: bytes.length, sha256: hash })
  }
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ version: 1, objects }), 'utf8')
}

function run(input = dumpData) {
  return spawnSync(process.execPath, [script, '--storage', directory], { input, encoding: 'utf8' })
}

beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'avalix-backup-check-')) })
afterEach(async () => {
  // Só o diretório temporário criado pelo próprio teste pode ser removido.
  if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('avalix-backup-check-')) {
    throw new Error('Diretório temporário inesperado')
  }
  await rm(directory, { recursive: true, force: true })
})

it('comprova referencias do dump, tamanho e hash dos arquivos, com colunas em outra ordem', async () => {
  await manifest()
  const result = run()
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(await readFile(path.join(directory, 'reference-check.json'), 'utf8'))).toMatchObject({
    referencedObjects: 3, manifestObjects: 3, verifiedBytes: bytes.length * 3,
  })
})

it('recusa a foto que existia no dump mas foi excluida antes da listagem do Storage', async () => {
  await manifest(['logos/org/logo.png'])
  const result = run()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('2 referência(s) do dump sem arquivo no manifesto')
})

it('recusa extracao parcial mesmo quando todo o Storage foi copiado', async () => {
  await manifest()
  const result = run(dumpData.slice(0, -2))
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Extração incompleta')
})

it('nao confunde ausencia de tabela com uma tabela vazia', async () => {
  await manifest()
  const result = run(dumpData.split('COPY public.posture_photos')[0])
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Extração incompleta')
})

it('recusa alteracao de bytes mesmo com o mesmo tamanho', async () => {
  await manifest()
  await writeFile(path.join(directory, 'photos/org/foto.jpg'), Buffer.alloc(bytes.length, 1))
  const result = run()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Hash divergente')
})

it('aceita ausencia de logo com referencias de fotos intactas', async () => {
  await manifest(['photos/org/foto.jpg', 'photos/org/foto_thumb.jpg'])
  const result = run(dumpData.replace('org/logo.png', '\\N'))
  expect(result.status, result.stderr).toBe(0)
})

it('recusa referencias que saiam da pasta de backup', async () => {
  await manifest()
  const result = run(dumpData.replace('org/logo.png', '../logo.png'))
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Caminho de Storage inseguro')
})
