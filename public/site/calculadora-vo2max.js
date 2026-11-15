import {
  cooperVo2,
  formatar,
  herdyCutoffs,
  herdyReferenceMean,
  lerNumero,
  queensVo2,
  rateVo2,
  rockportVo2,
} from './calculos.js'

const form = document.getElementById('form-vo2')
const medidas = document.getElementById('medidas-vo2')
const valor = document.getElementById('valor-vo2')
const nota = document.getElementById('nota-vo2')
const detalhe = document.getElementById('detalhe-vo2')

function camposDe(protocolo) {
  if (protocolo === 'cooper') {
    return [['distancia', 'Distância em 12 min (m)', '2400']]
  }
  if (protocolo === 'rockport') {
    return [
      ['minutos', 'Tempo: minutos', '14'],
      ['segundos', 'Tempo: segundos', '30'],
      ['fc', 'FC na chegada (bpm)', '135'],
      ['peso', 'Peso corporal (kg)', '72'],
    ]
  }
  return [['fc', 'FC de recuperação (bpm)', '148']]
}

const digitado = new Map()

function montarCampos() {
  for (const input of medidas.querySelectorAll('input')) digitado.set(input.name, input.value)
  const campos = camposDe(form.protocolo.value)
  medidas.replaceChildren(...campos.map(([nome, rotulo, padrao]) => {
    const div = document.createElement('div')
    div.className = 'campo'
    const label = document.createElement('label')
    label.htmlFor = `v-${nome}`
    label.textContent = rotulo
    const input = document.createElement('input')
    input.id = `v-${nome}`
    input.name = nome
    input.inputMode = 'decimal'
    input.autocomplete = 'off'
    input.value = digitado.get(nome) ?? padrao
    div.append(label, input)
    return div
  }))
}

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

function calcular() {
  const protocolo = form.protocolo.value
  const sexo = form.sexo.value
  const idade = lerNumero(form.idade.value)
  if (idade != null && (!Number.isInteger(idade) || idade < 10 || idade > 100)) {
    return limpar('Informe a idade em anos inteiros (10 a 100).', true)
  }

  const valores = {}
  for (const input of medidas.querySelectorAll('input')) {
    const n = lerNumero(input.value)
    if (n == null) return limpar('Preencha as medidas do teste.')
    if (Number.isNaN(n)) return limpar(`Confira o valor de ${input.labels[0].textContent}.`, true)
    valores[input.name] = n
  }

  let vo2
  let ressalva = null
  if (protocolo === 'cooper') {
    const d = valores.distancia
    if (!(d >= 600 && d <= 5000)) return limpar('Informe a distância entre 600 e 5000 m.', true)
    vo2 = cooperVo2(d)
    if (sexo === 'F' || (idade != null && (idade < 17 || idade > 52))) {
      ressalva = 'Equação de Cooper (1968), validada originalmente com homens de 17 a 52 anos.'
    } else {
      ressalva = 'Equação de Cooper (1968), corrida ou caminhada de 12 minutos.'
    }
  } else if (protocolo === 'rockport') {
    if (idade == null) return limpar('No teste de Rockport a idade entra na equação. Preencha a idade.')
    const min = valores.minutos
    const seg = valores.segundos
    const fc = valores.fc
    const peso = valores.peso
    if (!Number.isInteger(min) || min < 0 || !Number.isInteger(seg) || seg < 0 || seg >= 60) {
      return limpar('Informe minutos inteiros e segundos de 0 a 59.', true)
    }
    const tempoS = min * 60 + seg
    if (!(tempoS >= 360 && tempoS <= 3600)) return limpar('Informe um tempo total entre 6 e 60 minutos.', true)
    if (!(fc >= 40 && fc <= 230)) return limpar('Informe a frequência cardíaca entre 40 e 230 bpm.', true)
    if (!(peso >= 20 && peso <= 350)) return limpar('Informe o peso entre 20 e 350 kg.', true)
    vo2 = rockportVo2(sexo, idade, peso, tempoS, fc)
    ressalva = idade < 30 || idade > 69
      ? 'Equação de Kline et al. (Rockport, 1987), validada com adultos de 30 a 69 anos.'
      : 'Equação de Kline et al. (Rockport, 1987), caminhada de 1 milha (1.609 m).'
  } else {
    const fc = valores.fc
    if (!(fc >= 40 && fc <= 230)) return limpar('Informe a frequência cardíaca entre 40 e 230 bpm.', true)
    vo2 = queensVo2(sexo, fc)
    ressalva = 'Equação de McArdle et al. (Banco de Queens, 1972), validada com universitários.'
  }

  if (!Number.isFinite(vo2) || vo2 < 5 || vo2 > 95) {
    return limpar('As medidas levam a um VO₂máx fora da faixa fisiológica usual. Confira os valores.', true)
  }

  valor.innerHTML = `${formatar(vo2)} <small>ml/kg/min</small>`
  nota.className = 'aviso-calc'
  nota.textContent = ressalva

  const linhas = []
  const mets = vo2 / 3.5
  linhas.push(linha('Capacidade em METs', `${formatar(mets)} METs`))
  if (idade != null) {
    const rating = rateVo2(vo2, sexo, idade)
    const mean = herdyReferenceMean(sexo, idade)
    if (rating && mean != null) {
      const c = herdyCutoffs(mean)
      linhas.push(linha('Classificação (Herdy & Caixeta, 2016)', rating.label))
      linhas.push(linha('Média esperada para sexo e faixa etária', `${formatar(mean)} ml/kg/min (faixa Boa: ${formatar(c.good)} a ${formatar(c.excellent)})`))
    } else {
      linhas.push(linha('Classificação', 'Sem tabela para esta idade (referência de 15 a 74 anos)'))
    }
  } else {
    linhas.push(linha('Classificação', 'Informe a idade para comparar com a referência brasileira (15 a 74 anos)'))
  }
  detalhe.tBodies[0].replaceChildren(...linhas)
  detalhe.hidden = false
}

form.addEventListener('change', (e) => {
  if (e.target.name === 'protocolo') montarCampos()
  calcular()
})
form.addEventListener('input', calcular)
form.addEventListener('submit', (e) => e.preventDefault())
montarCampos()
calcular()
