import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildSets,
  CORRECTED_SESSION_MESSAGE,
  flushQueue,
  isInvalidStudentLinkError,
  isNetworkFailure,
  isStudentLinkExpired,
  reconcileSetRows,
  resolveStudentToken,
  suggestedWorkoutDayId,
  withStudentSyncLock,
} from './studentSession'
import { loadStudentToken, type QueuedSession } from './studentStore'

const queueMocks = vi.hoisted(() => ({
  readQueue: vi.fn(), dequeueSession: vi.fn(), markSessionRejected: vi.fn(), submitSession: vi.fn(),
}))
vi.mock('./studentStore', async (original) => ({
  ...(await original<typeof import('./studentStore')>()),
  readQueue: queueMocks.readQueue,
  dequeueSession: queueMocks.dequeueSession,
  markSessionRejected: queueMocks.markSessionRejected,
  markSessionRetry: vi.fn(),
}))
vi.mock('./studentApi', async (original) => ({
  ...(await original<typeof import('./studentApi')>()),
  submitSession: queueMocks.submitSession,
}))

const TOKEN = 'A'.repeat(43)

function localStorageFake() {
  const dados = new Map<string, string>()
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
    clear: () => dados.clear(),
    key: (i: number) => [...dados.keys()][i] ?? null,
    get length() {
      return dados.size
    },
  } as unknown as Storage
}

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageFake())
  queueMocks.readQueue.mockReset().mockResolvedValue([])
  queueMocks.dequeueSession.mockReset().mockResolvedValue(undefined)
  queueMocks.markSessionRejected.mockReset().mockResolvedValue(undefined)
  queueMocks.submitSession.mockReset().mockResolvedValue({ logId: 'log-1', stale: false })
})

describe('resolveStudentToken', () => {
  it('captura o token do fragmento e limpa a URL', () => {
    const replaceState = vi.fn()
    const token = resolveStudentToken(
      { pathname: '/t', hash: `#${TOKEN}`, search: '' },
      { replaceState, state: null }
    )
    expect(token).toBe(TOKEN)
    // o token não pode ficar na barra de endereço nem no histórico: quem pega
    // o aparelho na mão leria a credencial
    expect(replaceState).toHaveBeenCalledWith(null, '', '/t')
  })

  it('guarda o token para a página abrir depois sem fragmento', () => {
    resolveStudentToken({ pathname: '/t', hash: `#${TOKEN}`, search: '' }, { replaceState: vi.fn(), state: null })
    expect(loadStudentToken()).toBe(TOKEN)

    // é isto que faz o app instalado (start_url /t, sem #) e o modo offline
    // continuarem funcionando
    const semFragmento = resolveStudentToken(
      { pathname: '/t', hash: '', search: '' },
      { replaceState: vi.fn(), state: null }
    )
    expect(semFragmento).toBe(TOKEN)
  })

  it('token malformado explícito não cai no treino antigo guardado', () => {
    resolveStudentToken({ pathname: '/t', hash: `#${TOKEN}`, search: '' }, { replaceState: vi.fn(), state: null })
    const resultado = resolveStudentToken(
      { pathname: '/t', hash: '#nao-e-um-token', search: '' },
      { replaceState: vi.fn(), state: null }
    )
    expect(resultado).toBeNull()
    expect(loadStudentToken()).toBe(TOKEN)
  })

  it('sem token nenhum devolve null', () => {
    expect(
      resolveStudentToken({ pathname: '/t', hash: '', search: '' }, { replaceState: vi.fn(), state: null })
    ).toBeNull()
  })
})

