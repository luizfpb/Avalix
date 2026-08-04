// Camada de domínio dos protocolos: responde "esta estimativa significa
// alguma coisa?", que é uma pergunta diferente de "a conta está certa?".
//
// As equações em equations.ts estão corretas e conferidas contra a fonte. O
// que faltava era isto: elas são ajustes estatísticos sobre uma população e
// uma faixa de medidas, e fora desse intervalo continuam produzindo um número
// — só que um número sem significado. Sem esta camada o app entregava, sem
// avisar nada:
//
//   - US Navy com pescoço >= cintura -> NaN (que virava null no jsonb e
//     derrubava a tela de detalhe) ou -450%;
//   - US Navy num aluno magro e musculoso (180 cm, pescoço 42, cintura 70)
//     -> -2,0% de gordura, com massa gorda negativa em seguida;
//   - Jackson & Pollock acima do vértice da parábola -> a relação se inverte
//     e MAIS dobra passa a significar MENOS gordura. Nos 3 sítios femininos o
//     vértice fica em 215,8 mm e o banco aceita até 297 mm (3 x 99), ou seja,
//     é alcançável de verdade digitando valores válidos.
//
// Regra adotada: o que é impossível vira erro duro (o profissional confere a
// medida); o que é apenas incomum ou extrapolado vira aviso que acompanha o
// resultado até o laudo. Nunca clampar em silêncio — um número corrigido por
// baixo dos panos é pior do que um número recusado, porque parece confiável.

import type { ProtocolInput, Sex } from './types'

export type ResultWarningCode =
  | 'idade-fora-da-faixa'
  | 'soma-acima-do-vertice'
  | 'gordura-incomum'

export type ResultWarning = {
  code: ResultWarningCode
  message: string
}

export class ProtocolDomainError extends Error {
  readonly code: 'medida-impossivel' | 'resultado-impossivel'
  constructor(code: ProtocolDomainError['code'], message: string) {
    super(message)
    this.name = 'ProtocolDomainError'
    this.code = code
  }
}

// Limites do que existe em um corpo humano vivo. Abaixo/acima disto não é uma
// estimativa ruim, é erro de digitação: a gordura essencial não passa de ~3%
// (homens) e ~12% (mulheres), e os maiores valores já documentados na
// literatura de obesidade extrema ficam abaixo de 75%.
const GORDURA_MIN_POSSIVEL = 1
const GORDURA_MAX_POSSIVEL = 75

// Faixa em que o valor é possível mas merece conferência antes de virar laudo.
const GORDURA_INCOMUM_MIN: Record<Sex, number> = { M: 3, F: 10 }
const GORDURA_INCOMUM_MAX = 60

// Faixas etárias das amostras de validação publicadas.
//   Jackson & Pollock 1978 (homens): 18-61 anos, n=308.
//   Jackson, Pollock & Ward 1980 (mulheres): 18-55 anos, n=249.
//   Durnin & Womersley 1974: 17-72; a linha <17 vem de Durnin & Rahaman
//     (1967) e cobre adolescentes a partir de ~12 anos.
//   US Navy (Hodgdon & Beckett 1984): população adulta militar, 17-60.
const FAIXA_ETARIA: Record<string, Partial<Record<Sex, [number, number]>> & { default: [number, number] }> = {
  jp7: { M: [18, 61], F: [18, 55], default: [18, 61] },
  jp3: { default: [18, 61] },
  jpWard: { default: [18, 55] },
  durninWomersley: { default: [12, 72] },
  usNavy: { default: [17, 60] },
}

// Vértice da parábola de cada equação quadrática, em mm: o ponto a partir do
// qual a densidade volta a subir e a estimativa se inverte. Derivado de
// -b/(2c) sobre os coeficientes de equations.ts. O teste
// domain.test.ts confere estes valores contra a função real, por sondagem
// numérica, para que não fiquem desatualizados se algum coeficiente mudar.
const VERTICE_MM: Record<string, Partial<Record<Sex, number>> & { default?: number }> = {
  // M: 0.00043499 / (2 * 0.00000055) | F: 0.00046971 / (2 * 0.00000056)
  jp7: { M: 395.4, F: 419.4 },
  // 0.0008267 / (2 * 0.0000016)
  jp3: { default: 258.3 },
  // 0.0009929 / (2 * 0.0000023)
  jpWard: { default: 215.8 },
  // Durnin-Womersley é logarítmica: monotônica, não inverte.
}

