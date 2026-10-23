import { supabase } from '../../lib/supabase'

// Logo da organização: bucket privado `logos`, path canônico {org_id}/logo.{ext}
// (a policy de storage exige a 1ª pasta = org_id e papel owner/admin). A coluna
// organizations.logo_path guarda o path; o update da org é restrito a owner/admin.

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

// O arquivo escolhido pode ter até 10 MB; o que sobe para o Storage cabe no
// limite do bucket (1 MB, 0002). A logo entra embutida em todo PDF, então
// guardar o original de uma foto de celular só deixaria os relatórios pesados.
export const LOGO_INPUT_MAX_BYTES = 10 * 1024 * 1024
export const LOGO_STORED_MAX_BYTES = 1024 * 1024
const LOGO_MAX_SIDES = [1024, 768, 512]
const NOT_UPDATED = 'Não foi possível salvar o logo. Só o dono ou um administrador, com a verificação em dois fatores em dia, altera o logo.'

// Reduz no navegador o que passar de 1024 px ou de 1 MB. JPEG continua JPEG
// (não tem transparência); PNG e WebP viram PNG, que preserva o alpha e que
// todo navegador sabe gerar (o Safari não gera WebP no canvas). Arquivo que já
// cabe nos dois limites sobe intacto, sem perda por reencode.
export async function prepareOrgLogo(file: File): Promise<Blob> {
  if (!MIME_EXT[file.type]) throw new Error('Use uma imagem PNG, JPEG ou WebP.')
  if (file.size > LOGO_INPUT_MAX_BYTES) throw new Error('A imagem deve ter no máximo 10 MB.')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch (error) {
    throw new Error('Não foi possível ler a imagem. Tente outro arquivo.', { cause: error })
  }
  try {
    if (bitmap.width <= 0 || bitmap.height <= 0) throw new Error('A imagem não tem dimensões válidas.')
    const fits = Math.max(bitmap.width, bitmap.height) <= LOGO_MAX_SIDES[0]
    if (fits && file.size <= LOGO_STORED_MAX_BYTES) return file
    const mime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
    for (const side of LOGO_MAX_SIDES) {
      const blob = await encodeScaled(bitmap, side, mime, 0.9)
      if (blob.size <= LOGO_STORED_MAX_BYTES) return blob
    }
    throw new Error('Não foi possível reduzir a imagem para 1 MB. Tente uma versão mais simples do logo.')
  } finally {
    bitmap.close()
  }
}

export async function uploadOrgLogo(orgId: string, file: File): Promise<string> {
  const prepared = await prepareOrgLogo(file)
  const ext = MIME_EXT[prepared.type]
  if (!ext) throw new Error('Não foi possível preparar a imagem. Tente outro arquivo.')
  const path = `${orgId}/logo.${ext}`
  const up = await supabase.storage
    .from('logos')
    .upload(path, prepared, { upsert: true, contentType: prepared.type })
  if (up.error) throw up.error
  const upd = await supabase.from('organizations').update({ logo_path: path }).eq('id', orgId).select('id')
  if (upd.error) throw upd.error
  // a policy recusa em silêncio (0 linhas): papel trocado ou 2FA pendente
  if (!upd.data?.length) throw new Error(NOT_UPDATED)

  // A policy da 0028 limita o namespace às três chaves canônicas. Depois de a
  // organização apontar para o arquivo novo, removemos as extensões antigas;
  // uma falha de limpeza não invalida o logo já salvo e nunca volta a permitir
  // crescimento ilimitado.
  const stalePaths = Object.values(MIME_EXT)
    .filter((candidate) => candidate !== ext)
    .map((candidate) => `${orgId}/logo.${candidate}`)
  await supabase.storage.from('logos').remove(stalePaths)
  return path
}

// A organização deixa de apontar para o arquivo antes de ele sumir: assim um
// PDF gerado no meio da remoção nunca tenta carregar um logo inexistente. Uma
// falha na limpeza do Storage deixa só um órfão nas chaves canônicas, que o
// próximo envio sobrescreve.
export async function removeOrgLogo(orgId: string): Promise<void> {
  const upd = await supabase.from('organizations').update({ logo_path: null }).eq('id', orgId).select('id')
  if (upd.error) throw upd.error
  if (!upd.data?.length) throw new Error(NOT_UPDATED.replace('salvar', 'remover'))
  await supabase.storage
    .from('logos')
    .remove(Object.values(MIME_EXT).map((ext) => `${orgId}/logo.${ext}`))
}

// URL assinada (TTL 300s) pra exibir o logo em <img>.
export async function signedLogoUrl(logoPath: string | null | undefined): Promise<string | null> {
  if (!logoPath) return null
  const { data, error } = await supabase.storage.from('logos').createSignedUrl(logoPath, 300)
  if (error) return null
  return data?.signedUrl ?? null
}

// Logo como data URL para o PDF. WebP é aceito pelo app e pelo navegador, mas
// o renderer só recebe PNG/JPEG. O original no Storage permanece intacto.
// null significa somente "sem logo": uma falha não pode gerar silenciosamente
// um documento incompleto quando a organização configurou sua marca.
export async function loadOrgLogoDataUrl(
  logoPath: string | null | undefined
): Promise<string | null> {
  if (!logoPath) return null
  const url = await signedLogoUrl(logoPath)
  if (!url) throw new Error('Não foi possível carregar o logo da organização. Tente gerar o PDF novamente.')
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const mime = blob.type.toLowerCase().split(';')[0]
    if (mime === 'image/webp') return await blobToDataUrl(await webpToPng(blob))
    if (mime !== 'image/png' && mime !== 'image/jpeg') throw new Error('Formato de logo não suportado')
    return await blobToDataUrl(blob)
  } catch (error) {
    throw new Error('Não foi possível preparar o logo para o PDF. Tente novamente ou envie um logo PNG/JPEG em Ajustes.', { cause: error })
  }
}

async function webpToPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  try {
    if (bitmap.width <= 0 || bitmap.height <= 0) throw new Error('Logo sem dimensões válidas')
    return await encodeScaled(bitmap, 2048, 'image/png')
  } finally {
    bitmap.close()
  }
}

// Desenha o bitmap com o lado maior em até maxSide (nunca amplia) e reencoda.
// Canvas transparente: logos com alpha não ganham retângulo de fundo.
async function encodeScaled(bitmap: ImageBitmap, maxSide: number, mime: string, quality?: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponível')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality))
  if (!out || out.type !== mime) throw new Error('Não foi possível converter o logo')
  return out
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result) : reject(new Error('Não foi possível ler o logo'))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
