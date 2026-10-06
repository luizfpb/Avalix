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
// atômico e a altura útil da folha (738 pt no A4 com as margens de pdfTheme).

// Largura média de caractere do texto corrido, como fração do corpo. Medida
// com o fontkit nos arquivos de public/fonts, em texto corrido em português:
// Inter 400 dá 0,481em e Inter 600, 0,490em (a Manrope usada até out/2026
// dava 0,462em). 0,52 estima por cima de propósito: o erro da conta tem de
// sobrar linha, nunca faltar.
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

// Altura útil da folha A4 com as margens Clareza: 842 - 34 - 70.
export const ALTURA_UTIL_A4 = 738

// Acima disto um bloco de texto deixa de ser atômico. A folga de 178 pt até a
// altura útil é a margem de erro da estimativa: mesmo num texto todo em
// maiúsculas (0,60em por caractere na Inter; 0,62em é a margem do pior caso)
// a altura real fica em ~670 pt e ainda cabe na folha.
export const LIMITE_BLOCO_ATOMICO = 560
