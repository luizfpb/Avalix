// Estimativa de altura de texto para decidir PAGINAÇÃO no @react-pdf.
//
// Existe porque o renderer não diz de antemão quanto um bloco vai medir, e a
// decisão "esse bloco cabe inteiro numa folha?" precisa ser tomada ANTES de
// renderizar — é ela que separa o bloco atômico (wrap={false}, não parte) do
// bloco que tem de partir. Errar para menos é o que não pode: wrap={false} num
// bloco maior que a folha não impede a quebra, TRANSBORDA sobreposto e
// ilegível. Por isso a conta estima por cima em todos os arredondamentos.
//
// Grosseira de propósito: quem usa deixa folga larga entre o limite de bloco
// atômico e a altura útil da folha (760 pt no A4 com as margens de pdfTheme).

// Largura média de caractere em Manrope 400, como fração do corpo. Medida na
// renderização real: 111 caracteres de texto corrido em português couberam nos
// 496 pt da linha do PDF de treino, ou seja 0,47em. 0,52 estima por cima de
// propósito — o erro da conta tem de sobrar linha, nunca faltar.
const LARGURA_MEDIA_CARACTERE = 0.52

// Quantos caracteres cabem numa linha de `width` pontos no corpo `fontSize`.
export function charsPerLine(fontSize: number, width: number): number {
  return Math.max(1, Math.floor(width / (fontSize * LARGURA_MEDIA_CARACTERE)))
}

// Linhas que o texto ocupa, contando as quebras explícitas e a quebra por
// palavra (o renderer não parte palavra no meio, salvo quando ela sozinha é
// maior que a linha).
export function countWrappedLines(text: string, chars: number): number {
  let linhas = 0
  for (const paragrafo of text.split('\n')) {
    const palavras = paragrafo.split(/\s+/).filter(Boolean)
    if (palavras.length === 0) {
      linhas += 1 // linha em branco entre parágrafos também ocupa altura
      continue
    }
    let atual = 0
    for (const palavra of palavras) {
      if (palavra.length > chars) {
        // palavra maior que a linha inteira (URL colada, por exemplo): quebra
        // dentro dela mesma
        linhas += Math.ceil(palavra.length / chars)
        atual = palavra.length % chars
      } else if (atual === 0) {
        linhas += 1
        atual = palavra.length
      } else if (atual + 1 + palavra.length > chars) {
        linhas += 1
        atual = palavra.length
      } else {
        atual += 1 + palavra.length
      }
    }
  }
  return linhas
}

// Altura estimada de um texto corrido, em pontos.
export function estimateTextHeight({
  text,
  fontSize,
  lineHeight,
  width,
}: {
  text: string
  fontSize: number
  lineHeight: number
  width: number
}): number {
  return countWrappedLines(text, charsPerLine(fontSize, width)) * fontSize * lineHeight
}

// Altura útil da folha A4 com as margens de pdfTheme.page: 842 - 34 - 48.
export const ALTURA_UTIL_A4 = 760

// Acima disto um bloco de texto deixa de ser atômico. A folga de 200 pt até a
// altura útil é a margem de erro da estimativa: mesmo num texto todo em
// maiúsculas (~0,62em por caractere, o pior caso plausível) a altura real fica
// em ~700 pt e ainda cabe na folha.
export const LIMITE_BLOCO_ATOMICO = 560
