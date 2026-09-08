import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { estimateNotesHeight, estimateWorkoutExerciseHeight, generateWorkoutPdf, weekChangeGroups, weekPrescriptionRanges } from './workoutPdf'
import { registerReportFontsFrom } from './pdfFonts'
import type {
  WorkoutDayRow,
  WorkoutExerciseRow,
  WorkoutPlanRow,
  WorkoutWeekOverrideRow,
  WorkoutWeekRow,
} from '../workout/api'

registerReportFontsFrom(join(process.cwd(), 'public/fonts'))

// A seção "Organização por semana" imprimia o override inteiro, exercício por
// exercício: um mesociclo de 8 semanas com override em 6 exercícios virava 48
// linhas quase idênticas, repetindo o que a tabela da divisão já dizia. Estes
// testes fixam as duas regras que consertaram isso — comparar contra a
// prescrição base e agrupar quem sofreu a mesma alteração.

const dia = (id: string, label: string) => ({ id, label, position: 0 }) as unknown as WorkoutDayRow

const exercicio = (
  id: string,
  day_id: string,
  exercise_id: string,
  over: Partial<WorkoutExerciseRow> = {}
) =>
  ({
    id,
    day_id,
    exercise_id,
    position: 0,
    sets: 4,
    reps: '8-12',
    rir: 2,
    rest_seconds: 90,
    tempo: '2-0-2',
    notes: null,
    ...over,
  }) as unknown as WorkoutExerciseRow

const override = (
  id: string,
  workout_exercise_id: string,
  over: Partial<WorkoutWeekOverrideRow> = {}
) =>
  ({
    id,
    workout_exercise_id,
    week_number: 1,
    sets: null,
    reps: null,
    rir: null,
    rest_seconds: null,
    is_skipped: false,
    notes: null,
    ...over,
  }) as unknown as WorkoutWeekOverrideRow

const DIAS = [dia('dA', 'A'), dia('dB', 'B')]
const EXERCICIOS = [
  exercicio('e1', 'dA', 'x1'),
  exercicio('e2', 'dA', 'x2'),
  exercicio('e3', 'dB', 'x3'),
]
const NOMES = { x1: 'Supino reto', x2: 'Crucifixo', x3: 'Agachamento' }

const grupos = (overrides: WorkoutWeekOverrideRow[]) =>
  weekChangeGroups(overrides, EXERCICIOS, DIAS, NOMES)

