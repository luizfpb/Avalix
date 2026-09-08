# Estudos visuais para os PDFs do Avalix

04/09/2026 · Estudos originais. **Clareza aprovada em 08/09/2026.** A implementação nos geradores reais está documentada em [PDFS_CLAREZA.md](../PDFS_CLAREZA.md).

Abra `index.html` no navegador para comparar as três propostas. As abas alternam entre avaliação física, evolução e plano de treino; cada folha pode ser ampliada. Os PDFs têm três páginas A4, com texto selecionável e fontes incorporadas.

| Opção | Direção | Arquivo |
| --- | --- | --- |
| 1 · Clareza | Interface leve, superfícies suaves, composição circular e tabelas precisas. | [01-clareza.pdf](01-clareza.pdf) |
| 2 · Pulso | Identidade esportiva, placa plum, números fortes e trilhos de informação. | [02-pulso.pdf](02-pulso.pdf) |
| 3 · Atelier | Publicação editorial, títulos serifados, notas marginais e composição assimétrica. | [03-atelier.pdf](03-atelier.pdf) |

## Escopo desta entrega

São amostras para selecionar uma identidade. Cada PDF reúne uma página representativa de cada documento existente: avaliação física, evolução e treino. Todas usam o mesmo conjunto fictício de dados. A ficha de treino mostra a divisão A; as divisões B e C são referências de sequência para demonstrar a apresentação de um mesociclo.

Os geradores de produção, as telas, o banco e as dependências do aplicativo não foram alterados. Os estudos usam a biblioteca e as fontes já instaladas no projeto, em módulos independentes dentro de `scripts/pdf-concepts/`.

Os números ilustram hierarquia visual; não constituem um caso clínico nem um vetor de teste das equações. Na implementação, os resultados continuarão vindo dos snapshots e das funções existentes.

## Padronização prevista para a direção escolhida

- Marca da organização no cabeçalho; Avalix, responsável e paginação no rodapé.
- Mesma tipografia, margens, escala de espaços, tabelas e tratamento de ressalvas nos três documentos.
- Unidades explícitas; diferenças de percentual em pontos percentuais; escala de gráficos com janela mínima e aviso para mudança de protocolo.
- Divisões e agrupamentos legíveis, com limites do bi-set/circuito, instrução de execução, cadência, técnica e alterações por semana.
- Conteúdo variável preservado: métodos e conversões, leituras de dobras, medidas bilaterais e personalizadas, medicamentos históricos, observações e ressalvas do motor.
- Paginação dinâmica na integração: nomes e logos extensos, muitas medidas/exercícios, textos longos, cabeçalhos repetidos e dados opcionais ausentes.

As três páginas fixas dos estudos não demonstram todos os casos de paginação dos dados de produção. Os módulos Pulso e Atelier fixam a altura para a apresentação; essa configuração não deve ser copiada para documentos de comprimento variável.

## Reprodução

Na raiz do projeto, em cmd:

```cmd
node scripts/render-pdf-concepts.mjs
```

Para gerar apenas uma opção:

```cmd
node scripts/render-pdf-concepts.mjs clareza
```

Para abrir a galeria:

```cmd
start "" "docs\design-pdfs\index.html"
```

As imagens da galeria foram geradas a partir dos próprios PDFs com Poppler, a 110 dpi. Os arquivos PNG precisam ser atualizados após qualquer edição do PDF. Exemplo, com Poppler disponível no PATH:

```cmd
pdftoppm -png -r 110 docs\design-pdfs\01-clareza.pdf docs\design-pdfs\01-clareza
```

## Verificação

As nove páginas foram renderizadas e inspecionadas visualmente. Tamanho A4 e quantidade de páginas foram verificados. A galeria foi conferida em desktop e celular, incluindo alternância dos três documentos e abertura/fechamento da ampliação. Validação do projeto: lint, 690 testes e build concluídos.

Direção selecionada: **Clareza**. Estes arquivos preservam a comparação original; para gerar os documentos completos da implementação, siga [PDFS_CLAREZA.md](../PDFS_CLAREZA.md).
