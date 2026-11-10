import {
  formatar,
  jp3MaleBodyDensity,
  jp7BodyDensity,
  jpWardFemaleBodyDensity,
  lerNumero,
  siriBodyFatPct,
  usNavyBodyFatPct,
} from './calculos.js'

const form = document.getElementById('form-gordura')
const medidas = document.getElementById('medidas')
const valor = document.getElementById('valor-gordura')
const nota = document.getElementById('nota-gordura')
const detalhe = document.getElementById('detalhe-gordura')

const DOBRAS = {
  peitoral: 'Peitoral',
  axilar: 'Axilar média',
  triceps: 'Tríceps',
  subescapular: 'Subescapular',
  abdominal: 'Abdominal',
  suprailiaca: 'Supra-ilíaca',
  coxa: 'Coxa',
}

// Campos de cada protocolo, conforme o sexo (registry.ts do app).
function camposDe(protocolo, sexo) {
  if (protocolo === 'jp7') {
    return ['peitoral', 'axilar', 'triceps', 'subescapular', 'abdominal', 'suprailiaca', 'coxa']
      .map((k) => [k, `${DOBRAS[k]} (mm)`])
  }
  if (protocolo === 'jp3') {
    const sitios = sexo === 'M' ? ['peitoral', 'abdominal', 'coxa'] : ['triceps', 'suprailiaca', 'coxa']
    return sitios.map((k) => [k, `${DOBRAS[k]} (mm)`])
  }
  const navy = [['altura', 'Altura (cm)'], ['pescoco', 'Pescoço (cm)']]
  return sexo === 'M'
    ? [...navy, ['abdomen', 'Abdômen, no umbigo (cm)']]
    : [...navy, ['cintura', 'Cintura (cm)'], ['quadril', 'Quadril (cm)']]
}

// Os valores digitados sobrevivem à troca de protocolo quando o campo continua.
const digitado = new Map()

function montarCampos() {
  for (const input of medidas.querySelectorAll('input')) digitado.set(input.name, input.value)
  const campos = camposDe(form.protocolo.value, form.sexo.value)
  medidas.replaceChildren(...campos.map(([nome, rotulo]) => {
    const div = document.createElement('div')
    div.className = 'campo'
    const label = document.createElement('label')
    label.htmlFor = `m-${nome}`
    label.textContent = rotulo
    const input = document.createElement('input')
    input.id = `m-${nome}`
    input.name = nome
    input.inputMode = 'decimal'
    input.autocomplete = 'off'
    input.value = digitado.get(nome) ?? ''
    div.append(label, input)
    return div
  }))
  // a idade não entra no US Navy
  form.idade.closest('.campo').hidden = form.protocolo.value === 'navy'
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
  const valores = {}
  for (const input of medidas.querySelectorAll('input')) {
    const n = lerNumero(input.value)
    if (n == null) return limpar('Preencha as medidas.')
    if (Number.isNaN(n)) return limpar(`Confira o valor de ${input.labels[0].textContent}.`, true)
    valores[input.name] = n
  }
  const peso = lerNumero(form.peso.value)
  if (Number.isNaN(peso) || (peso != null && !(peso >= 20 && peso <= 400))) {
    return limpar('Informe um peso entre 20 e 400 kg, ou deixe em branco.', true)
  }

  let pct
  const linhas = []
  if (protocolo === 'navy') {
    const { altura, pescoco } = valores
    if (!(altura >= 100 && altura <= 250)) return limpar('Informe uma altura entre 100 e 250 cm.', true)
    const tronco = sexo === 'M' ? valores.abdomen : valores.cintura
    for (const v of [pescoco, tronco, valores.quadril ?? 60]) {
      if (!(v >= 20 && v <= 250)) return limpar('Confira as circunferências: valores entre 20 e 250 cm.', true)
    }
    const base = sexo === 'M' ? tronco - pescoco : tronco + valores.quadril - pescoco
    if (!(base > 0)) return limpar('A circunferência do pescoço precisa ser menor que a do tronco.', true)
    pct = usNavyBodyFatPct(sexo, altura, pescoco, tronco, valores.quadril)
  } else {
    const idade = lerNumero(form.idade.value)
    if (idade == null) return limpar('Preencha a idade.')
    if (!Number.isInteger(idade) || idade < 10 || idade > 100) return limpar('Informe a idade em anos inteiros.', true)
    for (const v of Object.values(valores)) {
      if (!(v >= 1 && v <= 90)) return limpar('Confira as dobras: valores entre 1 e 90 mm.', true)
    }
    const soma = Object.values(valores).reduce((a, b) => a + b, 0)
    const densidade = protocolo === 'jp7'
      ? jp7BodyDensity(sexo, soma, idade)
      : sexo === 'M' ? jp3MaleBodyDensity(soma, idade) : jpWardFemaleBodyDensity(soma, idade)
    pct = siriBodyFatPct(densidade)
    linhas.push(linha('Soma das dobras', `${formatar(soma, 0)} mm`))
    linhas.push(linha('Densidade corporal', densidade.toFixed(4).replace('.', ',') + ' g/ml'))
    if (idade < 18 || idade > 61) {
      nota.dataset.faixa = 'fora'
    } else {
      delete nota.dataset.faixa
    }
  }

  if (!Number.isFinite(pct) || pct < 2 || pct > 70) {
    return limpar('As medidas levam a um resultado fora da faixa possível. Confira os valores.', true)
  }
  valor.innerHTML = `${formatar(pct)} <small>%</small>`
  if (peso != null) {
    const gorda = (peso * pct) / 100
    linhas.push(linha('Massa gorda', `${formatar(gorda)} kg`))
    linhas.push(linha('Massa magra', `${formatar(peso - gorda)} kg`))
  }
  nota.className = 'aviso-calc'
  nota.textContent = protocolo === 'navy'
    ? 'US Navy (Hodgdon e Beckett), por circunferências.'
    : nota.dataset.faixa === 'fora'
      ? 'Equação de Siri. As equações de Jackson & Pollock foram feitas com adultos de 18 a 61 anos: fora disso, o resultado é menos preciso.'
      : 'Densidade convertida pela equação de Siri.'
  detalhe.tBodies[0].replaceChildren(...linhas)
  detalhe.hidden = linhas.length === 0
}

form.addEventListener('change', (e) => {
  if (e.target.name === 'protocolo' || e.target.name === 'sexo') montarCampos()
  calcular()
})
form.addEventListener('input', calcular)
form.addEventListener('submit', (e) => e.preventDefault())
montarCampos()
calcular()
