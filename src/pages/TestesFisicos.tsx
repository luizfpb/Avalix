// Porta única das telas de testes físicos para o lazy() do App. Com as duas
// entrando pelo mesmo módulo, o cálculo, as tabelas e o formulário caem num
// chunk só (TestesFisicos-*.js), fora do pré-cache (vite.config.ts). Um
// manualChunks fazia o mesmo, mas arrastava junto dependências comuns
// (lib/age) e deixava telas pré-cacheadas dependendo de arquivo que não está
// no aparelho.
export { default as TestesFisicosForm } from './TestesFisicosForm'
export { default as TestesFisicosDetalhe } from './TestesFisicosDetalhe'
