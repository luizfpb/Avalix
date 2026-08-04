import { Font } from '@react-pdf/renderer'

// As fontes do app no PDF: Manrope no corpo e Newsreader nos dois títulos, o
// mesmo par de src/index.css (body = Manrope, h1-h3 = Newsreader).
//
// Por que TTF e não os woff2 que o app já usa: o fontkit do @react-pdf não
// decodifica woff2 — registrar passa, mas o render quebra com "Offset is
// outside the bounds of the DataView". Estes quatro arquivos são as instâncias
// estáticas em latin (~171 KB somados), servidas de /fonts.
//
// Eles NÃO entram no precache do service worker, de propósito e pelo mesmo
// motivo dos chunks de PDF: gerar laudo já exige rede (os dados vêm do
// Supabase e o chunk do @react-pdf também fica fora do precache). Não se cria
// aqui um modo de falha novo — se não há rede, o PDF não seria gerado de
// qualquer jeito.

const FAMILIES = [
  { family: 'Manrope', arquivos: [['manrope-400.ttf', 400], ['manrope-700.ttf', 700]] },
  { family: 'Newsreader', arquivos: [['newsreader-400.ttf', 400], ['newsreader-600.ttf', 600]] },
] as const

function registrar(base: string): void {
  for (const { family, arquivos } of FAMILIES) {
    Font.register({
      family,
      fonts: arquivos.map(([arquivo, peso]) => ({
        src: `${base}/${arquivo}`,
        fontWeight: peso,
      })),
    })
  }
}

let registrado = false

// Chamada antes de gerar qualquer PDF no navegador. Idempotente.
export function registerReportFonts(): void {
  if (registrado) return
  // Em Node (testes de fumaça, scripts de amostra) não existe origem HTTP para
  // resolver /fonts. Lá quem registra é registerReportFontsFrom, com caminho de
  // arquivo. Sem esse guard, o fetch falharia no meio do render.
  if (typeof document === 'undefined') return
  registrar('/fonts')
  registrado = true
}

// Para Node: registra a partir do diretório em disco. Usada pelo teste de
// fumaça e por scripts/render-pdf-sample.mjs, para que o que se inspeciona
// localmente use exatamente os mesmos arquivos que o navegador vai baixar.
export function registerReportFontsFrom(dir: string): void {
  if (registrado) return
  registrar(dir.replace(/[\\/]+$/, ''))
  registrado = true
}
