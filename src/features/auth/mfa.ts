import type { AuthenticatorAssuranceLevels } from '@supabase/supabase-js'
import type { MfaStatus } from './context'

type AssuranceData = {
  currentLevel: AuthenticatorAssuranceLevels | null
  nextLevel: AuthenticatorAssuranceLevels | null
  currentAuthenticationMethods?: unknown
}

export function mfaStatusFromAssurance(
  data: AssuranceData | null
): MfaStatus {
  if (data?.currentLevel === 'aal1' && data.nextLevel === 'aal2') return 'required'
  if (data?.currentLevel === 'aal2') return 'ok'
  if (data?.currentLevel === 'aal1' && (data.nextLevel === 'aal1' || data.nextLevel === null)) {
    return 'ok'
  }
  return 'unknown'
}
