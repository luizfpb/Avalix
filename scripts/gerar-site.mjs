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
            <li><a href="/calculadora-imc">IMC e cintura</a></li>
            <li><a href="/calculadora-tmb">TMB e gasto calórico</a></li>
            <li><a href="/calculadora-frequencia-cardiaca">Frequência cardíaca de treino</a></li>
            <li><a href="/calculadora-vo2max">Calculadora de VO2máx</a></li>
            <li><a href="/planilha-de-avaliacao-fisica">Ficha de avaliação física</a></li>
            <li><a href="/modelo-de-anamnese">Modelo de anamnese</a></li>
            <li><a href="/questionario-par-q">Questionário PAR-Q</a></li>
            <li><a href="/modelo-de-ficha-de-treino">Ficha de treino</a></li>
          </ul>
        </div>
        <div>
          <h2>Guias e comparativos</h2>
          <ul>
            <li><a href="/guia-avaliacao-fisica">Como fazer avaliação física</a></li>
            <li><a href="/guia-pollock-7-dobras">Pollock 7 dobras</a></li>
            <li><a href="/guia-volume-semanal-treino">Volume semanal de treino</a></li>
            <li><a href="/guia-avaliacao-postural">Avaliação postural com fotos</a></li>
            <li><a href="/guia-tabela-vo2max">Tabela de VO2máx (Herdy)</a></li>
            <li><a href="/comparativo-app-personal-trainer">Avalix vs MFIT e planilhas</a></li>
            <li><a href="/alternativa-sanny-physical-test">Alternativa ao Sanny</a></li>
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

function ogImageDe(p) {
  if (p.ogImage) return `${SITE.origem}${p.ogImage}`
  if (p.rota === '/avaliacao-fisica') return `${SITE.origem}/og-avaliacao.png`
  if (p.rota === '/avaliacao-postural') return `${SITE.origem}/og-postural.png`
  if (p.rota === '/app-para-personal-trainer') return `${SITE.origem}/og-treino.png`
  if (p.rota.startsWith('/calculadora-')) return `${SITE.origem}/og-calculadoras.png`
  if (
    p.rota.startsWith('/modelo-de-') ||
    p.rota.startsWith('/questionario-') ||
    p.rota.startsWith('/planilha-')
  ) {
    return `${SITE.origem}/og-modelos.png`
  }
  if (p.rota.startsWith('/guia-')) return `${SITE.origem}/og-guias.png`
  if (p.rota.startsWith('/comparativo-') || p.rota.startsWith('/alternativa-')) {
    return `${SITE.origem}/og-comparativo.png`
  }
  return `${SITE.origem}/og-avalix.png`
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
  if (p.tipoArtigo) {
    blocos.push({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: p.migalha ?? p.titulo,
      description: p.descricao,
      inLanguage: 'pt-BR',
      dateModified: p.atualizada,
      mainEntityOfPage: urlDe(p),
      image: ogImageDe(p),
      author: {
        '@type': 'Organization',
        name: 'Avalix',
        url: `${SITE.origem}/`,
      },
      publisher: {
        '@type': 'Organization',
        name: 'Avalix',
        logo: {
          '@type': 'ImageObject',
          url: `${SITE.origem}/pwa-512.png`,
        },
      },
    })
  }
  if (
    p.rota.startsWith('/calculadora-') ||
    p.rota.startsWith('/modelo-de-') ||
    p.rota.startsWith('/questionario-') ||
    p.rota.startsWith('/planilha-')
  ) {
    blocos.push({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: p.migalha ?? p.titulo,
      url: urlDe(p),
      applicationCategory: 'HealthApplication',
      operatingSystem: 'All',
      inLanguage: 'pt-BR',
      isAccessibleForFree: true,
      description: p.descricao,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'BRL',
      },
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
  const ogImage = ogImageDe(p)
  const tituloSocial = p.tituloSocial ?? p.titulo
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
    <link rel="preload" href="/fonts/manrope-700.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/site/site.css" />
    <meta property="og:type" content="${p.tipoArtigo ? 'article' : 'website'}" />
    <meta property="og:site_name" content="Avalix" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:url" content="${canonica}" />
    <meta property="og:title" content="${esc(tituloSocial)}" />
    <meta property="og:description" content="${esc(p.descricao)}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(tituloSocial)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(tituloSocial)}" />
    <meta name="twitter:description" content="${esc(p.descricao)}" />
    <meta name="twitter:image" content="${ogImage}" />
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