function faixaEtaria(protocolId: string, sex: Sex): [number, number] | null {
  const entry = FAIXA_ETARIA[protocolId]
  if (!entry) return null
  return entry[sex] ?? entry.default
}

function verticeMm(protocolId: string, sex: Sex): number | null {
  const entry = VERTICE_MM[protocolId]
  if (!entry) return null
  return entry[sex] ?? entry.default ?? null
}

// Erros duros de medida, checados ANTES de calcular. Só entram aqui casos em
// que a conta não tem como dar certo — nunca julgamento de plausibilidade.
export function assertMeasurementsUsable(protocolId: string, input: ProtocolInput): void {
  if (protocolId !== 'usNavy') return
  const { neck, waist, hip } = input.circumferencesCm
  if (neck == null || waist == null) return // registry já trata ausência
  if (waist - neck <= 0) {
    throw new ProtocolDomainError(
      'medida-impossivel',
      'No protocolo US Navy a cintura precisa ser maior que o pescoço. ' +
        'Confira se os dois campos não foram trocados.'
    )
  }
  if (input.sex === 'F' && hip != null && waist + hip - neck <= 0) {
    throw new ProtocolDomainError(
      'medida-impossivel',
      'A soma de cintura e quadril precisa ser maior que o pescoço. Confira as medidas.'
    )
  }
}

// Erro duro de resultado: NaN, infinito ou fora do que um corpo humano
// comporta. Isso nunca pode ser gravado nem impresso.
export function assertBodyFatUsable(bodyFatPct: number): void {
  if (!Number.isFinite(bodyFatPct)) {
    throw new ProtocolDomainError(
      'resultado-impossivel',
      'O cálculo não produziu um número válido com estas medidas. Confira os valores digitados.'
    )
  }
  if (bodyFatPct < GORDURA_MIN_POSSIVEL || bodyFatPct > GORDURA_MAX_POSSIVEL) {
    throw new ProtocolDomainError(
      'resultado-impossivel',
      `O resultado (${bodyFatPct.toFixed(1)}%) está fora do que é fisiologicamente possível. ` +
        'Isso indica medida fora da faixa do protocolo ou erro de digitação; confira as medidas.'
    )
  }
}

// Avisos não bloqueantes: o número é utilizável, mas o laudo deve dizer que a
// estimativa saiu da faixa validada.
export function collectWarnings(
  protocolId: string,
  input: ProtocolInput,
  sumMm: number | null,
  bodyFatPct: number
): ResultWarning[] {
  const warnings: ResultWarning[] = []

  const faixa = faixaEtaria(protocolId, input.sex)
  if (faixa && (input.ageYears < faixa[0] || input.ageYears > faixa[1])) {
    warnings.push({
      code: 'idade-fora-da-faixa',
      message:
        `Este protocolo foi validado em pessoas de ${faixa[0]} a ${faixa[1]} anos. ` +
        `Com ${input.ageYears} anos a estimativa é uma extrapolação e deve ser lida com reserva.`,
    })
  }

  const vertice = verticeMm(protocolId, input.sex)
  if (vertice != null && sumMm != null && sumMm > vertice) {
    warnings.push({
      code: 'soma-acima-do-vertice',
      message:
        `A soma das dobras (${sumMm.toFixed(1)} mm) passou de ${vertice.toFixed(0)} mm, ponto a partir do qual ` +
        'esta equação quadrática se inverte e passa a subestimar a gordura. ' +
        'Prefira outro protocolo ou outro método para este avaliado.',
    })
  }

  const min = GORDURA_INCOMUM_MIN[input.sex]
  if (bodyFatPct < min || bodyFatPct > GORDURA_INCOMUM_MAX) {
    warnings.push({
      code: 'gordura-incomum',
      message:
        `O resultado (${bodyFatPct.toFixed(1)}%) está fora da faixa usual para o sexo informado. ` +
        'Confira as medidas antes de emitir o laudo.',
    })
  }

  return warnings
}
