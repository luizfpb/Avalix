import { AlertTriangle, Info, ShieldAlert, ShieldCheck, type LucideIcon } from 'lucide-react'
import type { AlertaNivel } from './clearance'

// Ícone por nível de alerta da anamnese. Fica fora de clearance.ts para o
// módulo de decisão continuar puro (e testável sem React), e fora do
// AnamneseForm para o banner do builder de treino não arrastar o formulário
// inteiro para o chunk dele.
export const ALERTA_ICONE: Record<AlertaNivel, LucideIcon> = {
  ok: ShieldCheck,
  info: Info,
  atencao: AlertTriangle,
  critico: ShieldAlert,
}
