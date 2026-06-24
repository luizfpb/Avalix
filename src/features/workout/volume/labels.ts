import type { Equipment, MovementPattern, MuscleGroup, VolumeSnapshot } from './types'

// Rotulos pt-BR da taxonomia (a UI e o PDF leem daqui; o banco guarda as chaves
// em ingles). Espelha o papel de assessment/sites.ts.

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Peitoral',
  lats: 'Dorsal (latíssimo)',
  upper_back: 'Meio das costas',
  traps: 'Trapézio',
  front_delts: 'Deltoide anterior',
  side_delts: 'Deltoide lateral',
  rear_delts: 'Deltoide posterior',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  forearms: 'Antebraços',
  abs: 'Abdômen',
  obliques: 'Oblíquos',
  lower_back: 'Lombar (eretores)',
  quads: 'Quadríceps',
  hamstrings: 'Posteriores da coxa',
  glutes: 'Glúteos',
  adductors: 'Adutores',
  abductors: 'Abdutores',
  calves: 'Panturrilhas',
  neck: 'Pescoço',
}

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barra',
  ez_bar: 'Barra W',
  trap_bar: 'Trap bar',
  dumbbell: 'Halteres',
  kettlebell: 'Kettlebell',
  machine: 'Máquina',
  smith_machine: 'Smith',
  cable: 'Polia / cabo',
  bodyweight: 'Peso corporal',
  resistance_band: 'Faixa elástica',
  suspension: 'Suspensão (TRX)',
  plate: 'Anilha',
  medicine_ball: 'Medicine ball',
  other: 'Outro',
}

export const MOVEMENT_LABELS: Record<MovementPattern, string> = {
  horizontal_push: 'Empurrar horizontal',
  vertical_push: 'Empurrar vertical',
  horizontal_pull: 'Puxar horizontal',
  vertical_pull: 'Puxar vertical',
  squat: 'Agachamento',
  hinge: 'Dobradiça de quadril',
  lunge: 'Afundo / unilateral',
  carry: 'Carregamento',
  rotation: 'Rotação',
  isolation: 'Isolamento',
  core: 'Core',
}

// Agrupamento por regiao corporal — ordena selects, listas e o PDF. A ordem dos
// grupos aqui e a ordem canonica de exibicao do volume.
export const MUSCLE_REGIONS: { region: string; muscles: MuscleGroup[] }[] = [
  { region: 'Peito', muscles: ['chest'] },
  { region: 'Costas', muscles: ['lats', 'upper_back', 'traps'] },
  { region: 'Ombros', muscles: ['front_delts', 'side_delts', 'rear_delts'] },
  { region: 'Braços', muscles: ['biceps', 'triceps', 'forearms'] },
  { region: 'Core', muscles: ['abs', 'obliques', 'lower_back'] },
  {
    region: 'Pernas',
    muscles: ['quads', 'hamstrings', 'glutes', 'adductors', 'abductors', 'calves'],
  },
  { region: 'Pescoço', muscles: ['neck'] },
]

// Ordem canonica linear dos grupos (derivada das regioes).
export const MUSCLE_ORDER: MuscleGroup[] = MUSCLE_REGIONS.flatMap((r) => r.muscles)

export function muscleLabel(m: MuscleGroup): string {
  return MUSCLE_LABELS[m]
}

export function equipmentLabel(e: Equipment): string {
  return EQUIPMENT_LABELS[e]
}

export function movementLabel(p: MovementPattern): string {
  return MOVEMENT_LABELS[p]
}

// Objetivos do plano (workout_plans.goal): chaves em ingles no banco, pt-BR aqui.
export const GOAL_LABELS: Record<string, string> = {
  hypertrophy: 'Hipertrofia',
  strength: 'Força',
  endurance: 'Resistência muscular',
  fat_loss: 'Emagrecimento',
  conditioning: 'Condicionamento',
  rehab: 'Reabilitação',
  other: 'Outro',
}

export function goalLabel(goal: string | null): string {
  if (!goal) return 'Sem objetivo definido'
  return GOAL_LABELS[goal] ?? goal
}

// Linhas de volume (grupo + rótulo + séries) da semana típica, na ordem
// anatômica, só os grupos com volume > 0. Usado pelo painel e pelo PDF.
export type VolumeItem = { muscle: MuscleGroup; label: string; sets: number }

export function snapshotVolumeItems(snapshot: VolumeSnapshot): VolumeItem[] {
  return MUSCLE_ORDER.map((m) => ({
    muscle: m,
    label: MUSCLE_LABELS[m],
    sets: snapshot.typicalByMuscle[m] ?? 0,
  })).filter((it) => it.sets > 0)
}
