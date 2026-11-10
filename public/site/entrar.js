// A raiz "/" serve a landing (public/_redirects). Quem já tem sessão salva do
// app, inclusive pelo app instalado (start_url "/"), vai direto para o painel.
// Carregado de forma síncrona no <head>, antes de a página pintar.
// "?site" mostra a landing mesmo com sessão (para conferir a página logado).
;(function () {
  try {
    if (/[?&]site\b/.test(location.search)) return
    for (var i = 0; i < localStorage.length; i++) {
      var chave = localStorage.key(i)
      if (chave && /^sb-.+-auth-token$/.test(chave) && localStorage.getItem(chave)) {
        location.replace('/dashboard')
        return
      }
    }
  } catch (e) {
    // storage bloqueado: fica na landing, que tem o botão Entrar
  }
})()
