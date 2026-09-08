// Estudos isolados: não altera nem importa os geradores usados pelo aplicativo.
// Uso: node scripts/render-pdf-concepts.mjs [clareza|pulso|atelier]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderToFile } from '@react-pdf/renderer'
import { h, registerFonts, ROOT } from './pdf-concepts/shared.mjs'

const concepts = [
  ['clareza', '01-clareza', 'ClarezaDocument'],
  ['pulso', '02-pulso', 'PulsoDocument'],
  ['atelier', '03-atelier', 'AtelierDocument'],
]
const selected = process.argv[2]
if (selected && !concepts.some(([name]) => name === selected)) {
  throw new Error('Opção inválida. Use clareza, pulso ou atelier.')
}
registerFonts()
const destination = join(ROOT, 'docs/design-pdfs')
mkdirSync(destination, { recursive: true })
for (const [name, file, component] of concepts) {
  if (selected && name !== selected) continue
  const module = await import(`./pdf-concepts/${name}.mjs`)
  await renderToFile(h(module[component]), join(destination, `${file}.pdf`))
  console.log(`Gerado: docs/design-pdfs/${file}.pdf`)
}
