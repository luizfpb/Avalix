// Porta única das telas de testes físicos para o lazy() do App: com as duas
// entrando pelo mesmo módulo, o cálculo, as tabelas e o formulário ficam num
// chunk só (TestesFisicos-*.js), baixado uma vez para as duas telas.
export { default as TestesFisicosForm } from './TestesFisicosForm'
export { default as TestesFisicosDetalhe } from './TestesFisicosDetalhe'
