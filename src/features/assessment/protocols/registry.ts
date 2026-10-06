import type {
  CircumferenceSite,
  ProtocolInput,
  ProtocolKind,
  ProtocolResult,
  Sex,
  SkinfoldSite,
} from './types'
import {
  durninWomersleyBodyDensity,
  jp3MaleBodyDensity,
  jp7BodyDensity,
  jpWardFemaleBodyDensity,
  usNavyBodyFatPct,
} from './equations'
import { brozekBodyFatPct, siriBodyFatPct } from './bodyComposition'
import {
  assertBodyFatUsable,
  assertMeasurementsUsable,
  collectWarnings,
  type ResultWarning,
} from './domain'

// Versão do motor de cálculo. Gravada em assessments.engine_version pra um
// laudo emitido continuar reproduzível mesmo se as fórmulas mudarem depois.
// 1.1.0: entrou a camada de domínio (domain.ts). As equações não mudaram —
// um laudo da 1.0.0 recalcula igual; o que mudou é que medida impossível
// agora é recusada em vez de virar NaN/percentual negativo no PDF.
// 1.2.0: o US Navy masculino passa a usar o abdômen na altura do umbigo, o
// sítio do método original; até a 1.1.0 usava a cintura, que na avaliação
// brasileira é medida no ponto mais estreito e subestima a gordura (cerca de
// 7 pontos num homem com 10 cm de diferença entre as duas). A equação é a
// mesma; laudos antigos mantêm o snapshot com que foram emitidos.
export const ENGINE_VERSION = '1.2.0'

export type ProtocolMeta = {
  id: string
  label: string
  kind: ProtocolKind
  sexes: Sex[]
  skinfoldSites: SkinfoldSite[]
  // Todas as circunferências que o protocolo usa, em qualquer sexo. As de
  // cada sexo saem de circumferenceSitesFor.
  circumferenceSites: CircumferenceSite[]
  // Quando o sítio muda com o sexo (US Navy).
  circumferenceSitesBySex?: Partial<Record<Sex, CircumferenceSite[]>>
}

// As circunferências que o protocolo exige para este sexo.
export function circumferenceSitesFor(protocol: ProtocolMeta, sex: Sex): CircumferenceSite[] {
  return protocol.circumferenceSitesBySex?.[sex] ?? protocol.circumferenceSites
}

// compute devolve o resultado cru; a soma das dobras vai junto porque a
// camada de domínio precisa dela para detectar a inversão da parábola.
type RawResult = ProtocolResult & { sumMm: number | null }

type Protocol = ProtocolMeta & {
  compute: (input: ProtocolInput) => RawResult
}

function sumSites(input: ProtocolInput, sites: SkinfoldSite[]): number {
  let sum = 0
  for (const site of sites) {
    const v = input.skinfoldsMm[site]
    if (v == null || !(v > 0)) throw new Error(`dobra obrigatória ausente: ${site}`)
    sum += v
  }
  return sum
}

function fromDensity(bodyDensity: number, sumMm: number): RawResult {
  const siri = siriBodyFatPct(bodyDensity)
  return {
    bodyDensity,
    bodyFatPct: siri,
    conversions: { siri, brozek: brozekBodyFatPct(bodyDensity) },
    warnings: [],
    sumMm,
  }
}

const JP7_SITES: SkinfoldSite[] = [
  'chest',
  'midaxillary',
  'triceps',
  'subscapular',
  'abdomen',
  'suprailiac',
  'thigh',
]
const JP3_MALE_SITES: SkinfoldSite[] = ['chest', 'abdomen', 'thigh']
const JP_WARD_SITES: SkinfoldSite[] = ['triceps', 'suprailiac', 'thigh']
const DW_SITES: SkinfoldSite[] = ['biceps', 'triceps', 'subscapular', 'suprailiac']

