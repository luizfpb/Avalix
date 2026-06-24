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
  return path
}

// URL assinada (TTL 300s) pra exibir o logo em <img>.
export async function signedLogoUrl(logoPath: string | null | undefined): Promise<string | null> {
  if (!logoPath) return null
  const { data, error } = await supabase.storage.from('logos').createSignedUrl(logoPath, 300)
  if (error) return null
  return data?.signedUrl ?? null
}

// Logo como data URL, pra embutir no PDF (@react-pdf). null = sem logo ou erro
// (o PDF cai no fallback da plaqueta AVALIX).
export async function loadOrgLogoDataUrl(
  logoPath: string | null | undefined
): Promise<string | null> {
  const url = await signedLogoUrl(logoPath)
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await blobToDataUrl(blob)
  } catch {
    return null
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
