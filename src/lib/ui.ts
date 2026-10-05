// Classe base dos controles nativos (select/textarea) espelhando o estilo do
// shadcn Input. Centralizada aqui porque estava duplicada verbatim em ~14
// telas; um só lugar pra ajustar borda/foco/superfície. Onde a largura precisa
// ser diferente do w-full padrão, componha com cn(controlClass, 'w-auto').
//
// 16 px no celular, como o Input: o Safari do iPhone amplia a página ao focar
// um campo com fonte menor e ela fica ampliada depois — no meio do treino ou da
// anamnese, a pessoa precisa desfazer o zoom com os dedos a cada campo.
export const controlClass =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm'
