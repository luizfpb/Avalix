// Classe base dos controles nativos (select/textarea) espelhando o estilo do
// shadcn Input. Centralizada aqui porque estava duplicada verbatim em ~14
// telas; um só lugar pra ajustar borda/foco/superfície. Onde a largura precisa
// ser diferente do w-full padrão, componha com cn(controlClass, 'w-auto').
export const controlClass =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
