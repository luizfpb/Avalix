import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PRESCRIPTION,
  duplicateEditorDay,
  emptyEditorPlan,
  newEditorExercise,
  nextDayLabel,
  type EditorExercise,
  type EditorPlan,
} from './builder'
import { parseAliases } from './schema'

function ex(key: string, patch: Partial<EditorExercise> = {}): EditorExercise {
  return {
    key,
    exerciseId: `id-${key}`,
    sets: 4,
    reps: '6-8',
    rir: 1,
    restSeconds: 120,
    tempo: '3-0-1-0',
    notes: 'pegada aberta',
    groupKey: null,
    groupKind: null,
    technique: 'drop_set',
    ...patch,
  }
}

function sequencia(): () => string {
  let n = 0
  return () => `k${++n}`
}

describe('próxima letra da divisão', () => {
  it('usa a primeira letra livre, não a contagem', () => {
    expect(nextDayLabel([])).toBe('A')
    expect(nextDayLabel([{ label: 'A' }, { label: 'B' }])).toBe('C')
    expect(nextDayLabel([{ label: 'A' }, { label: 'C' }])).toBe('B')
    expect(nextDayLabel([{ label: 'a' }])).toBe('B')
  })

  it('passa para números depois do Z', () => {
    const todas = Array.from({ length: 26 }, (_, i) => ({ label: String.fromCharCode(65 + i) }))
    expect(nextDayLabel(todas)).toBe('27')
  })
})

describe('exercício novo na divisão', () => {
  it('divisão vazia usa o padrão', () => {
    const novo = newEditorExercise({ exercises: [] }, 'x', 'k')
    expect(novo).toMatchObject({ key: 'k', exerciseId: 'x', ...DEFAULT_PRESCRIPTION })
  })

  it('copia séries, reps, RIR e descanso do último, e nada além disso', () => {
    const novo = newEditorExercise({ exercises: [ex('a'), ex('b', { sets: 5, reps: null, rir: null })] }, 'x', 'k')
    expect(novo).toEqual({
      key: 'k',
      exerciseId: 'x',
      sets: 5,
      reps: null,
      rir: null,
      restSeconds: 120,
      tempo: null,
      notes: null,
      groupKey: null,
      groupKind: null,
      technique: null,
    })
  })
})

describe('duplicar divisão', () => {
  function plano(): EditorPlan {
    return {
      ...emptyEditorPlan(),
      weeklySchedule: ['A', 'B', 'A'],
      days: [
        {
          key: 'dA',
          label: 'A',
          name: 'Peito e tríceps',
          exercises: [
            ex('e1', { groupKey: 'g-1', groupKind: 'superset' }),
            ex('e2', { groupKey: 'g-1', groupKind: 'superset' }),
            ex('e3'),
          ],
        },
        { key: 'dB', label: 'B', name: null, exercises: [ex('e4')] },
      ],
      overrides: [
        { week: 4, exerciseKey: 'e1', sets: 2, reps: null, rir: null, restSeconds: null, isSkipped: false, notes: null },
        { week: 4, exerciseKey: 'e4', sets: 2, reps: null, rir: null, restSeconds: null, isSkipped: false, notes: null },
      ],
    }
  }

  it('põe a cópia logo depois, com a próxima letra livre e o nome marcado', () => {
    const next = duplicateEditorDay(plano(), 'dA', sequencia(), () => 'g-novo')
    expect(next.days.map((d) => d.label)).toEqual(['A', 'C', 'B'])
    expect(next.days[1].name).toBe('Peito e tríceps (cópia)')
    expect(next.weeklySchedule).toEqual(['A', 'B', 'A'])
  })

  it('cópia tem chaves novas, mantém a prescrição e o bloco vira outro bloco', () => {
    const original = plano()
    const next = duplicateEditorDay(original, 'dA', sequencia(), () => 'g-novo')
    const copia = next.days[1]
    expect(copia.exercises.map((e) => e.key)).toEqual(['k1', 'k2', 'k3'])
    expect(copia.key).toBe('k4')
    expect(copia.exercises.map((e) => e.groupKey)).toEqual(['g-novo', 'g-novo', null])
    expect(copia.exercises[0]).toMatchObject({ exerciseId: 'id-e1', sets: 4, notes: 'pegada aberta', tempo: '3-0-1-0', technique: 'drop_set' })
    expect(next.days[0]).toBe(original.days[0])
  })

  it('leva junto os ajustes por semana só dos exercícios copiados', () => {
    const next = duplicateEditorDay(plano(), 'dA', sequencia(), () => 'g-novo')
    expect(next.overrides.map((o) => o.exerciseKey)).toEqual(['e1', 'e4', 'k1'])
  })

  it('nome comprido não estoura os 80 caracteres do banco', () => {
    const p = plano()
    p.days[0].name = 'x'.repeat(80)
    const nome = duplicateEditorDay(p, 'dA', sequencia(), () => 'g')['days'][1].name!
    expect(nome.length).toBe(80)
    expect(nome.endsWith(' (cópia)')).toBe(true)
  })

  it('divisão inexistente não muda nada', () => {
    const p = plano()
    expect(duplicateEditorDay(p, 'nada', sequencia(), () => 'g')).toBe(p)
  })
})

describe('outros nomes do exercício', () => {
  it('separa por vírgula, ponto e vírgula ou linha e tira repetidos sem acento', () => {
    expect(parseAliases(' pulley, puxada  alta; Pulley\nPÚXADA ALTA, ')).toEqual(['pulley', 'puxada alta'])
    expect(parseAliases('')).toEqual([])
    expect(parseAliases(undefined)).toEqual([])
  })
})
