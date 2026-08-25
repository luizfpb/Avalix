import { describe, it, expect } from 'vitest'
import {
  ALTURA_UTIL_A4,
  LIMITE_BLOCO_ATOMICO,
  charsPerLine,
  countWrappedLines,
  estimateTextHeight,
} from './pdfLayout'

// Esta conta decide se um bloco de texto é atômico (wrap={false}) ou tem de
// partir. Errar para menos é o caso perigoso: wrap={false} num bloco maior que
// a folha não deixa de partir, TRANSBORDA sobreposto e ilegível. Por isso os
// testes fixam o sentido do erro, não um número exato de linhas.

describe('countWrappedLines', () => {
  it('conta as quebras explícitas do texto', () => {
    expect(countWrappedLines('uma\nduas\ntres', 80)).toBe(3)
  })

  it('linha em branco entre parágrafos também conta', () => {
    expect(countWrappedLines('uma\n\nduas', 80)).toBe(3)
  })

  it('quebra por palavra quando a linha estoura', () => {
    // 3 palavras de 10 caracteres numa linha de 12: uma por linha
    expect(countWrappedLines('palavradez palavradez palavradez', 12)).toBe(3)
  })

  it('não parte palavra que cabe na linha', () => {
    expect(countWrappedLines('palavradez palavradez', 25)).toBe(1)
  })

  it('palavra maior que a linha inteira parte dentro dela mesma', () => {
    // o renderer faz isso com URL colada sem espaço
    expect(countWrappedLines('a'.repeat(50), 10)).toBe(5)
  })

  it('texto vazio ainda ocupa uma linha', () => {
    expect(countWrappedLines('', 80)).toBe(1)
  })
})

describe('charsPerLine', () => {
  it('estima por cima da largura real do caractere', () => {
    // Manrope 400 mede 0,483em por caractere em texto corrido em português
    // (fontkit, medido em manrope-400.ttf). A conta usa 0,52em, então tem de
    // caber MENOS caractere na estimativa do que na renderização real — é essa
    // folga que impede o bloco de transbordar.
    const real = Math.floor(496 / (9.5 * 0.483))
    expect(charsPerLine(9.5, 496)).toBeLessThan(real)
  })

  it('nunca devolve zero, mesmo numa largura absurda', () => {
    expect(charsPerLine(10, 1)).toBe(1)
  })
})

describe('estimateTextHeight', () => {
  it('cresce com o tamanho do texto', () => {
    const curto = estimateTextHeight({ text: 'Aquecer.', fontSize: 10, lineHeight: 1.4, width: 500 })
    const longo = estimateTextHeight({
      text: 'Aquecer bem antes de cada serie pesada. '.repeat(20),
      fontSize: 10,
      lineHeight: 1.4,
      width: 500,
    })
    expect(longo).toBeGreaterThan(curto)
  })

  it('o pior caso plausível no limite atômico ainda cabe na folha', () => {
    // Texto todo em maiúsculas é o mais largo que aparece na prática (~0,62em
    // por caractere): mesmo assim, um bloco estimado no limite não pode passar
    // da altura útil da folha, senão wrap={false} transbordaria.
    const piorCaso = LIMITE_BLOCO_ATOMICO * (0.62 / 0.52)
    expect(piorCaso).toBeLessThan(ALTURA_UTIL_A4)
  })
})