describe('grade e divisão sugerida', () => {
  it('acrescenta séries prescritas e remove apenas excedentes vazios', () => {
    const preenchida = { weight: '40', reps: '10', rir: '2' }
    const vazia = { weight: '', reps: '', rir: '', rest: '', failure: false }

    expect(reconcileSetRows([preenchida], 3)).toEqual([preenchida, vazia, vazia])
    expect(reconcileSetRows([preenchida, vazia, vazia], 1)).toEqual([preenchida])
    expect(reconcileSetRows([preenchida, { weight: '42', reps: '8', rir: '' }], 1)).toHaveLength(2)
  })

  it('preserva descanso preenchido ao diminuir a prescrição e aceita rascunho legado', () => {
    const legado = { weight: '40', reps: '10', rir: '' }
    const descanso = { weight: '', reps: '', rir: '', rest: '0' }
    expect(reconcileSetRows([legado, descanso], 1)).toEqual([legado, descanso])
    expect(reconcileSetRows([legado, { weight: '', reps: '', rir: '' }], 1)).toEqual([legado])
  })

  it('não apaga uma marcação de falha ao diminuir as séries prescritas', () => {
    const falha = { weight: '', reps: '', rir: '', failure: true }
    expect(reconcileSetRows([falha], 0)).toEqual([falha])
    expect(reconcileSetRows([{ ...falha, failure: false }], 0)).toEqual([])
  })

  it('usa a sequência semanal e a quantidade concluída para sugerir a próxima divisão', () => {
    const days = [
      { id: 'd-a', label: 'A' },
      { id: 'd-b', label: 'B' },
    ]
    expect(suggestedWorkoutDayId(['A', 'B', 'A'], days, 0)).toBe('d-a')
    expect(suggestedWorkoutDayId(['A', 'B', 'A'], days, 1)).toBe('d-b')
    expect(suggestedWorkoutDayId(['A', 'B', 'A'], days, 2)).toBe('d-a')
    expect(suggestedWorkoutDayId(['A', 'B', 'A'], days, 3)).toBe('d-a')
  })
})

describe('serialização do envio', () => {
  it('não deixa o flush antigo correr em paralelo com um envio mais novo do mesmo link', async () => {
    const events: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const first = withStudentSyncLock('mesmo-escopo', async () => {
      events.push('primeiro:inicio')
      await gate
      events.push('primeiro:fim')
    })
    await Promise.resolve()
    const second = withStudentSyncLock('mesmo-escopo', async () => {
      events.push('segundo:inicio')
      events.push('segundo:fim')
    })
    await Promise.resolve()

    expect(events).toEqual(['primeiro:inicio'])
    release()
    await Promise.all([first, second])
    expect(events).toEqual([
      'primeiro:inicio',
      'primeiro:fim',
      'segundo:inicio',
      'segundo:fim',
    ])
  })
})

describe('isNetworkFailure', () => {
  // A distinção decide o destino da fila: falha de rede mantém a sessão para
  // reenviar; recusa do servidor tira da fila com aviso. Errar isso é ou perder
  // o treino do aluno, ou insistir para sempre num envio que nunca vai passar.
  it('reconhece falha de conexão', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkFailure({ message: 'NetworkError when attempting to fetch resource' })).toBe(true)
    expect(isNetworkFailure({ message: 'Load failed' })).toBe(true)
  })

  it('não confunde recusa do servidor com falta de rede', () => {
    expect(isNetworkFailure({ message: 'link invalido ou expirado' })).toBe(false)
    expect(isNetworkFailure({ message: 'limite de sessoes para esta data' })).toBe(false)
    expect(isNetworkFailure({ message: 'exercicio desconhecido' })).toBe(false)
  })
})

describe('revogação e expiração do link', () => {
  it('reconhece somente a recusa inequívoca da credencial', () => {
    expect(isInvalidStudentLinkError({ message: 'link invalido ou expirado' })).toBe(true)
    expect(isInvalidStudentLinkError({ message: 'plano nao pertence a este aluno' })).toBe(false)
  })

  it('considera expirado no instante limite', () => {
    expect(isStudentLinkExpired('2026-08-26T12:00:00Z', Date.parse('2026-08-26T12:00:00Z'))).toBe(true)
    expect(isStudentLinkExpired('2026-08-26T12:00:01Z', Date.parse('2026-08-26T12:00:00Z'))).toBe(false)
    expect(isStudentLinkExpired('validade-corrompida')).toBe(true)
    expect(isStudentLinkExpired(undefined)).toBe(false)
  })
})

