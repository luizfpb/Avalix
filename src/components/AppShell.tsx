import { NavLink, Link, Outlet } from 'react-router'
import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../features/auth/context'
import { useOrganization } from '../features/organization/context'
import { usePendingIntakes } from '../features/anamnesis/intakeHooks'
import { subjectTermLabels } from '../lib/subjectTerm'
import { BrandLogo, BrandMark } from './BrandLogo'

type NavItem = { to: string; label: string; icon: LucideIcon }

function PendingBadge({ count, mobile = false }: { count: number; mobile?: boolean }) {
  if (count === 0) return null
  return (
    <span
      className={
        mobile
          ? 'absolute -right-2 -top-1 grid min-w-4 place-items-center rounded-full bg-warning px-1 text-[9px] font-bold text-white'
          : 'ml-auto grid min-w-5 place-items-center rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-warning'
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
  const navItems: NavItem[] = [
    { to: '/dashboard', label: 'Início', icon: LayoutDashboard },
    { to: '/avaliados', label: subjectTermLabels(organization?.subject_term).pluralCap, icon: Users },
    { to: '/carteira', label: 'Carteira', icon: ClipboardList },
    { to: '/agenda', label: 'Agenda', icon: CalendarDays },
    { to: '/configuracoes', label: 'Ajustes', icon: Settings },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="measurement-field fixed inset-y-0 left-0 z-40 hidden w-72 flex-col overflow-hidden border-r border-border/70 bg-card/80 backdrop-blur-xl lg:flex">
        <Link
          to="/dashboard"
          className="flex min-h-24 items-center gap-3 border-b border-border/70 px-6 transition-colors hover:bg-accent/40"
        >
          <BrandMark size={40} className="shadow-lg shadow-brand/20 ring-1 ring-white/10" />
          <span className="min-w-0">
            <BrandLogo height={17} className="block text-foreground" />
            <span className="mt-1.5 block truncate text-xs font-medium text-muted-foreground">
              {organization?.name ?? 'Seu espaço profissional'}
            </span>
          </span>
        </Link>

        <div className="flex flex-1 flex-col px-4 py-6">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/75">
            Espaço de trabalho
          </p>
          <nav className="mt-3 space-y-1.5" aria-label="Navegação principal">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'group relative flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-semibold transition-all focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
                    isActive
                      ? 'bg-primary/12 text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_14%,transparent)]'
                      : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={[
                        'absolute inset-y-2 left-0 w-[3px] rounded-full transition-colors',
                        isActive ? 'bg-primary' : 'bg-transparent',
                      ].join(' ')}
                    />
                    <item.icon className="size-[1.1rem]" strokeWidth={1.8} />
                    <span>{item.label}</span>
                    {item.to === '/dashboard' ? <PendingBadge count={pendingCount} /> : null}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl border border-success/15 bg-success/7 p-3.5">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
              <div>
                <p className="text-xs font-semibold">Dados protegidos</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Ambiente profissional com controles de acesso e privacidade.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border/70 p-4">
          <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground ring-1 ring-border">
              {user?.email?.slice(0, 1).toUpperCase() ?? 'A'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">{user?.email}</span>
              <span className="mt-0.5 block text-[10px] capitalize text-muted-foreground">
                {role ?? 'profissional'}
              </span>
            </span>
            <button
              onClick={() => signOut()}
              className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
              title="Sair da conta"
              aria-label="Sair da conta"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl lg:hidden">
        <div className="flex h-16 items-center justify-between gap-4 px-4">
          <Link to="/dashboard" className="flex min-w-0 items-center gap-2.5">
            <BrandMark size={34} className="shadow-md shadow-brand/20" />
            <span className="min-w-0">
              <BrandLogo height={14} className="block text-foreground" />
              <span className="mt-1 block max-w-[12rem] truncate text-[10px] font-medium text-muted-foreground">
                {organization?.name ?? 'Seu espaço profissional'}
              </span>
            </span>
          </Link>
          <button
            onClick={() => signOut()}
            className="grid size-10 place-items-center rounded-xl border border-border/80 bg-card/75 text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            aria-label="Sair da conta"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      <div className="lg:pl-72">
        <main className="measurement-field mx-auto min-h-screen max-w-[1280px] px-4 pb-28 pt-7 sm:px-6 sm:pt-10 lg:px-10 lg:pb-16 xl:px-14">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/92 px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-10px_30px_color-mix(in_oklab,var(--foreground)_6%,transparent)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-xl">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
                ].join(' ')
              }
            >
              <span className="relative">
                <item.icon className="size-5" strokeWidth={1.8} />
                {item.to === '/dashboard' ? <PendingBadge count={pendingCount} mobile /> : null}
              </span>
              <span className="max-w-full truncate">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
