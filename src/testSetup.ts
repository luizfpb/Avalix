// Setup do vitest: um shim de ambiente, não de comportamento do app.
//
// O jsdom instala AbortController/AbortSignal próprios, e o `Request` do Node
// (undici) recusa qualquer signal que não seja o dele — "RequestInit: Expected
// signal to be an instance of AbortSignal". O data router do react-router monta
// um Request por navegação, então sem isto NENHUMA navegação completa nos testes
// de página, e a falha aparece disfarçada de "não encontrei o elemento da tela
// seguinte" — vários minutos de caça a um bug que não é do app.
//
// Descartar o signal é inócuo aqui: nada na suíte aborta requisição (não há um
// AbortController sequer em src/). E o patch só entra quando o Request de fato
// recusa o signal do ambiente, então os arquivos que rodam em `environment:
// node` continuam com o Request original.
function requestRejectsEnvironmentSignal(): boolean {
  if (typeof globalThis.Request !== 'function' || typeof AbortController !== 'function') {
    return false
  }
  try {
    new globalThis.Request('http://localhost/', { signal: new AbortController().signal })
    return false
  } catch {
    return true
  }
}

if (requestRejectsEnvironmentSignal()) {
  const OriginalRequest = globalThis.Request
  class RequestSemSignal extends OriginalRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, init && 'signal' in init ? { ...init, signal: undefined } : init)
    }
  }
  globalThis.Request = RequestSemSignal as unknown as typeof Request
}

// O jsdom nao implementa HTMLDialogElement.showModal/close. Sem este polyfill,
// QUALQUER teste que abra um ConfirmDialog derruba a arvore inteira com
// "el.showModal is not a function" — e as confirmacoes destrutivas do app
// (excluir plano, sair sem salvar) ficam justamente sem cobertura.
const dialogPrototype = globalThis.HTMLDialogElement?.prototype
if (dialogPrototype && typeof dialogPrototype.showModal !== 'function') {
  const abrir = function (this: HTMLDialogElement) {
    this.open = true
  }
  dialogPrototype.show = abrir
  dialogPrototype.showModal = abrir
  dialogPrototype.close = function (this: HTMLDialogElement, returnValue?: string) {
    this.open = false
    if (returnValue !== undefined) this.returnValue = returnValue
    this.dispatchEvent(new Event('close'))
  }
}
