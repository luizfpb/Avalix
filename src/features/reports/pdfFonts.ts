import { Font } from '@react-pdf/renderer'

// Os relatórios usam Inter 400 e 600, a mesma família das telas (desde
// out/2026; antes, Manrope). Os arquivos foram reduzidos ao repertório que o
// saneamento de pdfText.tsx garante (Latin-1 e a pontuação do CP1252), por
// isso têm uns 40 KB cada, e não os 320 KB da fonte completa. Gerados por
// scripts/fontes-pdf.py, que também desmonta os glifos compostos.
//
// Por que TTF e não os woff2 que o app já usa: o fontkit do @react-pdf não
// decodifica woff2 — registrar passa, mas o render quebra com "Offset is
// outside the bounds of the DataView". Estes dois arquivos são as instâncias
// estáticas em latin, servidas de /fonts.
//
// Eles NÃO entram no precache do service worker, de propósito e pelo mesmo
// motivo dos chunks de PDF: gerar laudo já exige rede (os dados vêm do
// Supabase e o chunk do @react-pdf também fica fora do precache). Não se cria
// aqui um modo de falha novo — se não há rede, o PDF não seria gerado de
// qualquer jeito.

const FAMILIES = [
  { family: 'Inter', arquivos: [['inter-400.ttf', 400], ['inter-600.ttf', 600]] },
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
