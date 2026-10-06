import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { generateWorkoutPdf } from './workoutPdf'
import { registerReportFontsFrom } from './pdfFonts'
import type { WorkoutDayRow, WorkoutExerciseRow, WorkoutPlanRow } from '../workout/api'

registerReportFontsFrom(join(process.cwd(), 'public/fonts'))

// Auditoria de 06/10/2026, A12: no plano longo, o título da divisão e o
// cabeçalho da tabela ficavam no pé da folha e o primeiro exercício ia para a
// seguinte. A conferência é pelo texto de cada página do PDF gerado.

// Texto de cada página, sem o Poppler (que não existe no CI). O react-pdf grava
// fontes Type0 com Identity-H e tabela ToUnicode: o texto sai dos operadores
// de texto de cada página, traduzido por essa tabela. Cada string vira uma
// linha, o que basta para procurar trechos.
function textoPorPagina(bytes: Uint8Array): string[] {
  const pdf = Buffer.from(bytes)
  const s = pdf.toString('latin1')
  const objetos = new Map<number, { dict: string; stream?: Buffer }>()
  const cabecalho = /(\d+) 0 obj\s*/g
  for (let m = cabecalho.exec(s); m; m = cabecalho.exec(s)) {
    const inicio = m.index + m[0].length
    const fim = s.indexOf('endobj', inicio)
    const iStream = s.indexOf('stream', inicio)
    if (iStream !== -1 && iStream < fim) {
      const dict = s.slice(inicio, iStream)
      let dados = iStream + 'stream'.length
      if (s[dados] === '\r') dados++
      if (s[dados] === '\n') dados++
      const tamanho = Number(/\/Length (\d+)/.exec(dict)?.[1] ?? s.indexOf('endstream', dados) - dados)
      const cru = pdf.subarray(dados, dados + tamanho)
      objetos.set(Number(m[1]), { dict, stream: /\/FlateDecode/.test(dict) ? inflateSync(cru) : cru })
      cabecalho.lastIndex = dados + tamanho
    } else {
      objetos.set(Number(m[1]), { dict: s.slice(inicio, fim) })
      cabecalho.lastIndex = fim
    }
  }
  const ref = (texto: string, chave: string) => Number(new RegExp(`/${chave} (\\d+) 0 R`).exec(texto)?.[1])
  const unicode = (hex: string) => String.fromCharCode(...(hex.match(/.{4}/g) ?? []).map((h) => parseInt(h, 16)))
  function tabela(numero: number): Map<number, string> {
    const texto = objetos.get(numero)?.stream?.toString('latin1') ?? ''
    const mapa = new Map<number, string>()
    for (const bloco of texto.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const [, de, para] of bloco[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
        mapa.set(parseInt(de, 16), unicode(para))
      }
    }
    for (const bloco of texto.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const [, de, ate, destino] of bloco[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)/g)) {
        const a = parseInt(de, 16)
        const b = parseInt(ate, 16)
        const lista = destino.startsWith('[') ? [...destino.matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => unicode(x[1])) : null
        const base = lista ? 0 : parseInt(destino.slice(1, -1), 16)
        for (let c = a; c <= b; c++) mapa.set(c, lista ? lista[c - a] ?? '' : String.fromCharCode(base + c - a))
      }
    }
    return mapa
  }
  const raiz = [...objetos.values()].find((o) => /\/Type \/Pages\b/.test(o.dict))!
  const paginas = [...(/\/Kids \[([^\]]*)\]/.exec(raiz.dict)?.[1] ?? '').matchAll(/(\d+) 0 R/g)].map((x) => Number(x[1]))
  return paginas.map((numero) => {
    const pagina = objetos.get(numero)!.dict
    const recursos = /\/Resources (\d+) 0 R/.test(pagina) ? objetos.get(ref(pagina, 'Resources'))!.dict : pagina
    const fontes = new Map<string, Map<number, string>>()
    for (const [, nome, obj] of (/\/Font\s*<<([\s\S]*?)>>/.exec(recursos)?.[1] ?? '').matchAll(/\/(\S+)\s+(\d+) 0 R/g)) {
      fontes.set(nome, tabela(ref(objetos.get(Number(obj))!.dict, 'ToUnicode')))
    }
    const conteudo = objetos.get(ref(pagina, 'Contents'))!.stream!.toString('latin1')
    let fonte = new Map<number, string>()
    const decodificar = (hex: string) =>
      (hex.match(/.{4}/g) ?? []).map((c) => fonte.get(parseInt(c, 16)) ?? '').join('')
    const linhas: string[] = []
    // Tf troca a fonte; cada TJ (glifos separados por ajustes de espaçamento)
    // ou Tj é um trecho de linha.
    const operacoes = /\/(\S+)\s+[\d.]+\s+Tf|\[((?:\s*(?:<[0-9a-fA-F]*>|-?[\d.]+))*)\s*\]\s*TJ|<([0-9a-fA-F]+)>\s*Tj/g
    for (const [, nome, arranjo, simples] of conteudo.matchAll(operacoes)) {
      if (nome) fonte = fontes.get(nome) ?? new Map()
      else if (arranjo != null) linhas.push([...arranjo.matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => decodificar(x[1])).join(''))
      else linhas.push(decodificar(simples))
    }
    return linhas.join('\n')
  })
}

