// Abertura de qualquer página do app pelo service worker: rede primeiro, a
// cópia do shell guardada no pré-cache como reserva (sem internet, ou rede que
// não responde em 3,5 s).
//
// Antes era o navigateFallback do Workbox, que entrega SEMPRE a cópia guardada
// e, se ela tiver sumido do cache, busca /index.html na rede. A Cloudflare
// responde /index.html com 308 para "/", e o Chrome se recusa a abrir página
// com resposta redirecionada: ERR_FAILED em todas as rotas, para sempre
// naquele aparelho, até alguém apagar os dados do site — o que aluno nenhum
// sabe fazer. Reproduzido apagando só essa entrada do cache.
//
// A função vai para dentro do sw.js como texto (runtimeCaching do Workbox):
// não pode usar import nem nada de fora dela.
export async function navigateNetworkFirst({ request }: { request: Request }): Promise<Response> {
  const scope = globalThis as unknown as {
    caches: { match(url: string, options: { ignoreSearch: boolean }): Promise<Response | undefined> }
  }
  const guardada = () => scope.caches.match('/index.html', { ignoreSearch: true }).catch(() => undefined)
  // Resposta redirecionada não pode abrir a página: vira uma resposta comum.
  const semRedirecionamento = (res: Response) => res.redirected
    ? new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers })
    : res
  const rede = fetch(request).then(semRedirecionamento)
  rede.catch(() => undefined)
  const prazo = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 3500))
  try {
    const primeira = await Promise.race([rede, prazo])
    if (primeira && primeira.ok) return primeira
    const copia = await guardada()
    if (copia) return copia
    return primeira ?? await rede
  } catch {
    const copia = await guardada()
    return copia ?? Response.error()
  }
}
