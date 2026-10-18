import { useEffect, useMemo, useRef } from 'react'
import { NavLink, Link, Outlet, useLocation } from 'react-router'
import { Calculator, CalendarDays, CreditCard, Dumbbell, LayoutDashboard, LogOut, Settings, Users, type LucideIcon } from 'lucide-react'
import { useAuth } from '../features/auth/context'
import { useOrganization } from '../features/organization/context'
import { usePendingIntakes } from '../features/anamnesis/intakeHooks'
import { subjectTermLabels } from '../lib/subjectTerm'
import { roleLabel } from '../lib/roles'
import { BrandLogo, BrandMark } from './BrandLogo'
import { BillingBanner } from './BillingBanner'

// end: só fica ativo na rota exata (Ajustes não acende dentro de /configuracoes/plano)
type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean }

// Só na barra lateral do computador: no celular a barra de baixo comporta
// quatro itens e essas telas seguem em Início e Ajustes.
const toolItems: NavItem[] = [
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/exercicios', label: 'Exercícios', icon: Dumbbell },
  { to: '/ferramentas/1rm', label: 'Calculadora 1RM', icon: Calculator },
]

const sideLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'flex h-11 items-center gap-3 rounded-md px-3 text-[0.9375rem] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
    isActive
      ? 'bg-accent text-foreground'
      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
  ].join(' ')

function PendingBadge({ count, mobile = false }: { count: number; mobile?: boolean }) {
  if (count === 0) return null
  return (
    <span
      aria-label={`${count} ${count === 1 ? 'anamnese pendente' : 'anamneses pendentes'}`}
      className={
        mobile
          ? 'absolute right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-warning px-1 text-xs leading-none font-semibold text-background'
          : 'ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-warning/15 px-1.5 text-xs leading-none font-semibold text-warning'
      }
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function AppShell() {
  const { user, signOut } = useAuth()
  const { organization, role } = useOrganization()
  const pendingCount = usePendingIntakes(organization?.id).data?.length ?? 0
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const previousPath = useRef<string | null>(null)
  const subjectLabel = subjectTermLabels(organization?.subject_term).pluralCap
  const navItems: NavItem[] = useMemo(() => [
    { to: '/dashboard', label: 'Início', icon: LayoutDashboard },
    { to: '/avaliados', label: subjectLabel, icon: Users },
    { to: '/configuracoes/plano', label: 'Plano', icon: CreditCard },
    { to: '/configuracoes', label: 'Ajustes', icon: Settings, end: true },
  ], [subjectLabel])

  useEffect(() => {
    const current = [...navItems, ...toolItems].find((item) =>
      location.pathname === item.to ||
      (!item.end && item.to !== '/dashboard' && location.pathname.startsWith(`${item.to}/`))
    )?.label ?? (location.pathname.startsWith('/configuracoes/') ? 'Ajustes' : undefined)
    const section = current ?? (location.pathname.includes('/treinos') ? 'Treinos' : location.pathname.includes('/postural') ? 'Postura' : location.pathname.includes('/avaliacoes') ? 'Avaliações' : 'Avalix')
    document.title = section === 'Avalix' ? 'Avalix' : `${section} · Avalix`
    if (previousPath.current && previousPath.current !== location.pathname) mainRef.current?.focus()
    previousPath.current = location.pathname
  }, [location.pathname, navItems])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#app-main"
        className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-md bg-primary-solid px-4 py-2 text-sm font-medium text-primary-foreground transition-transform focus:translate-y-0"
      >
        Ir para o conteúdo principal
      </a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-card lg:flex xl:w-72">
        <Link
          to="/dashboard"
          className="flex h-[4.5rem] shrink-0 items-center gap-3 border-b px-5 transition-colors hover:bg-accent/60"
        >
          <BrandMark size={36} />
          <span className="min-w-0">
            <BrandLogo height={15} className="block text-foreground" />
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {organization?.name ?? 'Seu espaço profissional'}
            </span>
          </span>
        </Link>

        <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          <nav className="space-y-1" aria-label="Navegação principal">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={sideLinkClass}>
                <item.icon className="size-5" strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.to === '/dashboard' ? <PendingBadge count={pendingCount} /> : null}
              </NavLink>
            ))}
          </nav>
          <nav className="space-y-1 border-t pt-5" aria-labelledby="ferramentas-titulo">
            <p id="ferramentas-titulo" className="px-3 pb-1 text-xs font-medium text-muted-foreground">
              Ferramentas
            </p>
            {toolItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={sideLinkClass}>
                <item.icon className="size-5" strokeWidth={1.8} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3 border-t px-5 py-4">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user?.email}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{roleLabel(role)}</span>
          </span>
          <button
            onClick={() => signOut()}
            className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            title="Sair da conta"
            aria-label="Sair da conta"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-40 border-b bg-background lg:hidden">
        <div className="flex h-14 items-center justify-between gap-4 px-4">
          <Link to="/dashboard" className="flex min-w-0 items-center gap-2.5">
            <BrandMark size={30} />
            <span className="min-w-0">
              <BrandLogo height={13} className="block text-foreground" />
              <span className="mt-0.5 block max-w-[12rem] truncate text-xs text-muted-foreground">
                {organization?.name ?? 'Seu espaço profissional'}
              </span>
            </span>
          </Link>
          <button
            onClick={() => signOut()}
            className="grid size-10 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            aria-label="Sair da conta"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      <div className="lg:pl-64 xl:pl-72">
        <main id="app-main" ref={mainRef} tabIndex={-1} className="relative mx-auto min-h-screen max-w-[1480px] px-4 pb-28 pt-7 outline-none sm:px-6 sm:pt-10 lg:px-10 lg:pb-16 xl:px-14">
          <BillingBanner />
          <Outlet />
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 lg:hidden"
        aria-label="Navegação principal"
      >
        <div className="mx-auto flex max-w-xl">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md px-1 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`relative rounded-full px-4 py-1 ${isActive ? 'bg-accent' : ''}`}>
                    <item.icon className="size-5" strokeWidth={1.8} />
                    {item.to === '/dashboard' ? <PendingBadge count={pendingCount} mobile /> : null}
                  </span>
                  <span className="max-w-full truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