describe('weekChangeGroups', () => {
  it('override que repete a prescrição base não vira linha nenhuma', () => {
    // é o caso mais comum na base: o override foi gravado com os mesmos
    // valores do exercício, e imprimi-lo só repetia a tabela acima
    expect(
      grupos([override('o1', 'e1', { sets: 4, reps: '8-12', rir: 2, rest_seconds: 90 })])
    ).toEqual([])
  })

  it('descreve só os campos que mudam', () => {
    const g = grupos([override('o1', 'e1', { sets: 6, reps: '8-12', rir: 2, rest_seconds: 90 })])
    expect(g).toHaveLength(1)
    expect(g[0].desc).toBe('6 séries')
    expect(g[0].desc).not.toContain('reps')
  })

  it('agrupa exercícios com a mesma alteração numa linha só', () => {
    const g = grupos([
      override('o1', 'e1', { sets: 6 }),
      override('o2', 'e2', { sets: 6 }),
      override('o3', 'e3', { sets: 6 }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].label).toBe('Todos os exercícios')
    expect(g[0].desc).toBe('6 séries')
  })

  it('alteração que cobre uma divisão inteira é nomeada pela divisão', () => {
    const g = grupos([override('o1', 'e1', { sets: 6 }), override('o2', 'e2', { sets: 6 })])
    expect(g).toEqual([{ label: 'Treino A · todos os exercícios', desc: '6 séries' }])
  })

  it('alteração parcial lista os exercícios, prefixados pela divisão', () => {
    const g = grupos([override('o1', 'e1', { sets: 6 })])
    expect(g).toEqual([{ label: 'A · Supino reto', desc: '6 séries' }])
  })

  it('separa grupos quando as alterações diferem', () => {
    const g = grupos([override('o1', 'e1', { sets: 6 }), override('o2', 'e2', { rir: 0 })])
    expect(g).toHaveLength(2)
    expect(g.map((x) => x.desc)).toEqual(['6 séries', 'RIR 0'])
  })

  it('exercício pulado é dito como tal, sem listar campo nenhum', () => {
    const g = grupos([override('o1', 'e1', { is_skipped: true, sets: 9 })])
    expect(g).toEqual([{ label: 'A · Supino reto', desc: 'não executar' }])
  })

  it('divisão de um exercício só é nomeada, não vira "todos os exercícios"', () => {
    // e3 é o único exercício do treino B: o atalho não economizaria nada e
    // ainda esconderia de qual exercício se fala
    const g = grupos([override('o1', 'e3', { sets: 6 })])
    expect(g).toEqual([{ label: 'B · Agachamento', desc: '6 séries' }])
  })

  it('semana sem override nenhum não gera grupo', () => {
    expect(grupos([])).toEqual([])
  })

  it('nota do override entra quando difere da nota do exercício', () => {
    const g = grupos([override('o1', 'e1', { notes: 'progredir carga' })])
    expect(g[0].desc).toBe('progredir carga')
  })
})

// A observação do profissional partia no meio entre duas páginas — justo o
// trecho que o aluno precisa ler inteiro. O bloco virou atômico, e é a
// estimativa de altura que decide até onde isso vale: acima do limite ele tem
// de voltar a quebrar, porque wrap={false} em bloco maior que a folha
// transborda sobreposto em vez de não partir.
const LONGA = Array.from(
  { length: 60 },
  (_, i) => `Linha ${i + 1}: aquecer bem antes de cada série pesada e registrar a carga usada.`
).join('\n')

// Render de fumaça: o plano de treino não tinha nenhum, e a falta custou caro
// — um `fontStyle: 'italic'` num estilo derrubava a geração inteira com
// "Could not resolve font for Manrope, fontStyle italic", porque pdfFonts só
// registra Manrope/Newsreader normais. Um erro assim não aparece em teste de
// função pura: só rendendo. As duas semanas cobrem os dois caminhos da seção
// (com alteração e sem).
describe('generateWorkoutPdf', () => {
  const plan = {
    id: 'p1',
    org_id: 'o1',
    subject_id: 's1',
    evaluator_id: 'u1',
    name: 'Mesociclo de teste',
    goal: 'hypertrophy',
    weeks: 2,
    starts_on: '2026-06-01',
    notes: 'Observação curta.',
    status: 'active',
    weekly_schedule: ['A', 'B'],
    volume: null,
  } as unknown as WorkoutPlanRow

  const semana = (n: number) =>
    ({ id: `w${n}`, week_number: n, label: null, is_deload: false }) as unknown as WorkoutWeekRow

  it('gera bytes com semana alterada e semana sem alteração', async () => {
    const blob = await generateWorkoutPdf({
      orgName: 'Estúdio Teste',
      subjectName: 'Fulano de Tal',
      evaluatorName: 'Prof. Beltrano (CREF 000000-G/SP)',
      plan,
      days: DIAS,
      exercises: EXERCICIOS,
      weeks: [semana(1), semana(2)],
      // semana 1 altera, semana 2 fica sem alteração nenhuma
      overrides: [override('o1', 'e1', { week_number: 1, sets: 6 })],
      exerciseNames: NOMES,
    })
    expect((await blob.arrayBuffer()).byteLength).toBeGreaterThan(1000)
  })

  // A faixa de bloco e o travessão de "sem faixa de reps" só existem no
  // caminho de render: um estilo inválido ou um `undefined` numa célula derruba
  // a geração inteira, e nenhum teste de função pura pegaria isso.
  it('gera bytes com super-série, circuito e exercício sem faixa de reps', async () => {
    const blob = await generateWorkoutPdf({
      orgName: 'Estúdio Teste',
      subjectName: 'Fulano de Tal',
      plan,
      days: DIAS,
      exercises: [
        exercicio('e1', 'dA', 'x1', { position: 0, group_key: 'g1', group_kind: 'superset' }),
        exercicio('e2', 'dA', 'x2', {
          position: 1,
          group_key: 'g1',
          group_kind: 'superset',
          technique: 'drop_set',
        }),
        exercicio('e3', 'dB', 'x3', { position: 0, group_key: 'g2', group_kind: 'circuit' }),
        exercicio('e4', 'dB', 'x4', { position: 1, group_key: 'g2', group_kind: 'circuit' }),
        exercicio('e5', 'dB', 'x5', { position: 2, reps: null, rir: null, rest_seconds: null }),
      ],
      weeks: [semana(1)],
      overrides: [],
      exerciseNames: { ...NOMES, x4: 'Afundo', x5: 'Prancha' },
    })
    expect((await blob.arrayBuffer()).byteLength).toBeGreaterThan(1000)
  })

  it('gera bytes com observação longa (bloco que volta a quebrar)', async () => {
    const blob = await generateWorkoutPdf({
      orgName: 'Estúdio Teste',
      subjectName: 'Fulano de Tal',
      plan: { ...plan, notes: LONGA } as unknown as WorkoutPlanRow,
      days: DIAS,
      exercises: EXERCICIOS,
      weeks: [semana(1)],
      overrides: [],
      exerciseNames: NOMES,
    })
    expect((await blob.arrayBuffer()).byteLength).toBeGreaterThan(1000)
  })

  it('pagina grupos extensos e uma nota de várias folhas após as semanas', async () => {
    // O break forçado nas notas depois de tabelas longas produzia dimensões
    // negativas no PDFKit; os testes com uma divisão curta não reproduziam.
    const exercises = Array.from({ length: 30 }, (_, i) => exercicio(`long${i}`, 'dA', `x${i}`, {
      position: i,
      group_key: i < 16 ? 'long-group' : null,
      group_kind: i < 16 ? 'circuit' : null,
      notes: 'Manter a execução estável e registrar a carga. '.repeat(i === 20 ? 40 : 4),
    }))
    const blob = await generateWorkoutPdf({
      orgName: 'Estúdio Teste', subjectName: 'Fulano de Tal',
      plan: { ...plan, notes: 'Conferir os ajustes da semana e comunicar dúvidas ao profissional. '.repeat(190) },
      days: [DIAS[0]], exercises,
      weeks: [semana(1), semana(2)],
      overrides: exercises.slice(0, 16).map((e, i) => override(`ol${i}`, e.id, {
        week_number: 2, notes: `Ajuste ${i}: conferir a execução antes de progredir a carga.`,
      })),
      exerciseNames: Object.fromEntries(exercises.map((e, i) => [e.exercise_id, `Exercício ${i + 1} com ajuste de amplitude e posicionamento`])),
    })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const pageCount = new TextDecoder().decode(bytes).match(/\/Type \/Page\b/g)?.length ?? 0
    expect(pageCount).toBeGreaterThan(3)
  })
})

describe('estimateNotesHeight', () => {
  it('observação curta cabe folgado numa folha', () => {
    expect(estimateNotesHeight('Aquecer 10 minutos antes.')).toBeLessThan(100)
  })

  it('cresce com as quebras de linha do texto', () => {
    const uma = estimateNotesHeight('Aquecer.')
    const cinco = estimateNotesHeight('Aquecer.\n\n\n\nAlongar.')
    expect(cinco).toBeGreaterThan(uma)
  })

  it('observação longa passa do limite de bloco atômico (560)', () => {
    expect(estimateNotesHeight(LONGA)).toBeGreaterThan(560)
  })

  it('observação de trinta linhas ainda cabe inteira numa folha', () => {
    // o caso do profissional detalhista, que é o ponto da correção: continua
    // abaixo do limite, logo continua atômica
    const trinta = Array.from({ length: 30 }, () => 'Série pesada com carga registrada.').join('\n')
    expect(estimateNotesHeight(trinta)).toBeLessThan(560)
  })
})

describe('paginação de exercícios', () => {
  it('inclui o texto completo de nomes e observações na estimativa', () => {
    const base = exercicio('e1', 'dA', 'x1')
    const short = estimateWorkoutExerciseHeight(base, 'Supino')
    expect(estimateWorkoutExerciseHeight(base, 'Supino com ajuste de amplitude '.repeat(30))).toBeGreaterThan(short)
    expect(estimateWorkoutExerciseHeight({ ...base, notes: LONGA }, 'Supino')).toBeGreaterThan(440)
  })
})

describe('weekPrescriptionRanges', () => {
  const week = (n: number, extra: Partial<WorkoutWeekRow> = {}) => ({
    id: `w${n}`, week_number: n, label: 'Acumulação', notes: null, is_deload: false, ...extra,
  }) as WorkoutWeekRow
  const data = (weeks: WorkoutWeekRow[], overrides: WorkoutWeekOverrideRow[] = []) => ({
    weeks, overrides, days: DIAS, exercises: EXERCICIOS, exerciseNames: NOMES,
  })

  it('resume semanas consecutivas com a mesma prescrição', () => {
    const result = weekPrescriptionRanges(data([week(1), week(2), week(3)], [
      override('o1', 'e1', { week_number: 1, sets: 6 }),
      override('o2', 'e1', { week_number: 2, sets: 6 }),
    ]))
    expect(result.map(({ first, last }) => [first, last])).toEqual([[1, 2], [3, 3]])
    expect(result[0].groups[0].desc).toBe('6 séries')
    expect(result[1].groups).toEqual([])
  })

  it('preserva notas, rótulos e deload como mudanças independentes', () => {
    const result = weekPrescriptionRanges(data([
      week(1), week(2, { notes: 'Reduzir amplitude.' }),
      week(3, { notes: 'Reduzir amplitude.', is_deload: true }),
      week(4, { label: 'Recuperação', notes: 'Reduzir amplitude.', is_deload: true }),
    ]))
    expect(result).toHaveLength(4)
    expect(result[1].notes).toBe('Reduzir amplitude.')
    expect(result[2].isDeload).toBe(true)
    expect(result[3].label).toBe('Recuperação')
  })

  it('não preenche lacunas nem perde semanas que só têm override', () => {
    const result = weekPrescriptionRanges(data([week(1), week(3)], [override('o5', 'e1', { week_number: 5, is_skipped: true })]))
    expect(result.map(({ first, last }) => [first, last])).toEqual([[1, 1], [3, 3], [5, 5]])
    expect(result[2].groups[0].desc).toBe('não executar')
  })

  it('não une alterações em linhas distintas que têm o mesmo nome', () => {
    const fixture = data([week(1), week(2)], [
      override('o1', 'e1', { week_number: 1, sets: 6 }),
      override('o2', 'e2', { week_number: 2, sets: 6 }),
    ])
    fixture.exercises = [EXERCICIOS[0], { ...EXERCICIOS[1], exercise_id: 'x1' }, EXERCICIOS[2]]
    const result = weekPrescriptionRanges(fixture)
    expect(result.map(({ first, last }) => [first, last])).toEqual([[1, 1], [2, 2]])
    // A referência numérica aponta para a ocorrência correta na tabela.
    expect(result[0].groups[0].label).toBe('A · 01 · Supino reto')
    expect(result[1].groups[0].label).toBe('A · 02 · Supino reto')
  })

  it('normaliza a ordem dos overrides e ignora campos que repetem a base', () => {
    const result = weekPrescriptionRanges(data([week(1), week(2)], [
      override('o1', 'e1', { week_number: 1, sets: 6 }),
      override('o2', 'e2', { week_number: 1, rir: 0 }),
      override('o3', 'e2', { week_number: 2, rir: 0, rest_seconds: 90 }),
      override('o4', 'e1', { week_number: 2, sets: 6, reps: '8-12' }),
    ]))
    expect(result.map(({ first, last }) => [first, last])).toEqual([[1, 2]])
  })

  it('distingue alteração numérica de uma nota com o mesmo texto impresso', () => {
    const result = weekPrescriptionRanges(data([week(1), week(2)], [
      override('o1', 'e1', { week_number: 1, sets: 6 }),
      override('o2', 'e1', { week_number: 2, notes: '6 séries' }),
    ]))
    expect(result.map(({ first, last }) => [first, last])).toEqual([[1, 1], [2, 2]])
    expect(result[0].groups[0].desc).toBe(result[1].groups[0].desc)
  })
})
