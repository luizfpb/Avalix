import { formatar, hrMax, hrZones, lerNumero } from './calculos.js'

const form = document.getElementById('form-fc')
const valor = document.getElementById('valor-fc')
const nota = document.getElementById('nota-fc')
const tabela = document.getElementById('tabela-fc')

function limpar(texto, erro = false) {
  valor.textContent = '—'
  nota.textContent = texto
  nota.className = erro ? 'erro-calc' : 'aviso-calc'
  tabela.hidden = true
}

function calcular() {
  const idade = lerNumero(form.idade.value)
  const repouso = lerNumero(form.repouso.value)
  const medida = lerNumero(form.medida.value)
  const formula = form.formula.value
  if (idade == null && medida == null) return limpar('Preencha a idade.')
  if (idade != null && !(Number.isInteger(idade) && idade >= 10 && idade <= 100)) {
    return limpar('Informe a idade em anos inteiros, de 10 a 100.', true)
  }
  if (Number.isNaN(repouso) || (repouso != null && !(repouso >= 30 && repouso <= 120))) {
    return limpar('Informe a FC de repouso entre 30 e 120 bpm, ou deixe em branco.', true)
  }
  if (Number.isNaN(medida) || (medida != null && !(medida >= 100 && medida <= 230))) {
    return limpar('Informe a FC máxima medida entre 100 e 230 bpm, ou deixe em branco.', true)
  }

  const maxima = medida ?? hrMax(idade, formula)
  if (repouso != null && repouso >= maxima) {
    return limpar('A FC de repouso precisa ser menor que a FC máxima.', true)
  }
  valor.innerHTML = `${formatar(maxima, 0)} <small>bpm</small>`
  nota.className = 'aviso-calc'
  const origem = medida != null
    ? 'FC máxima medida em teste.'
    : formula === 'fox'
      ? 'FC máxima estimada por 220 − idade.'
      : 'FC máxima estimada por Tanaka: 208 − 0,7 × idade.'
  nota.textContent = repouso != null
    ? `${origem} Zonas pela frequência cardíaca de reserva (Karvonen).`
    : `${origem} Zonas em percentual da FC máxima. Com a FC de repouso, as zonas saem pelo método de Karvonen.`

  tabela.tBodies[0].replaceChildren(...hrZones(maxima, repouso).map((z) => {
    const tr = document.createElement('tr')
    for (const texto of [`Zona ${z.zona}`, z.nome, `${z.de}% a ${z.ate}%`, `${z.min} a ${z.max} bpm`]) {
      const td = document.createElement('td')
      td.textContent = texto
      tr.append(td)
    }
    return tr
  }))
  tabela.hidden = false
}

form.addEventListener('input', calcular)
form.addEventListener('change', calcular)
form.addEventListener('submit', (e) => e.preventDefault())
calcular()