describe('buildSets', () => {
  const exercicios = [
    { id: 'we1', exercise_id: 'x1' },
    { id: 'we2', exercise_id: 'x2' },
  ]

  it('numera as séries por exercício, não por sessão', () => {
    // a unique do banco é (log, exercício, nº da série): numerar corrido
    // derrubaria o segundo exercício
    const sets = buildSets(
      {
        we1: [
          { weight: '40', reps: '10', rir: '2' },
          { weight: '42.5', reps: '8', rir: '1' },
        ],
        we2: [{ weight: '60', reps: '12', rir: '3' }],
      },
      exercicios
    )
    expect(sets).toEqual([
      { exercise_id: 'x1', set_number: 1, weight_kg: 40, reps: 10, rir: 2, rest_seconds: null, reached_failure: null },
      { exercise_id: 'x1', set_number: 2, weight_kg: 42.5, reps: 8, rir: 1, rest_seconds: null, reached_failure: null },
      { exercise_id: 'x2', set_number: 1, weight_kg: 60, reps: 12, rir: 3, rest_seconds: null, reached_failure: null },
    ])
  })

  it('linha em branco é série não feita, e não vai para o banco', () => {
    const sets = buildSets(
      {
        we1: [
          { weight: '40', reps: '10', rir: '' },
          { weight: '', reps: '', rir: '' },
        ],
      },
      exercicios
    )
    expect(sets).toHaveLength(1)
    expect(sets[0].rir).toBeNull()
  })

  it('série só com repetições conta (peso do corpo)', () => {
    const sets = buildSets({ we1: [{ weight: '', reps: '15', rir: '1' }] }, exercicios)
    expect(sets).toEqual([
      { exercise_id: 'x1', set_number: 1, weight_kg: null, reps: 15, rir: 1, rest_seconds: null, reached_failure: null },
    ])
  })

  it('grava o descanso de cada série, preservando zero e branco como valores diferentes', () => {
    const sets = buildSets({
      we1: [
        { weight: '40', reps: '10', rir: '', rest: '90' },
        { weight: '40', reps: '8', rir: '', rest: '0' },
        { weight: '40', reps: '6', rir: '', rest: '' },
      ],
    }, exercicios)
    expect(sets.map((set) => set.rest_seconds)).toEqual([90, 0, null])
  })

  it('RIR zero não vira falha sem marcação explícita, inclusive em rascunho legado', () => {
    const sets = buildSets({ we1: [
      { weight: '40', reps: '10', rir: '0', failure: true },
      { weight: '40', reps: '10', rir: '0', failure: false },
      { weight: '40', reps: '10', rir: '0' },
    ] }, exercicios)
    expect(sets.map((set) => set.reached_failure)).toEqual([true, false, null])
    expect(sets.map((set) => set.rir)).toEqual([0, 0, 0])
  })

  it('recusa falha incompatível com RIR maior que zero antes de montar o envio', () => {
    expect(() => buildSets({ we1: [
      { weight: '40', reps: '10', rir: '2', failure: true },
    ] }, exercicios)).toThrow(/falha/i)
  })

  it.each(['-1', '1.5', '3601', 'abc', 'Infinity'])(
    'recusa descanso inválido %s sem perder a série silenciosamente', (rest) => {
      expect(() => buildSets({ we1: [{ weight: '40', reps: '10', rir: '', rest }] }, exercicios))
        .toThrow(/descanso em segundos inteiros/)
    }
  )

  it('descanso isolado não vira série feita nem é descartado silenciosamente', () => {
    expect(() => buildSets({ we1: [{ weight: '', reps: '', rir: '', rest: '60' }] }, exercicios))
      .toThrow(/carga ou as repetições/)
  })

  it('só valida descanso dos exercícios que pertencem à sessão enviada', () => {
    const sets = buildSets({
      we1: [{ weight: '40', reps: '10', rir: '', rest: '60' }],
      outroDia: [{ weight: '', reps: '', rir: '', rest: 'abc' }],
    }, exercicios)
    expect(sets).toHaveLength(1)
    expect(sets[0].rest_seconds).toBe(60)
  })

  it('texto inválido não vira NaN no payload', () => {
    const sets = buildSets({ we1: [{ weight: 'abc', reps: '10', rir: '' }] }, exercicios)
    expect(sets).toEqual([])
  })

  it('exercício sem linha nenhuma não gera série', () => {
    expect(buildSets({}, exercicios)).toEqual([])
  })

  // Acontece quando o plano é editado no meio da sessão: o exercício trocado,
  // vindo de outra divisão, passa a existir também no dia. Numerado por linha
  // do plano, o envio inteiro seria recusado por série repetida.
  it('o mesmo exercício em duas grades continua a numeração, e não recomeça', () => {
    const sets = buildSets(
      {
        we1: [{ weight: '40', reps: '10', rir: '' }],
        we3: [{ weight: '42.5', reps: '8', rir: '' }],
      },
      [...exercicios, { id: 'we3', exercise_id: 'x1' }]
    )
    expect(sets.map((s) => [s.exercise_id, s.set_number])).toEqual([
      ['x1', 1],
      ['x1', 2],
    ])
  })
})

