// Botão "Imprimir o modelo": só aparece com JS, que é quem imprime.
for (const botao of document.querySelectorAll('[data-imprimir]')) {
  botao.hidden = false
  botao.addEventListener('click', () => window.print())
}
