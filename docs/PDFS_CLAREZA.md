# PDFs — Clareza

Direção aprovada pelo usuário em 08/09/2026, a partir da primeira proposta em `docs/design-pdfs/`. Implementação nos três documentos existentes: avaliação física, evolução e plano de treino.

## Sistema visual

Manrope 400/700, papel branco, tinta `#212334`, violeta `#6250A1`, superfície lilás `#F4F2FA`, linhas `#E4E4EE`, texto secundário `#646579` e magenta `#AC577B`. Os tokens ficam em `src/features/reports/pdfTheme.tsx`; são específicos dos relatórios aprovados e não mudam o tema das telas.

Cabeçalho com organização e logo opcional, tipo do documento e título à esquerda. Identificação sem caixa externa, seções em caixa normal, tabelas com linhas finas e rodapé com Avalix, identificação profissional e paginação. Páginas seguintes recebem cabeçalho compacto com tipo e nome do avaliado. A4 com margens laterais de 34 pt e 70 pt reservados ao final da página.

Na avaliação, o gráfico circular e as massas ocupam uma faixa lilás; peso, IMC e altura usam cartões brancos. Na evolução, o resumo do período usa cartões suaves e os gráficos se organizam em pares. No treino, a sequência semanal usa letras em quadrados arredondados, os agrupamentos têm fundo e barra lateral contínuos e as mudanças por semana ficam em linhas compactas.

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