describe('reenvio após edição no histórico', () => {
  it('mantém o envio antigo visível como recusado sem sobrescrever a correção nem reenviar', async () => {
    const queued: QueuedSession = {
      clientRef: 'ref-1', revision: 3, planId: 'plan-1', dayLabel: 'A', weekNumber: 1,
      performedAt: '2026-09-08', notes: null, queuedAt: '2026-09-08T15:00:00Z',
      sets: [{ exercise_id: 'ex-1', set_number: 1, weight_kg: 40, reps: 10, rir: 0,
        reached_failure: true }],
    }
    queueMocks.readQueue.mockResolvedValue([queued])
    queueMocks.submitSession.mockResolvedValue({ logId: 'log-1', stale: true, corrected: true })
    queueMocks.markSessionRejected.mockImplementation(async (_scope, _ref, message: string) => {
      queued.error = message
    })
    expect(await flushQueue(TOKEN, 'scope-1')).toEqual({
      sent: 0, pending: 0,
      rejected: [{ clientRef: 'ref-1', message: CORRECTED_SESSION_MESSAGE }],
    })
    expect(queueMocks.markSessionRejected).toHaveBeenCalledWith('scope-1', 'ref-1', CORRECTED_SESSION_MESSAGE, expect.any(Object), 3)
    expect(queueMocks.dequeueSession).not.toHaveBeenCalled()
    expect(await flushQueue(TOKEN, 'scope-1')).toEqual({ sent: 0, pending: 0, rejected: [] })
    expect(queueMocks.submitSession).toHaveBeenCalledTimes(1)
    expect(queued.sets[0].reached_failure).toBe(true)
  })

  it('continua retirando da fila o replay antigo de uma revisão normal já salva', async () => {
    const queued: QueuedSession = {
      clientRef: 'ref-1', revision: 2, planId: 'plan-1', dayLabel: 'A', weekNumber: 1,
      performedAt: '2026-09-08', notes: null, queuedAt: '2026-09-08T15:00:00Z', sets: [],
    }
    queueMocks.readQueue.mockResolvedValueOnce([queued]).mockResolvedValue([])
    queueMocks.submitSession.mockResolvedValue({ logId: 'log-1', stale: true })
    expect(await flushQueue(TOKEN, 'scope-1')).toEqual({ sent: 1, pending: 0, rejected: [] })
    expect(queueMocks.dequeueSession).toHaveBeenCalledWith('scope-1', 'ref-1', true, expect.any(Object), 2)
    expect(queueMocks.markSessionRejected).not.toHaveBeenCalled()
  })
})
