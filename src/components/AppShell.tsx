import { NavLink, Link, Outlet } from 'react-router'
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  CalendarDays,
  Settings,
  LogOut,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../features/auth/context'
import { useOrganization } from '../features/organization/context'
import { subjectTermLabels } from '../lib/subjectTerm'
import { BrandLogo, BrandMark } from './BrandLogo'

type NavItem = { to: string; label: string; icon: LucideIcon }

export function AppShell() {
  const { user, signOut } = useAuth()
  const { organization } = useOrganization()
  const navItems: NavItem[] = [
    { to: '/dashboard', label: 'Início', icon: LayoutDashboard },
    { to: '/avaliados', label: subjectTermLabels(organization?.subject_term).pluralCap, icon: Users },
    { to: '/carteira', label: 'Carteira', icon: ClipboardList },
    { to: '/agenda', label: 'Agenda', icon: CalendarDays },
    { to: '/configuracoes', label: 'Ajustes', icon: Settings },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link to="/dashboard" className="flex min-w-0 items-center gap-2.5">
            <BrandMark size={32} />
            <span className="min-w-0">
              <BrandLogo height={14} className="block text-foreground" />
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {organization?.name ?? 'Sem organização'}
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden max-w-[12rem] truncate text-xs text-muted-foreground sm:inline">
              {user?.email}
            </span>
            <button
              onClick={() => signOut()}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
        {/* nav desktop: abas com acento no item ativo */}
        <nav className="mx-auto hidden max-w-5xl gap-1 px-4 sm:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:pb-12">
        <Outlet />
      </main>

      {/* nav mobile: barra inferior fixa, cara de app */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur-sm sm:hidden">
        <div className="mx-auto flex max-w-5xl">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                ].join(' ')
              }
            >
              <item.icon className="size-5" />
              <span className="max-w-full truncate px-1">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
