// sha256 em hex via Web Crypto (global no browser e no Node 22 usado nos testes).
// Usado pra fixar o texto de consentimento exibido: guardamos o hash junto do
// aceite, então é possível provar depois qual texto exato a pessoa leu.
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
