# PDFs: Clareza

Direção aprovada pelo usuário em 08/09/2026, a partir da primeira proposta em `docs/design-pdfs/`. Implementação nos três documentos existentes: avaliação física, evolução e plano de treino.

## Sistema visual

Revisado em 05/10/2026, junto com as telas (ver a seção "PDFs sem cara de gerado por IA" em DECISIONS.md). A estrutura aprovada em setembro continua; mudou o acabamento.

Inter 400 e 600 (os mesmos desenhos das telas), papel branco, tinta `#18181B`, texto secundário `#5F5F69`, linhas `#E4E4E7` e `#D4D4D8`, superfície cinza `#F4F4F5`. O roxo da marca `#66539A` e o magenta `#AD567B` ficam para as séries dos gráficos e para os links de vídeo; ressalvas em âmbar `#885019`. Os tokens ficam em `src/features/reports/pdfTheme.tsx`.

Cabeçalho com organização e logo opcional; o título é o tipo do documento ("Avaliação física", "Relatório de evolução", "Plano de treino") e a linha de baixo diz o método ou o nome do plano. Sem rótulo em caixa alta, frase de efeito ou assinatura no canto. Identificação sem caixa externa, seções com título, tabelas com fios finos e rodapé com Avalix, identificação profissional, paginação e a data de emissão ("Gerado no Avalix em dd/mm/aaaa"). Páginas seguintes recebem cabeçalho compacto com tipo e nome do avaliado. A4 com margens laterais de 34 pt e 70 pt reservados ao final da página.

Na avaliação, o gráfico circular e as massas ficam no único bloco com contorno do documento, com a legenda em quadradinhos de cor; peso, IMC e altura ficam numa faixa entre fios, sem caixa para cada número. Na evolução, o resumo do período é uma tabela (primeira medida, última e variação) e os gráficos se organizam em pares. No treino, a letra de cada divisão aparece num quadrado de contorno igual na sequência semanal e no título da divisão; a numeração dos exercícios é 1, 2, 3; os agrupamentos (super-série, circuito) são marcados só pelo fundo cinza, de ponta a ponta; as mudanças por semana ficam em linhas compactas. Observações e notas de método são texto corrido, sem barra lateral.

Os rótulos dos gráficos usam a fonte embutida. Até out/2026 eles saíam em Helvetica, que não vai no arquivo, e cada leitor de PDF trocava por outra fonte.

### Fontes

`public/fonts/inter-400.ttf` e `inter-600.ttf` são gerados por `scripts/fontes-pdf.py` a partir dos TTF completos da Inter: repertório reduzido ao que `pdfText.tsx` garante (cerca de 40 KB cada), só o kerning como recurso tipográfico e os glifos compostos desmontados. Este último ponto não é estético: na Inter, "Ú" é montado de "U" mais acento, e o fontkit, ao embutir um PDF que usava "Ú", guardava o "U" sem a letra correspondente. Nos PDFs seguintes da mesma sessão o "U" perdia o texto e a quebra de linha deslocava uma posição ("P | ercentual"). `pdfFonts.test.ts` falha se algum glifo composto voltar.

## Conteúdo e paginação

Os snapshots, as equações, as fontes de dados e as ações de auditoria continuam sendo os existentes. Resultados e medidas têm formatação pt-BR; diferenças de percentual permanecem em pontos percentuais. Avisos de domínio, troca de protocolo, classificações, conversões, leituras de dobras e medicamentos históricos acompanham os relatórios.

A evolução identifica quem emitiu o PDF como **Emitido por**, pois a série pode conter coletas de mais de um avaliador. Avaliação e treino identificam o responsável pelo registro. Uma falha ao consultar o nome não impede a exportação, seguindo o comportamento das exportações existentes.

Gráficos quebram entre pares, e agrupamentos grandes de treino quebram entre exercícios com identificação de continuação. Semanas extensas repetem número, nome e indicação de continuação entre os segmentos de alterações. Cabeçalhos e avisos não devem ficar separados do primeiro conteúdo. Textos extensos continuam nas páginas seguintes. As alturas fixas das propostas de design não foram transferidas para as páginas dos documentos reais.

## Amostras reais dos geradores

Na raiz do projeto, em cmd:

```cmd
npx vite-node scripts/render-pdf-sample.mjs pdf-preview.local\clareza
```

O diretório `pdf-preview.local` é local e ignorado pelo Git. O script gera:

- `avaliacao.pdf`, `evolucao.pdf`, `treino.pdf`: documentos completos de Mariana Costa, com dados fictícios e composição calculada pelo motor do app.
- `avaliacao-longo.pdf`, `evolucao-longo.pdf`, `treino-longo.pdf`: nomes extensos, 30 avaliações, protocolos mistos, muitos perímetros, grupos de 16 exercícios, ajustes semanais e observações de 12 mil caracteres.
- `avaliacao-minima.pdf`: peso, altura e IMC, sem protocolo ou composição corporal.

Os resultados de composição das amostras diferem dos valores ilustrativos da proposta original: agora são calculados pelo motor a partir das dobras e da idade informadas, em vez de números escolhidos para o estudo visual.

Para conferir a ficha:

```cmd
start "" "pdf-preview.local\clareza\treino.pdf"
```

Para gerar uma imagem com o Poppler disponível no PATH:

```cmd
pdftoppm -png -r 100 pdf-preview.local\clareza\treino.pdf pdf-preview.local\clareza\treino
```

## Validação

Em 08/09/2026 passaram `npm run lint`, `npm run test` (775 testes em 99 arquivos), `npm run build` e `npm run check:build`. As sete amostras foram renderizadas e conferidas por imagem. As 32 páginas têm seus textos dentro da área da folha; a contagem de páginas varia conforme o conteúdo.

Para repetir a validação completa, em cmd:

```cmd
npm run check
```

## Publicação

Não há migration, regeneração de tipos nem mudança de dependências nesta entrega. A publicação segue o fluxo habitual: o usuário faz o commit e o push; o Cloudflare Pages publica o frontend. Os novos arquivos são gerados pelo app com o Clareza após a atualização do frontend; PDFs já baixados permanecem como foram emitidos.
