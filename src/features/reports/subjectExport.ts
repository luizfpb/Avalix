import { strToU8, Zip, ZipDeflate, ZipPassThrough } from 'fflate'
import { supabase } from '../../lib/supabase'
import type { Json } from '../../lib/database.types'
import { downloadBlob } from './download'

type PhotoExportRow = {
  id: string
  storage_path: string
  format?: string | null
}

type ExportDocument = Record<string, Json | undefined> & {
  posture_photos?: Json
}

export type SubjectExportProgress = {
  completed: number
  total: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function photoRows(document: ExportDocument): PhotoExportRow[] {
  if (!Array.isArray(document.posture_photos)) return []
  return document.posture_photos.flatMap((value) => {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.storage_path !== 'string') {
      return []
    }
    return [{
      id: value.id,
      storage_path: value.storage_path,
      format: typeof value.format === 'string' ? value.format : null,
    }]
  })
}

function safeName(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return normalized || 'avaliado'
}

function photoExtension(row: PhotoExportRow): string {
  const pathExt = /\.([a-zA-Z0-9]{2,5})$/.exec(row.storage_path)?.[1]?.toLowerCase()
  if (pathExt === 'jpeg' || pathExt === 'jpg') return 'jpg'
  if (pathExt === 'webp') return 'webp'
  return row.format === 'jpeg' ? 'jpg' : 'webp'
}

function addText(zip: Zip, name: string, content: string): void {
  const entry = new ZipDeflate(name, { level: 6 })
  zip.add(entry)
  entry.push(strToU8(content), true)
}

function streamingZip(): { zip: Zip; result: Promise<Blob> } {
  const parts: ArrayBuffer[] = []
  let zip!: Zip
  const result = new Promise<Blob>((resolve, reject) => {
    zip = new Zip((error, chunk, final) => {
      if (error) {
        reject(error)
        return
      }
      const copy = new Uint8Array(chunk.byteLength)
      copy.set(chunk)
      parts.push(copy.buffer)
      if (final) resolve(new Blob(parts, { type: 'application/zip' }))
    })
  })
  return { zip, result }
}

async function downloadPhotoNoStore(path: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from('photos').createSignedUrl(path, 60)
  if (error || !data?.signedUrl) throw error ?? new Error('URL de foto indisponível.')
  const response = await fetch(data.signedUrl, {
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  })
  if (!response.ok) throw new Error(`Falha ao baixar foto (${response.status}).`)
  return new Uint8Array(await response.arrayBuffer())
}

export async function exportSubjectArchive(input: {
  subjectId: string
  subjectName: string
  onProgress?: (progress: SubjectExportProgress) => void
}): Promise<void> {
  const { data, error } = await supabase.rpc('export_subject_data', {
    p_subject: input.subjectId,
  })
  if (error) throw error
  if (!isRecord(data)) throw new Error('O servidor devolveu uma exportação inválida.')

  const document = data as ExportDocument
  const photos = photoRows(document)
  const { zip, result } = streamingZip()
  addText(zip, 'dados.json', `${JSON.stringify(document, null, 2)}\n`)
  addText(
    zip,
    'LEIA-ME.txt',
    'Exportação de portabilidade do Avalix.\n' +
      'dados.json contém o snapshot completo dos registros disponíveis.\n' +
      'fotos/ contém as imagens posturais originais. Miniaturas não são duplicadas.\n' +
      'O arquivo contém dados pessoais sensíveis: armazene e compartilhe com cuidado.\n'
  )

  input.onProgress?.({ completed: 0, total: photos.length })
  try {
    for (let index = 0; index < photos.length; index += 1) {
      const photo = photos[index]
      let bytes: Uint8Array
      try {
        bytes = await downloadPhotoNoStore(photo.storage_path)
      } catch {
        throw new Error(`Não foi possível incluir a foto ${index + 1} de ${photos.length}.`)
      }
      const entry = new ZipPassThrough(
        `fotos/${String(index + 1).padStart(4, '0')}-${photo.id}.${photoExtension(photo)}`
      )
      zip.add(entry)
      entry.push(bytes, true)
      input.onProgress?.({ completed: index + 1, total: photos.length })
    }
    zip.end()
  } catch (error) {
    zip.terminate()
    throw error
  }

  const archive = await result
  const day = new Date().toISOString().slice(0, 10)
  downloadBlob(archive, `avalix-${safeName(input.subjectName)}-${day}.zip`)
}
