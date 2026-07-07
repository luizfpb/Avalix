import { newId, type Pt, type Shape } from './annotations'

// Deteção postural assistida (P7 da auditoria v2.0): converte os landmarks do
// MediaPipe Pose em SUGESTÃO de anotações (pontos + linhas de referência).
// Princípios:
//   - é sugestão, não diagnóstico: o profissional ajusta/apaga cada marca
//     (mesma transparência do gate e das contra-rules);
//   - os landmarks do MediaPipe já saem NORMALIZADOS (0..1 relativos à
//     imagem) — exatamente o espaço do AnnotationCanvas, sem conversão;
//   - tudo roda no aparelho (a foto não sai do navegador).
//
// Índices do MediaPipe Pose (33 landmarks): 7/8 orelhas, 11/12 ombros,
// 23/24 quadris, 25/26 joelhos, 27/28 tornozelos.

export type PoseLandmark = { x: number; y: number; visibility?: number }

export const POSE_ENGINE_VERSION = 'pose-suggest@1'

// pares [esquerdo, direito] que viram LINHAS (mostram inclinação na UI)
const LINE_PAIRS: [number, number][] = [
  [11, 12], // ombros
  [23, 24], // quadris
]

// pontos individuais sugeridos (referências vertical/laterais)
const POINT_INDICES: number[] = [7, 8, 25, 26, 27, 28]

const MIN_VISIBILITY = 0.5

function usable(lm: PoseLandmark | undefined, minVisibility: number): lm is PoseLandmark {
  if (!lm) return false
  if (lm.visibility != null && lm.visibility < minVisibility) return false
  return Number.isFinite(lm.x) && Number.isFinite(lm.y)
}

function toPt(lm: PoseLandmark): Pt {
  // clamp: landmark estimado pode sair marginalmente fora da imagem
  return { x: Math.min(1, Math.max(0, lm.x)), y: Math.min(1, Math.max(0, lm.y)) }
}

// Landmarks -> formas do AnnotationCanvas. Só entra o que o modelo enxergou
// com confiança (visibility >= minVisibility); linha exige os dois lados.
export function poseToShapes(
  landmarks: PoseLandmark[],
  minVisibility = MIN_VISIBILITY
): Shape[] {
  const shapes: Shape[] = []

  for (const [a, b] of LINE_PAIRS) {
    const la = landmarks[a]
    const lb = landmarks[b]
    if (usable(la, minVisibility) && usable(lb, minVisibility)) {
      shapes.push({ id: newId(), type: 'line', points: [toPt(la), toPt(lb)] })
    }
  }

  for (const i of POINT_INDICES) {
    const lm = landmarks[i]
    if (usable(lm, minVisibility)) {
      shapes.push({ id: newId(), type: 'point', points: [toPt(lm)] })
    }
  }

  return shapes
}
