import { poseToShapes } from './pose'
import type { Shape } from './annotations'

// Carregador do MediaPipe Pose (P7). Custo zero: o pacote npm é Apache-2.0,
// o WASM vem do jsdelivr (versão PINADA à do package.json) e o modelo
// (~5,5 MB, float16 lite) do CDN público do MediaPipe — nada de API paga nem
// mídia hospedada. Tudo é baixado sob demanda (chunk lazy, fora do precache)
// e roda no aparelho: a foto nunca sai do navegador.
//
// Requer estar online (o app já é online-only para dados do Supabase).

const MEDIAPIPE_VERSION = '0.10.35' // manter em sincronia com package.json
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

type Landmarker = {
  detect: (img: HTMLImageElement) => {
    landmarks?: { x: number; y: number; visibility?: number }[][]
  }
}

let landmarkerPromise: Promise<Landmarker> | null = null

function getLandmarker(): Promise<Landmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
      return PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: 'IMAGE',
        numPoses: 1,
      })
    })().catch((e) => {
      // falhou o download do wasm/modelo: permite tentar de novo
      landmarkerPromise = null
      throw e
    })
  }
  return landmarkerPromise
}

// crossOrigin anonymous: a URL assinada do Supabase serve com CORS liberado,
// e o detector precisa ler os pixels (imagem "tainted" não funcionaria).
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Não foi possível carregar a foto para a deteção.'))
    img.src = url
  })
}

// Detecta a pose na foto e devolve as formas sugeridas (pontos + linhas de
// ombros/quadris). Lança erro pt-BR quando não há pessoa detectável.
export async function detectPoseShapes(imageUrl: string): Promise<Shape[]> {
  const [img, landmarker] = await Promise.all([loadImage(imageUrl), getLandmarker()])
  const result = landmarker.detect(img)
  const landmarks = result.landmarks?.[0]
  if (!landmarks || landmarks.length === 0) {
    throw new Error('Nenhuma pessoa detectada na foto. Ajuste o enquadramento e tente de novo.')
  }
  const shapes = poseToShapes(landmarks)
  if (shapes.length === 0) {
    throw new Error('A deteção não encontrou pontos com confiança suficiente nesta foto.')
  }
  return shapes
}
