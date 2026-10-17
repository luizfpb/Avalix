// Tipos mínimos do Deno só para o `tsc -b` deste repositório conferir as Edge
// Functions. O Deno do Supabase usa os tipos dele e nunca lê este arquivo
// (fica fora do import de qualquer function).
declare namespace Deno {
  const env: { get(name: string): string | undefined }
  function serve(handler: (request: Request) => Response | Promise<Response>): void
}
