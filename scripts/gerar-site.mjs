// Gera as páginas públicas (landing, recursos e ferramentas grátis) em
// public/, mais o sitemap.xml. São HTML estático, fora da SPA, para o Google
// indexar e para abrirem rápido sem baixar o app.
//
// Rodar depois de mudar qualquer texto daqui:  node scripts/gerar-site.mjs
// Os arquivos gerados vão para o repositório; src/lib/sitePublico.test.ts
// reprova se eles ficarem diferentes do que este script produz.
//
// Rotas: "/" é reescrita para /inicio em public/_redirects; as demais o
// Cloudflare Pages serve pelo nome do arquivo sem ".html".

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PAGINAS, SITE } from './site/paginas.mjs'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function gerarTudo() {
  const arquivos = new Map()
  for (const p of PAGINAS) arquivos.set(`public/${p.arquivo}`, montarPagina(p))
  arquivos.set('public/sitemap.xml', montarSitemap())
  return arquivos
}

function esc(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function urlDe(p) {
  return `${SITE.origem}${p.rota}`
}

function menu(atual) {
  const itens = [
    ['/avaliacao-fisica', 'Avaliação física'],
    ['/avaliacao-postural', 'Avaliação postural'],
    ['/app-para-personal-trainer', 'Treino e app do aluno'],
    ['/#ferramentas', 'Ferramentas grátis'],
    ['/#precos', 'Preços'],
  ]
  return itens
    .map(([href, nome]) =>
      `<a href="${href}"${href === atual ? ' aria-current="page"' : ''}>${nome}</a>`)
    .join('\n          ')
}

function topo(p) {
  return `<header class="topo">
      <div class="envoltorio">
        <a class="logo" href="/" aria-label="Avalix, página inicial"><span></span></a>
        <nav class="menu" aria-label="Principal">
          ${menu(p.rota)}
        </nav>
        <a class="entrar" href="/login">Entrar</a>
        <a class="botao" href="/cadastro">Testar grátis</a>
      </div>
    </header>`
}

function rodape() {
  return `<footer class="rodape">
      <div class="envoltorio">
        <div class="marca-rodape">
          <a class="logo" href="/" aria-label="Avalix, página inicial"><span></span></a>
          <p>Avaliação física, postural e treino para profissionais de Educação Física.</p>
        </div>
        <div>
          <h2>Produto</h2>
          <ul>
            <li><a href="/avaliacao-fisica">Avaliação física</a></li>
            <li><a href="/avaliacao-postural">Avaliação postural</a></li>
            <li><a href="/app-para-personal-trainer">Treino e app do aluno</a></li>
            <li><a href="/#precos">Preços</a></li>
          </ul>
        </div>
        <div>
          <h2>Ferramentas grátis</h2>
          <ul>
            <li><a href="/calculadora-1rm">Calculadora de 1RM</a></li>
            <li><a href="/calculadora-percentual-de-gordura">Percentual de gordura</a></li>
            <li><a href="/modelo-de-anamnese">Modelo de anamnese</a></li>
          </ul>
        </div>
        <div>
          <h2>Avalix</h2>
          <ul>
            <li><a href="/cadastro">Testar 14 dias grátis</a></li>
            <li><a href="/login">Entrar</a></li>
            <li><a href="/termos">Termos de uso</a></li>
            <li><a href="mailto:${SITE.email}">${SITE.email}</a></li>
          </ul>
        </div>
      </div>
    </footer>`
}

function migalha(p) {
  if (!p.migalha) return ''
  return `<nav class="migalha envoltorio" aria-label="Você está em">
        <a href="/">Início</a> › ${esc(p.migalha)}
      </nav>`
}

function dadosEstruturados(p) {
  const blocos = []
  if (p.rota !== '/') {
    blocos.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE.origem}/` },
        { '@type': 'ListItem', position: 2, name: p.migalha, item: urlDe(p) },
      ],
    })
  }
  for (const extra of p.jsonLd ?? []) blocos.push(extra)
  if (p.perguntas?.length) {
    blocos.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: p.perguntas.map(([q, r]) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: r.replace(/<[^>]+>/g, '') },
      })),
    })
  }
  return blocos
    .map((b) => `<script type="application/ld+json">${JSON.stringify(b).replace(/</g, '\\u003c')}</script>`)
    .join('\n    ')
}

function montarPagina(p) {
  const canonica = urlDe(p)
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${p.rota === '/' ? '<script src="/site/entrar.js"></script>\n    ' : ''}<title>${esc(p.titulo)}</title>
    <meta name="description" content="${esc(p.descricao)}" />
    <link rel="canonical" href="${canonica}" />
    <meta name="theme-color" content="#f7f7f8" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#111113" media="(prefers-color-scheme: dark)" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="preload" href="/fonts/manrope-700.ttf" as="font" type="font/ttf" crossorigin />
    <link rel="stylesheet" href="/site/site.css" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Avalix" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:url" content="${canonica}" />
    <meta property="og:title" content="${esc(p.tituloSocial ?? p.titulo)}" />
    <meta property="og:description" content="${esc(p.descricao)}" />
    <meta property="og:image" content="${SITE.origem}/og-avalix.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    ${dadosEstruturados(p)}
  </head>
  <body>
    <a class="pular" href="#conteudo">Pular para o conteúdo</a>
    ${topo(p)}
    <main id="conteudo">
      ${migalha(p)}
      ${p.corpo}
    </main>
    ${rodape()}${(p.scripts ?? []).map((s) => `\n    <script type="module" src="${s}"></script>`).join('')}
  </body>
</html>
`
}

function montarSitemap() {
  const urls = PAGINAS.map((p) => `  <url>
    <loc>${urlDe(p)}</loc>
    <lastmod>${p.atualizada}</lastmod>
  </url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [arquivo, conteudo] of gerarTudo()) {
    const destino = path.join(raiz, arquivo)
    let atual = null
    try {
      atual = await readFile(destino, 'utf8')
    } catch {
      // arquivo novo
    }
    if (atual !== conteudo) {
      await writeFile(destino, conteudo, 'utf8')
      console.log(`gerado ${arquivo}`)
    }
  }
}
