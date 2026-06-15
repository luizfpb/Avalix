import { supabase } from '../../lib/supabase'
import { sha256Hex } from '../../lib/hash'
import { consentText, CONSENT_VERSION } from './text'
import type { Database } from '../../lib/database.types'

export type ConsentRow = Database['public']['Tables']['consent_records']['Row']
export type SignerKind = 'titular' | 'responsavel'

// consentimento vigente = registro mais recente do subject sem revoked_at
export async function getActiveConsent(subjectId: string): Promise<ConsentRow | null> {
  const { data, error } = await supabase
    .from('consent_records')
    .select('*')
    .eq('subject_id', subjectId)
    .is('revoked_at', null)
    .order('granted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export type GrantConsentInput = {
  subjectId: string
  orgId: string
  collectedBy: string
  controllerName: string | null
  signerKind: SignerKind
  signerName: string
}

// O hash é do texto exato exibido (com o nome do Controlador). org_id é exigido
// pelo tipo, mas o trigger consent_b1_org recopia do subject de qualquer forma.
export async function grantConsent(input: GrantConsentInput): Promise<ConsentRow> {
  const text = consentText(input.controllerName)
  const hash = await sha256Hex(text)
  const { data, error } = await supabase
    .from('consent_records')
    .insert({
      subject_id: input.subjectId,
      org_id: input.orgId,
      collected_by: input.collectedBy,
      consent_version: CONSENT_VERSION,
      consent_text_sha256: hash,
      signer_kind: input.signerKind,
      signer_name: input.signerName.trim(),
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function revokeConsent(consentId: string): Promise<void> {
  const { error } = await supabase
    .from('consent_records')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', consentId)
  if (error) throw error
}
