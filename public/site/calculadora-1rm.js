import { estimateOneRm, formatar, lerNumero, percentTable, roundToIncrement } from './calculos.js'

const form = document.getElementById('form-1rm')
const valor = document.getElementById('valor-1rm')
const nota = document.getElementById('nota-1rm')
const tabela = document.getElementById('tabela-1rm')

function limpar(texto) {
  valor.textContent = '—'
  nota.textContent = texto
  nota.className = texto.startsWith('Preencha') ? 'aviso-calc' : 'erro-calc'
  tabela.hidden = true
}

function calcular() {
  const carga = lerNumero(form.carga.value)
  const reps = lerNumero(form.reps.value)
  const formula = form.formula.value
  if (carga == null || reps == null) return limpar('Preencha a carga e as repetições.')
  if (!(carga > 0 && carga <= 1000)) return limpar('Informe uma carga entre 0 e 1000 kg.')
  if (!Number.isInteger(reps) || reps < 1 || reps > 30) return limpar('Informe repetições inteiras de 1 a 30.')

  const rm = estimateOneRm(carga, reps, formula)
  valor.innerHTML = `${formatar(rm)} <small>kg</small>`
  nota.className = 'aviso-calc'
  nota.textContent = reps > 12
    ? 'Acima de 12 repetições a estimativa perde precisão. Para estimar a 1RM, prefira uma série de 3 a 8.'
    : `${formula === 'brzycki' ? 'Brzycki' : 'Epley'}, a partir de ${formatar(carga, 0)} kg × ${reps}.`

  const corpo = tabela.tBodies[0]
  corpo.replaceChildren(...percentTable(rm).map((linha) => {
    const tr = document.createElement('tr')
    for (const texto of [`${linha.pct}%`, `${formatar(roundToIncrement(linha.load), 0)} kg`, String(linha.reps)]) {
      const td = document.createElement('td')
      td.textContent = texto
      tr.append(td)
    }
    return tr
  }))
  tabela.hidden = false
}

form.addEventListener('input', calcular)
form.addEventListener('submit', (e) => e.preventDefault())
calcular()
