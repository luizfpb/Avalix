import { supabase } from '../../lib/supabase'

// Logo da organização: bucket privado `logos`, path canônico {org_id}/logo.{ext}
// (a policy de storage exige a 1ª pasta = org_id e papel owner/admin). A coluna
// organizations.logo_path guarda o path; o update da org é restrito a owner/admin.

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export async function uploadOrgLogo(orgId: string, file: File): Promise<string> {
  const ext = MIME_EXT[file.type]
  if (!ext) throw new Error('Use uma imagem PNG, JPEG ou WebP.')
  if (file.size > 1024 * 1024) throw new Error('O logo deve ter no máximo 1 MB.')
  const path = `${orgId}/logo.${ext}`
  const up = await supabase.storage
    .from('logos')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (up.error) throw up.error
  const upd = await supabase.from('organizations').update({ logo_path: path }).eq('id', orgId)
  if (upd.error) throw upd.error

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
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas indisponível')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    // Canvas transparente: logos com alpha não ganham retângulo de fundo.
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!png || png.type !== 'image/png') throw new Error('Não foi possível converter o logo para PNG')
    return png
  } finally {
    bitmap.close()
  }
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
