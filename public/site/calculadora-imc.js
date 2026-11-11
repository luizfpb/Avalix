import {
  bmiCategory,
  computeBmi,
  formatar,
  lerNumero,
  waistHeightRisk,
  waistHipRisk,
  waistRisk,
} from './calculos.js'

const form = document.getElementById('form-imc')
const valor = document.getElementById('valor-imc')
const nota = document.getElementById('nota-imc')
const detalhe = document.getElementById('detalhe-imc')

const DUAS = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function limpar(texto, erro = false) {
  valor.textContent = '—'
  nota.textContent = texto
  nota.className = erro ? 'erro-calc' : 'aviso-calc'
  detalhe.hidden = true
}

function linha(rotulo, texto) {
  const tr = document.createElement('tr')
  const th = document.createElement('th')
  th.scope = 'row'
  th.textContent = rotulo
  const td = document.createElement('td')
  td.textContent = texto
  tr.append(th, td)
  return tr
}

// Campo opcional: null em branco, NaN se inválido ou fora da faixa.
function opcional(input, min, max) {
  const n = lerNumero(input.value)
  if (n == null) return null
  return n >= min && n <= max ? n : NaN
}

function calcular() {
  const sexo = form.sexo.value
  const peso = lerNumero(form.peso.value)
  const altura = lerNumero(form.altura.value)
  const idade = lerNumero(form.idade.value)
  if (peso == null || altura == null) return limpar('Preencha o peso e a altura.')
  if (!(peso >= 20 && peso <= 400)) return limpar('Informe um peso entre 20 e 400 kg.', true)
  if (!(altura >= 100 && altura <= 250)) return limpar('Informe a altura em centímetros, entre 100 e 250.', true)
  if (idade != null && !(Number.isInteger(idade) && idade >= 2 && idade <= 120)) {
    return limpar('Informe a idade em anos inteiros, ou deixe em branco.', true)
  }
  const cintura = opcional(form.cintura, 40, 250)
  const quadril = opcional(form.quadril, 40, 250)
  if (Number.isNaN(cintura) || Number.isNaN(quadril)) {
    return limpar('Confira as circunferências: valores entre 40 e 250 cm, ou deixe em branco.', true)
  }

  const imc = computeBmi(peso, altura)
  const faixa = bmiCategory(imc, idade)
  valor.innerHTML = `${formatar(imc)} <small>kg/m²</small>`
  nota.className = 'aviso-calc'
  nota.textContent = faixa.tone === 'none'
    ? `${faixa.label}. Abaixo de 18 anos a OMS classifica o IMC pela curva de idade, não pelas faixas de adulto.`
    : `${faixa.label}, pelas faixas da OMS para adultos.`

  const linhas = []
  if (cintura != null) {
    linhas.push(linha('Cintura', `${formatar(cintura, 0)} cm, risco ${waistRisk(sexo, cintura)}`))
    const rce = cintura / altura
    linhas.push(linha('Cintura ÷ altura', `${DUAS.format(rce)} (${waistHeightRisk(rce)})`))
  }
  if (cintura != null && quadril != null) {
    const rcq = cintura / quadril
    linhas.push(linha('Cintura ÷ quadril', `${DUAS.format(rcq)}, risco ${waistHipRisk(sexo, rcq)}`))
  }
  detalhe.tBodies[0].replaceChildren(...linhas)
  detalhe.hidden = linhas.length === 0
}

form.addEventListener('input', calcular)
form.addEventListener('change', calcular)
form.addEventListener('submit', (e) => e.preventDefault())
calcular()
