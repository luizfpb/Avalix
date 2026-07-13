import { supabase } from './supabase'

// Costura única de Storage de fotos (DECISIONS: se um dia migrar pra R2, a
// troca acontece aqui). Hoje resolve o achado de LGPD da auditoria v2.0:
// o remove() do supabase-js NÃO reporta falha por objeto (path negado ou erro
// individual simplesmente não volta na lista), e a policy resolve o objeto
// PELA LINHA de posture_photos — então apagar a linha com o arquivo ainda lá
// deixaria a foto órfã e inapagável pelo app (só service role).
//
// Regra: remover os arquivos e VERIFICAR (list por pasta) ANTES de apagar as
// linhas. Sobrou arquivo => erro, e as linhas ficam (dá pra tentar de novo).
// A verificação por list é idempotente: retry após remoção parcial passa.

const BUCKET = 'photos'
const PAGE_SIZE = 1000
const REMOVE_BATCH_SIZE = 1000

// pasta (prefixo) e nome de um path do bucket
function splitPath(path: string): { folder: string; name: string } {
  const i = path.lastIndexOf('/')
  return { folder: path.slice(0, Math.max(0, i)), name: path.slice(i + 1) }
}

export class StorageRemovalError extends Error {
  readonly remaining: string[]
  constructor(remaining: string[]) {
    super(
      'Não foi possível remover todos os arquivos de foto do armazenamento. ' +
        'Nada foi excluído do cadastro — tente de novo.'
    )
    this.name = 'StorageRemovalError'
    this.remaining = remaining
  }
}

// Remove os objetos e confirma, listando cada pasta envolvida, que nenhum dos
// paths pedidos continua lá. Chamar SEMPRE antes de apagar as linhas do banco
// (com as linhas vivas a policy de select ainda enxerga os objetos).
export async function removePhotoObjectsVerified(paths: string[]): Promise<void> {
  const uniquePaths = [...new Set(paths.filter((path) => path.length > 0))]
  if (uniquePaths.length === 0) return

  // A API limita operacoes em lote. Sem chunking uma sessao grande poderia
  // apagar apenas parte dos objetos antes de a linha do banco ser removida.
  for (let offset = 0; offset < uniquePaths.length; offset += REMOVE_BATCH_SIZE) {
    const batch = uniquePaths.slice(offset, offset + REMOVE_BATCH_SIZE)
    const { error } = await supabase.storage.from(BUCKET).remove(batch)
    if (error) throw error
  }

  const byFolder = new Map<string, Set<string>>()
  for (const p of uniquePaths) {
    const { folder, name } = splitPath(p)
    const set = byFolder.get(folder) ?? new Set<string>()
    set.add(name)
    byFolder.set(folder, set)
  }

  const remaining: string[] = []
  for (const [folder, names] of byFolder) {
    let offset = 0
    // Pagina ate o fim: limitar a primeira pagina a 1000 produziria falso
    // sucesso se o arquivo remanescente estivesse depois dela.
    while (true) {
      const { data, error: listErr } = await supabase.storage.from(BUCKET).list(folder, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (listErr) throw listErr
      const objects = data ?? []
      for (const obj of objects) {
        if (names.has(obj.name)) remaining.push(folder ? `${folder}/${obj.name}` : obj.name)
      }
      if (objects.length < PAGE_SIZE) break
      offset += objects.length
    }
  }
  if (remaining.length > 0) throw new StorageRemovalError(remaining)
}
