// Alterna os preços entre mensal e anual na seção de planos da landing.
// Sem JS a página mostra o mensal e o anual escrito embaixo de cada plano.
const grupo = document.querySelector('[data-ciclo]')
if (grupo) {
  const botoes = grupo.querySelectorAll('button')
  const escolher = (ciclo) => {
    for (const b of botoes) b.setAttribute('aria-pressed', String(b.dataset.valor === ciclo))
    for (const el of document.querySelectorAll('[data-mensal]')) {
      el.innerHTML = ciclo === 'anual' ? el.dataset.anual : el.dataset.mensal
    }
    for (const el of document.querySelectorAll('[data-detalhe-mensal]')) {
      el.textContent = ciclo === 'anual' ? el.dataset.detalheAnual : el.dataset.detalheMensal
    }
  }
  grupo.hidden = false
  for (const b of botoes) b.addEventListener('click', () => escolher(b.dataset.valor))
}