const dia = (id: string, label: string, name: string, position: number) =>
  ({ id, label, name, position }) as unknown as WorkoutDayRow

const exercicio = (id: string, day_id: string, position: number, over: Partial<WorkoutExerciseRow> = {}) =>
  ({
    id, day_id, exercise_id: `${id}-catalogo`, position, sets: 3, reps: '8-12', rir: 2, rest_seconds: 90,
    tempo: '2-0-2', notes: 'Manter a execução estável e registrar a carga para discutir com o profissional.',
    ...over,
  }) as unknown as WorkoutExerciseRow

const plano = {
  id: 'p1', org_id: 'o1', subject_id: 's1', evaluator_id: 'u1', name: 'Plano de teste',
  goal: 'hypertrophy', weeks: 4, starts_on: '2026-10-05', notes: null, status: 'active',
  weekly_schedule: ['A', 'B'], volume: null,
} as unknown as WorkoutPlanRow

// O treino A tem de 1 a 13 exercícios, e o título do B cai em alturas
// diferentes da folha; o B abre com um circuito de 16, cujo primeiro segmento
// não se parte. Com o defeito, várias destas alturas deixavam o título sozinho.
describe('paginação do plano de treino', () => {
  it('o título da divisão nunca fica no pé da folha sem o primeiro exercício', async () => {
    for (let quantos = 1; quantos <= 13; quantos += 2) {
      const exercicios = [
        ...Array.from({ length: quantos }, (_, i) => exercicio(`a${i}`, 'dA', i)),
        ...Array.from({ length: 16 }, (_, i) => exercicio(`b${i}`, 'dB', i, { group_key: 'circuito', group_kind: 'circuit' })),
      ]
      const nomes = Object.fromEntries(exercicios.map((ex) => [
        ex.exercise_id,
        ex.day_id === 'dA'
          ? `Puxada ${ex.position + 1} com ajuste de amplitude e posicionamento`
          : `Agachamento ${String(ex.position + 1).padStart(2, '0')} com ajuste de amplitude`,
      ]))
      const blob = await generateWorkoutPdf({
        orgName: 'Estúdio Teste', subjectName: 'Fulano de Tal', plan: plano,
        days: [dia('dA', 'A', 'Membros superiores', 0), dia('dB', 'B', 'Membros inferiores', 1)],
        exercises: exercicios, weeks: [], overrides: [], exerciseNames: nomes,
      })
      // Trechos corridos: "Treino " e "B" saem em operações separadas.
      const paginas = textoPorPagina(new Uint8Array(await blob.arrayBuffer())).map((texto) => texto.split('\n').join(''))
      const comTitulo = paginas.findIndex((texto) => texto.includes('Membros inferiores'))
      expect(comTitulo, `A com ${quantos} exercícios`).toBeGreaterThanOrEqual(0)
      expect(paginas[comTitulo], `A com ${quantos} exercícios`).toContain('Agachamento 01 com')
      // cabeçalho da tabela do B sem nenhuma linha do B embaixo
      for (const [n, texto] of paginas.entries()) {
        if (texto.includes('Exercício · Treino B') && !texto.includes('Membros inferiores')) {
          expect(texto, `A com ${quantos} exercícios, página ${n + 1}`).toMatch(/Agachamento \d\d com/)
        }
      }
    }
  }, 60_000)
})
