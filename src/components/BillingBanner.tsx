import { Link, useLocation } from 'react-router'
import { useOrganization } from '../features/organization/context'
import { useOrgBilling } from '../features/billing/api'
import { billingBanner } from '../features/billing/rules'
import { subjectTermLabels } from '../lib/subjectTerm'

const TONES = {
  info: 'border-primary/25 bg-primary/5',
  warn: 'border-warning/35 bg-warning/10',
  danger: 'border-destructive/35 bg-destructive/10',
} as const

// Faixa do topo: teste acabando, pagamento em atraso, conta só leitura ou
// limite do plano. Some na própria tela do plano, que já mostra tudo isso.
export function BillingBanner() {
  const { organization } = useOrganization()
  const { data } = useOrgBilling(organization?.id)
  const location = useLocation()
  if (!data || location.pathname === '/configuracoes/plano') return null
  const banner = billingBanner(data, new Date(), subjectTermLabels(organization?.subject_term).plural)
  if (!banner) return null

  return (
    <div
      role={banner.tone === 'danger' ? 'alert' : 'status'}
      className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm ${TONES[banner.tone]}`}
    >
      <span>{banner.text}</span>
      {data.can_manage ? (
        <Link
          to="/configuracoes/plano"
          className="shrink-0 rounded-md bg-primary-solid px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-solid/90"
        >
          {banner.cta}
        </Link>
      ) : (
        <span className="text-xs text-muted-foreground">Avise o dono da organização.</span>
      )}
    </div>
  )
}
