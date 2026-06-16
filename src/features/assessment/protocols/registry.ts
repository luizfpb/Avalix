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

// Versão do motor de cálculo. Gravada em assessments.engine_version pra um
// laudo emitido continuar reproduzível mesmo se as fórmulas mudarem depois.
export const ENGINE_VERSION = '1.0.0'

export type ProtocolMeta = {
  id: string
  label: string
  kind: ProtocolKind
  sexes: Sex[]
  skinfoldSites: SkinfoldSite[]
  // 'hip' só é usado no US Navy feminino; a UI decide por sexo
  circumferenceSites: CircumferenceSite[]
}

type Protocol = ProtocolMeta & {
  compute: (input: ProtocolInput) => ProtocolResult
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

function fromDensity(bodyDensity: number): ProtocolResult {
  const siri = siriBodyFatPct(bodyDensity)
  return {
    bodyDensity,
    bodyFatPct: siri,
    conversions: { siri, brozek: brozekBodyFatPct(bodyDensity) },
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
    compute: (i) => fromDensity(jp7BodyDensity(i.sex, sumSites(i, JP7_SITES), i.ageYears)),
  },
  jp3: {
    id: 'jp3',
    label: 'Jackson-Pollock 3 dobras (homens)',
    kind: 'skinfold',
    sexes: ['M'],
    skinfoldSites: JP3_MALE_SITES,
    circumferenceSites: [],
    compute: (i) => fromDensity(jp3MaleBodyDensity(sumSites(i, JP3_MALE_SITES), i.ageYears)),
  },
  jpWard: {
    id: 'jpWard',
    label: 'Jackson-Pollock-Ward 3 dobras (mulheres)',
    kind: 'skinfold',
    sexes: ['F'],
    skinfoldSites: JP_WARD_SITES,
    circumferenceSites: [],
    compute: (i) => fromDensity(jpWardFemaleBodyDensity(sumSites(i, JP_WARD_SITES), i.ageYears)),
  },
  durninWomersley: {
    id: 'durninWomersley',
    label: 'Durnin-Womersley 4 dobras',
    kind: 'skinfold',
    sexes: ['M', 'F'],
    skinfoldSites: DW_SITES,
    circumferenceSites: [],
    compute: (i) => fromDensity(durninWomersleyBodyDensity(i.sex, sumSites(i, DW_SITES), i.ageYears)),
  },
  usNavy: {
    id: 'usNavy',
    label: 'US Navy (circunferências)',
    kind: 'circumference',
    sexes: ['M', 'F'],
    skinfoldSites: [],
    circumferenceSites: ['neck', 'waist', 'hip'],
    compute: (i) => {
      const c = i.circumferencesCm
      if (c.neck == null || c.waist == null) {
        throw new Error('pescoço e cintura são obrigatórios')
      }
      const bf = usNavyBodyFatPct(i.sex, i.heightCm, c.neck, c.waist, c.hip)
      return { bodyDensity: null, bodyFatPct: bf, conversions: null }
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
  return p.compute(input)
}
