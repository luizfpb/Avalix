// Pseudonimização do avaliado nos prompts de IA.
//
// O prompt sai do app e vai, por copiar-e-colar, para um serviço de terceiros
// escolhido pelo profissional. Dado de saúde é dado pessoal sensível (LGPD
// art. 11): nome completo, contato, data de nascimento e id interno não têm
// motivo para viajar junto — nada disso muda o parecer.
//
// O primeiro nome fica inteiro e o resto vira inicial ("Luiz Felipe Brum Boy"
// -> "Luiz F. B. B."). É o suficiente para o profissional reconhecer de quem é
// o material — se o texto saísse como "Avaliado 1" ele pensaria que o app
// errou — sem carregar o identificador completo para fora.

import { ageFromBirthDate } from '../../lib/age'

// Mesmas partículas de lib/initials.ts, pelo mesmo motivo: "Ana da Silva" não
// pode virar "Ana d. S.".
const PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

export function abbreviateName(fullName: string | null | undefined): string {
  const parts = (fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0)
  if (parts.length === 0) return 'Avaliado'
  const [first, ...rest] = parts
  const initials = rest
    .filter((p) => !PARTICLES.has(p.toLowerCase()))
    .map((p) => `${p[0].toUpperCase()}.`)
  return [first, ...initials].join(' ')
}

// 'YYYY-MM-DD' -> Date no fuso local. new Date('2026-08-20') seria meia-noite
// UTC, que no Brasil (UTC-3) volta para o dia 19 e erraria a idade em quem faz
// aniversário na data de referência.
export function localDate(iso: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? '').trim())
  if (!m) return null
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d
}

export type PromptSubject = {
  fullName: string | null | undefined
  birthDate: string | null | undefined
  sex: string | null | undefined
}

export function sexLabel(sex: string | null | undefined): string {
  if (sex === 'M') return 'masculino'
  if (sex === 'F') return 'feminino'
  return 'não informado'
}

// Idade NA DATA DE REFERÊNCIA (a da anamnese ou da avaliação), não hoje. Um
// material de dois anos atrás descreve quem a pessoa era naquele dia, e as
// equações de composição corporal usam a idade da coleta.
export function ageAt(
  birthDate: string | null | undefined,
  referenceIso: string | null | undefined
): number | null {
  if (!birthDate) return null
  const ref = localDate(referenceIso)
  return ageFromBirthDate(birthDate, ref ?? new Date())
}
