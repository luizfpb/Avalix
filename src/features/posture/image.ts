// Processamento de imagem client-side para fotos posturais.
// Reduz pro lado maior, gera thumb, reencoda em webp (fallback jpeg). O
// reencode no canvas remove EXIF/GPS; createImageBitmap com imageOrientation
// aplica a rotação do EXIF antes, pra não salvar a foto deitada.

export const MAX_EDGE = 1600
export const THUMB_EDGE = 320

export function computeTargetSize(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 }
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) }
  const scale = maxEdge / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export type ProcessedImage = {
  format: 'webp' | 'jpeg'
  mime: string
  width: number
  height: number
  main: Blob
  thumb: Blob
  sizeBytes: number
}

function supportsWebp(): boolean {
  const c = document.createElement('canvas')
  c.width = 1
  c.height = 1
  return c.toDataURL('image/webp').startsWith('data:image/webp')
}

async function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality))
  if (!blob) throw new Error('falha ao gerar a imagem')
  return blob
}

async function render(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  mime: string,
  quality: number
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas indisponível')
  ctx.drawImage(bitmap, 0, 0, width, height)
  return toBlob(canvas, mime, quality)
}

export async function processImage(file: File): Promise<ProcessedImage> {
  const webp = supportsWebp()
  const format: 'webp' | 'jpeg' = webp ? 'webp' : 'jpeg'
  const mime = webp ? 'image/webp' : 'image/jpeg'

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const main = computeTargetSize(bitmap.width, bitmap.height, MAX_EDGE)
    const thumb = computeTargetSize(bitmap.width, bitmap.height, THUMB_EDGE)
    const mainBlob = await render(bitmap, main.width, main.height, mime, 0.85)
    const thumbBlob = await render(bitmap, thumb.width, thumb.height, mime, 0.8)
    return {
      format,
      mime,
      width: main.width,
      height: main.height,
      main: mainBlob,
      thumb: thumbBlob,
      sizeBytes: mainBlob.size,
    }
  } finally {
    bitmap.close()
  }
}
