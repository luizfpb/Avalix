// Papel do membro na organização (org_members.role, CHECK da migration 0001)
// como aparece na tela. Valor desconhecido não vira texto em inglês cru.
const LABELS: Record<string, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  evaluator: 'Profissional',
}

export function roleLabel(role: string | null | undefined): string {
  return (role && LABELS[role]) || 'Profissional'
}
