import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/context'
import { useOrganization } from '../features/organization/context'
import { subjectTermLabels } from '../lib/subjectTerm'

export function AppShell() {
  const { user, signOut } = useAuth()
  const { organization } = useOrganization()
  const navItems = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/avaliados', label: subjectTermLabels(organization?.subject_term).pluralCap },
    { to: '/configuracoes', label: 'Configurações' },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-none">BodyTrack</p>
            <p className="truncate text-xs text-muted-foreground">
              {organization?.name ?? 'Sem organização'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              {user?.email}
            </span>
            <button
              onClick={() => signOut()}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              Sair
            </button>
          </div>
        </div>
        <nav className="mx-auto max-w-5xl px-4">
          <ul className="flex gap-1 overflow-x-auto">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      'inline-block whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
                      isActive
                        ? 'border-foreground text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
