import clsx from 'clsx'
import { NavLink, Outlet } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/', label: 'Bibliothek', end: true },
  { to: '/dashboard', label: 'Statistiken', end: false },
  { to: '/play', label: 'Spielen', end: false },
  { to: '/settings', label: 'Einstellungen', end: false },
]

export default function Layout() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-6 border-b border-(--color-border) bg-(--color-bg-elevated) px-5 py-3">
        <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="text-(--color-accent-strong)">♞</span> ChessAnalyzer
        </span>
        <nav className="flex gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-(--color-bg-panel) text-(--color-accent-strong)'
                    : 'text-(--color-text-muted) hover:bg-white/5 hover:text-(--color-text)',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
