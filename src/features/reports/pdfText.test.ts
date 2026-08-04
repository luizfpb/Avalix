import { describe, expect, it } from 'vitest'
import { sanitizePdfText } from './pdfText'

// As fontes padrao do @react-pdf sao WinAnsi (CP1252). Caractere fora dessa
// tabela nao some nem lanca erro: vira OUTRO glifo no PDF entregue ao aluno.
// "RIR <= 2" escrito com o sinal matematico saia impresso como "RIR d 2".

describe('saneamento de texto do PDF', () => {
  it('preserva intacta a acentuacao do portugues (tudo Latin-1)', () => {
    const texto = 'Avaliação física · cadência · tríceps · panturrilha · José D’Ávila'
    expect(sanitizePdfText(texto)).toBe(texto)
  })

  it('preserva pontuacao tipografica que existe no CP1252', () => {
    const texto = '“aspas” ‘simples’ – travessao — longo • bullet … reticencias € 5 ² ³ ° ±'
    // ± nao esta no CP1252? esta (0xB1). Nada aqui pode ser alterado.
    expect(sanitizePdfText(texto)).toBe(texto)
  })

  it('translitera os simbolos que a fonte trocaria em silencio', () => {
    expect(sanitizePdfText('RIR ≤ 2')).toBe('RIR <= 2')
    expect(sanitizePdfText('RIR ≥ 3')).toBe('RIR >= 3')
    expect(sanitizePdfText('carga ≠ 100')).toBe('carga != 100')
    expect(sanitizePdfText('A → B')).toBe('A -> B')
    expect(sanitizePdfText('✓ feito')).toBe('OK feito')
  })

  it('remove emoji em vez de imprimir glifo errado', () => {
    expect(sanitizePdfText('forca 💪 total')).toBe('forca  total')
  })

  it('nao parte pares substitutos ao iterar', () => {
    // Emoji fora do BMP ocupa duas unidades UTF-16; iterar por unidade
    // produziria dois caracteres invalidos em vez de um descarte limpo.
    expect(sanitizePdfText('🏋️')).not.toMatch(/[\uD800-\uDFFF]/)
  })

  it('decompoe acento desconhecido para a letra base em vez de descartar', () => {
    // Latim estendido fora do CP1252 (ex.: s com caron ja esta no CP1252, mas
    // g com breve nao): vira a letra base, preservando a leitura.
    expect(sanitizePdfText('Erdoğan')).toBe('Erdogan')
  })

  it('mantem quebra de linha e tabulacao', () => {
    expect(sanitizePdfText('linha 1\nlinha 2\tfim')).toBe('linha 1\nlinha 2\tfim')
  })

  it('texto vazio e sem surpresa', () => {
    expect(sanitizePdfText('')).toBe('')
  })
})
