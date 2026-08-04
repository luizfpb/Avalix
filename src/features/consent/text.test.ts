import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha256Hex } from '../../lib/hash'
import { CONSENT_VERSION, consentContent, consentText } from './text'

// O fim de linha nao faz parte do termo: a spec do JavaScript normaliza CRLF
// para LF ao fazer o parse do template literal em text.ts, enquanto readFileSync
// devolve o .sql exatamente como esta em disco (CRLF num checkout Windows com
// core.autocrlf). Comparar sem normalizar deixaria este guard vermelho por
// motivo de sistema operacional, e suite vermelha por motivo ambiental treina a
// ignorar vermelho. O servidor tambem normaliza (app.canonical_consent_text na
// migration 0022), entao o hash bate dos dois lados independente do checkout.
const lf = (value: string) => value.replace(/\r\n/g, '\n')

describe('consentimento LGPD', () => {
  it('permanece igual ao texto canonico da migration 0020 (ignorando fim de linha)', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/0020_integrity_privacy.sql'),
      'utf8'
    )
    const canonical = migration.match(/\$consent\$([\s\S]*?)\$consent\$/)?.[1]
    expect(canonical).toBeDefined()
    expect(lf(canonical!).replace('{{CONTROLADOR}}', 'Clínica X')).toBe(
      lf(consentText('Clínica X'))
    )
  })

  it('o texto do app nao carrega CR, entao o hash independe do checkout', () => {
    expect(consentText('Clínica X')).not.toContain('\r')
  })

  it('publica a versao 1.1 e um texto substancial', () => {
    expect(CONSENT_VERSION).toBe('1.1')
    expect(consentText('Clínica X').length).toBeGreaterThan(3_000)
  })

  it('embute o nome normalizado do Controlador ou o fallback sem inventar contato', () => {
    expect(consentText('  Estúdio Corpo & Movimento  ')).toContain(
      'Estúdio Corpo & Movimento (o “Controlador”)'
    )
    const fallback = consentText('')
    expect(fallback).toContain('o profissional ou a organização responsável pela sua avaliação')
    expect(fallback).toContain('Solicitações devem ser dirigidas ao Controlador')
    expect(fallback).not.toMatch(/@|telefone:\s*\d/i)
  })

  it('usa as bases legais corretas para consentimento comum e dado sensivel', () => {
    const text = consentText('Clínica X')
    expect(text).toMatch(/art\. 7º, inciso I/)
    expect(text).toMatch(/art\. 11, inciso I/)
    expect(text).not.toMatch(/art\. 7º, inciso IX/)
    expect(text).toMatch(/art\. 14 da LGPD/)
  })

  it('enumera anamnese, saude, treino, agenda, logs e formatos de saida', () => {
    const text = consentText('Clínica X')
    for (const expected of [
      'Anamnese',
      'medicamentos',
      'gestação',
      'registros de treino',
      'agenda de avaliações',
      'registros de acesso',
      'PDF',
      'CSV',
    ]) {
      expect(text).toContain(expected)
    }
  })

  it('explica terceiros, retencao e compartilhamentos somente por acao explicita', () => {
    const text = consentText('Clínica X')
    expect(text).toMatch(/fornecedores de infraestrutura/)
    expect(text).toMatch(/eliminados ou anonimizados/)
    expect(text).toMatch(/Google Agenda/)
    expect(text).toMatch(/WhatsApp/)
    expect(text.match(/ação explícita/g)).toHaveLength(2)
    expect(text).toMatch(/não envia esses dados automaticamente/)
  })

  it('gera hash estavel por Controlador e diferente entre Controladores', async () => {
    const a1 = await sha256Hex(consentText('Org A'))
    const a2 = await sha256Hex(consentText('Org A'))
    const b = await sha256Hex(consentText('Org B'))
    expect(a1).toBe(a2)
    expect(a1).not.toBe(b)
    expect(a1).toHaveLength(64)
  })

  it('consentContent devolve a versao e o texto renderizado', () => {
    expect(consentContent('Org A')).toEqual({
      version: CONSENT_VERSION,
      text: consentText('Org A'),
    })
  })
})
