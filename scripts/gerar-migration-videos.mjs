// Planilha revisada de vídeos do catálogo -> migration que preenche
// exercises.catalog_video_url (0042) nas linhas globais.
//
//   npx vite-node scripts/gerar-migration-videos.mjs <planilha.csv> <saida.sql> <versao>
//   ex.: npx vite-node scripts/gerar-migration-videos.mjs docs/videos/leandro-twin-candidatos.csv supabase/migrations/0044_videos_do_catalogo.sql 0044
//   (a 0043 já é a da auditoria de aparelho real: use o próximo número livre)
//
// Coluna `aprovado` da planilha (separador ";", como sai do Excel pt-BR):
//   sim / s / ok / x -> usa a coluna `link`
//   alt              -> usa a coluna `alternativa_link`
//   um link do YouTube colado ali -> usa esse link
//   vazio ou "não"   -> o exercício fica sem vídeo curado (o app cai na busca)
//
// Os links passam pela mesma normalização da tela (canonicalYoutubeUrl): o que
// não é vídeo do YouTube para a geração com erro, em vez de virar migration
// que o CHECK do banco recusaria no dashboard.
import { readFileSync, writeFileSync } from 'node:fs'
import { canonicalYoutubeUrl } from '../src/features/workout/demo.ts'

const [entrada, saida, versao] = process.argv.slice(2)
if (!entrada || !saida || !/^\d{4}$/.test(versao ?? '')) {
  console.error('uso: npx vite-node scripts/gerar-migration-videos.mjs <planilha.csv> <saida.sql> <versao 4 dígitos>')
  process.exit(1)
}

function lerCsv(texto, sep) {
  const linhas = []
  let campo = ''
  let linha = []
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === sep) { linha.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      linha.push(campo); campo = ''
      if (linha.some((x) => x !== '')) linhas.push(linha)
      linha = []
    } else campo += c
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha) }
  const [cab, ...resto] = linhas
  return resto.map((l) => Object.fromEntries(cab.map((k, i) => [k.trim(), (l[i] ?? '').trim()])))
}

const texto = readFileSync(entrada, 'utf8').replace(/^\uFEFF/, '')
const sep = texto.split(/\r?\n/, 1)[0].includes(';') ? ';' : ','
const linhas = lerCsv(texto, sep)

const escolhas = []
const erros = []
for (const l of linhas) {
  const marca = (l.aprovado ?? '').toLowerCase()
  if (!marca || ['nao', 'não', 'n', '-'].includes(marca)) continue
  const bruto = ['sim', 's', 'ok', 'x'].includes(marca) ? l.link
    : marca === 'alt' ? l.alternativa_link
      : l.aprovado
  const url = canonicalYoutubeUrl(bruto ?? '')
  if (!url) erros.push(`${l.exercicio}: "${l.aprovado}" não aponta para um vídeo do YouTube`)
  else escolhas.push({ nome: l.exercicio, url })
}

const repetidos = escolhas.map((e) => e.nome).filter((n, i, a) => a.indexOf(n) !== i)
if (repetidos.length) erros.push(`exercício repetido na planilha: ${[...new Set(repetidos)].join(', ')}`)
if (erros.length) {
  console.error(erros.join('\n'))
  process.exit(1)
}
if (escolhas.length === 0) {
  console.error('nenhuma linha aprovada na planilha')
  process.exit(1)
}

const sql = (s) => `'${s.replace(/'/g, "''")}'`
const valores = escolhas.map((e) => `  (${sql(e.nome)}, ${sql(e.url)})`).join(',\n')

const anterior = String(Number(versao) - 1).padStart(4, '0')

writeFileSync(saida, `-- ${versao} — vídeos curados do catálogo global.
-- Aplicar depois da ${anterior}. Gerada por scripts/gerar-migration-videos.mjs a
-- partir da planilha revisada (${escolhas.length} exercícios). Só toca linhas
-- globais (org_id null), casando pelo nome; o vídeo escolhido por cada
-- organização (exercise_videos) continua tendo precedência.
--
-- Exercício da lista que não existir com esse nome no catálogo é avisado por
-- NOTICE, sem derrubar o resto: o catálogo em produção é a referência.
begin;

create temporary table _videos_catalogo (name text primary key, url text not null) on commit drop;
insert into _videos_catalogo (name, url) values
${valores};

update public.exercises x
   set catalog_video_url = v.url
  from _videos_catalogo v
 where x.org_id is null
   and x.name = v.name
   and x.catalog_video_url is distinct from v.url;

do $$
declare
  v_faltando text;
begin
  select string_agg(v.name, ', ' order by v.name) into v_faltando
    from _videos_catalogo v
   where not exists (select 1 from public.exercises x where x.org_id is null and x.name = v.name);
  if v_faltando is not null then
    raise notice 'sem exercicio global com este nome: %', v_faltando;
  end if;
end $$;

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '${versao}'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
`)
console.log(`ok: ${escolhas.length} vídeos -> ${saida}`)
