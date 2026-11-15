import {
  bmrCunningham,
  bmrHarrisBenedict,
  bmrMifflin,
  formatar,
  lerNumero,
  tdeeTable,
} from './calculos.js'

const form = document.getElementById('form-tmb')
const valor = document.getElementById('valor-tmb')
const nota = document.getElementById('nota-tmb')
const tabela = document.getElementById('tabela-tmb')

function limpar(texto, erro = false) {
  valor.textContent = '—'
  nota.textContent = texto
  nota.className = erro ? 'erro-calc' : 'aviso-calc'
  tabela.hidden = true
}

function atualizarCampos() {
  const cunningham = form.formula.value === 'cunningham'
  for (const el of form.querySelectorAll('[data-antropometria]')) el.hidden = cunningham
  for (const el of form.querySelectorAll('[data-cunningham]')) el.hidden = !cunningham
}

function calcular() {
  const formula = form.formula.value
  let tmb
  let explicacao

  if (formula === 'cunningham') {
    const mlg = lerNumero(form.massaMagra.value)
    if (mlg == null) return limpar('Preencha a massa magra em kg.')
    if (Number.isNaN(mlg) || !(mlg >= 20 && mlg <= 180)) {
      return limpar('Informe a massa magra entre 20 e 180 kg.', true)
    }
    tmb = bmrCunningham(mlg)
    explicacao = `Equação de Cunningham (1980): 500 + 22 × ${formatar(mlg)} kg de massa magra.`
  } else {
    const sexo = form.sexo.value
    const peso = lerNumero(form.peso.value)
    const altura = lerNumero(form.altura.value)
    const idade = lerNumero(form.idade.value)
    if (peso == null || altura == null || idade == null) {
      return limpar('Preencha peso, altura e idade.')
    }
    if (Number.isNaN(peso) || !(peso >= 20 && peso <= 350)) {
      return limpar('Informe um peso entre 20 e 350 kg.', true)
    }
    if (Number.isNaN(altura) || !(altura >= 100 && altura <= 250)) {
      return limpar('Informe a altura entre 100 e 250 cm.', true)
    }
    if (Number.isNaN(idade) || !Number.isInteger(idade) || idade < 15 || idade > 100) {
      return limpar('Informe a idade em anos inteiros (15 a 100).', true)
    }
    if (formula === 'harris') {
      tmb = bmrHarrisBenedict(sexo, peso, altura, idade)
      explicacao = 'Harris-Benedict revisada por Roza & Shizgal (1984).'
    } else {
      tmb = bmrMifflin(sexo, peso, altura, idade)
      explicacao = 'Equação de Mifflin-St Jeor (1990), recomendada pela Academy of Nutrition and Dietetics.'
    }
  }

  valor.innerHTML = `${formatar(Math.round(tmb), 0)} <small>kcal/dia</small>`
  nota.className = 'aviso-calc'
  nota.textContent = explicacao

  tabela.tBodies[0].replaceChildren(...tdeeTable(tmb).map((item) => {
    const tr = document.createElement('tr')
    for (const texto of [item.nome, item.rotina, `${formatar(item.fator, 3).replace(/0+$/, '').replace(/,$/, '')}`, `${formatar(item.kcal, 0)} kcal`]) {
      const td = document.createElement('td')
      td.textContent = texto
      tr.append(td)
    }
    return tr
  }))
  tabela.hidden = false
}

form.addEventListener('change', (e) => {
  if (e.target.name === 'formula') atualizarCampos()
  calcular()
})
form.addEventListener('input', calcular)
form.addEventListener('submit', (e) => e.preventDefault())
atualizarCampos()
calcular()