export const PROTOCOLS: Record<string, Protocol> = {
  jp7: {
    id: 'jp7',
    label: 'Jackson-Pollock 7 dobras',
    kind: 'skinfold',
    sexes: ['M', 'F'],
    skinfoldSites: JP7_SITES,
    circumferenceSites: [],
    compute: (i) => {
      const sum = sumSites(i, JP7_SITES)
      return fromDensity(jp7BodyDensity(i.sex, sum, i.ageYears), sum)
    },
  },
  jp3: {
    id: 'jp3',
    label: 'Jackson-Pollock 3 dobras (homens)',
    kind: 'skinfold',
    sexes: ['M'],
    skinfoldSites: JP3_MALE_SITES,
    circumferenceSites: [],
    compute: (i) => {
      const sum = sumSites(i, JP3_MALE_SITES)
      return fromDensity(jp3MaleBodyDensity(sum, i.ageYears), sum)
    },
  },
  jpWard: {
    id: 'jpWard',
    label: 'Jackson-Pollock-Ward 3 dobras (mulheres)',
    kind: 'skinfold',
    sexes: ['F'],
    skinfoldSites: JP_WARD_SITES,
    circumferenceSites: [],
    compute: (i) => {
      const sum = sumSites(i, JP_WARD_SITES)
      return fromDensity(jpWardFemaleBodyDensity(sum, i.ageYears), sum)
    },
  },
  durninWomersley: {
    id: 'durninWomersley',
    label: 'Durnin-Womersley 4 dobras',
    kind: 'skinfold',
    sexes: ['M', 'F'],
    skinfoldSites: DW_SITES,
    circumferenceSites: [],
    compute: (i) => {
      const sum = sumSites(i, DW_SITES)
      return fromDensity(durninWomersleyBodyDensity(i.sex, sum, i.ageYears), sum)
    },
  },
  usNavy: {
    id: 'usNavy',
    label: 'US Navy (circunferências)',
    kind: 'circumference',
    sexes: ['M', 'F'],
    skinfoldSites: [],
    circumferenceSites: ['neck', 'abdomen', 'waist', 'hip'],
    // Hodgdon & Beckett (1984): homem, abdômen na altura do umbigo; mulher,
    // cintura no ponto mais estreito e quadril na maior protuberância glútea.
    circumferenceSitesBySex: { M: ['neck', 'abdomen'], F: ['neck', 'waist', 'hip'] },
    compute: (i) => {
      const c = i.circumferencesCm
      const tronco = i.sex === 'M' ? c.abdomen : c.waist
      if (c.neck == null || tronco == null) {
        throw new Error(i.sex === 'M' ? 'pescoço e abdômen são obrigatórios' : 'pescoço e cintura são obrigatórios')
      }
      const bf = usNavyBodyFatPct(i.sex, i.heightCm, c.neck, tronco, c.hip)
      return { bodyDensity: null, bodyFatPct: bf, conversions: null, warnings: [], sumMm: null }
    },
  },
}

export function listProtocols(sex?: Sex): ProtocolMeta[] {
  return Object.values(PROTOCOLS)
    .filter((p) => (sex ? p.sexes.includes(sex) : true))
    .map(({ compute: _compute, ...meta }) => meta)
}

export function protocolLabel(id: string | null): string {
  if (!id) return 'Sem protocolo'
  return PROTOCOLS[id]?.label ?? id
}

export function computeProtocol(id: string, input: ProtocolInput): ProtocolResult {
  const p = PROTOCOLS[id]
  if (!p) throw new Error(`protocolo desconhecido: ${id}`)
  if (!p.sexes.includes(input.sex)) {
    throw new Error(`protocolo ${id} não se aplica ao sexo ${input.sex}`)
  }
  // Ordem importa: medida impossível é barrada antes de virar NaN, e resultado
  // impossível é barrado antes de virar snapshot no banco ou número no PDF.
  assertMeasurementsUsable(id, input)
  const { sumMm, ...raw } = p.compute(input)
  assertBodyFatUsable(raw.bodyFatPct)
  return { ...raw, warnings: collectWarnings(id, input, sumMm, raw.bodyFatPct) }
}

export type { ResultWarning }
