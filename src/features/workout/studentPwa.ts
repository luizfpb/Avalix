// O aluno instala um app diferente do que o treinador instala. Mesma origem,
// escopos diferentes: o Avalix tem escopo "/" e o treino, "/t".
//
// O manifest do app é injetado pelo VitePWA no index.html; na rota do aluno a
// tag é trocada para o manifest do treino, que abre direto em /t. A troca vale
// enquanto a página está aberta e é desfeita ao sair.
//
// ISTO É A PARTE COM RISCO REAL DE COMPORTAMENTO DE NAVEGADOR, e por isso não
// carrega nada essencial: a instalação é polimento. O offline não depende dela
// — depende do service worker (que já pré-cacheia o shell) e do IndexedDB. Se
// um aparelho não oferecer instalar, o aluno salva o link e tudo funciona
// igual, inclusive sem rede.

const STUDENT_MANIFEST = '/treino.webmanifest'

export function applyStudentManifest(): () => void {
  if (typeof document === 'undefined') return () => {}

  const existente = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  const anterior = existente?.getAttribute('href') ?? null

  const link = existente ?? document.createElement('link')
  link.rel = 'manifest'
  link.setAttribute('href', STUDENT_MANIFEST)
  if (!existente) document.head.appendChild(link)

  // iOS ignora boa parte do manifest em "Adicionar à Tela de Início" e usa
  // estas duas metas; sem elas o atalho abre na aba do navegador, com a barra
  // de endereço ocupando meia tela do celular no meio do treino.
  const meta = document.createElement('meta')
  meta.name = 'apple-mobile-web-app-capable'
  meta.content = 'yes'
  document.head.appendChild(meta)

  const titulo = document.createElement('meta')
  titulo.name = 'apple-mobile-web-app-title'
  titulo.content = 'Meu Treino'
  document.head.appendChild(titulo)

  return () => {
    if (anterior) link.setAttribute('href', anterior)
    else link.remove()
    meta.remove()
    titulo.remove()
  }
}
