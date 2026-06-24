import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

const NAV_ITEMS = [
  { to: '/', icon: '◈', label: 'Riepilogo', roles: ['master', 'operatore', 'viewer'] },
  { to: '/incassi', icon: '€', label: 'Incassi serata', roles: ['master', 'operatore', 'viewer'] },
  { to: '/uscite', icon: '↓', label: 'Uscite', roles: ['master', 'operatore', 'viewer'] },
  { to: '/spese-fisse', icon: '⏲', label: 'Spese fisse', roles: ['master', 'operatore', 'viewer'] },
  { to: '/dipendenti', icon: '◐', label: 'Dipendenti', roles: ['master', 'operatore', 'viewer'] },
  { to: '/soci', icon: '◆', label: 'Spese soci', roles: ['master', 'viewer'] },
  { to: '/impostazioni', icon: '⚙', label: 'Impostazioni', roles: ['master'] },
]

const ROLE_LABELS = {
  master: 'Master',
  operatore: 'Operatore',
  viewer: 'Sola visione',
}

export default function Layout() {
  const { profile, signOut } = useAuth()
  const ruolo = profile?.ruolo

  const items = NAV_ITEMS.filter((item) => item.roles.includes(ruolo))

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Sharm Cassa</div>
        <div className="brand-sub">Gestionale ristorante</div>

        <nav>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div>{profile?.nome}</div>
          <span className="role-badge">{ROLE_LABELS[ruolo] || ruolo}</span>
          <div style={{ marginTop: 14 }}>
            <button
              onClick={signOut}
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--avorio)', borderColor: 'rgba(247,243,234,0.25)', width: '100%' }}
            >
              Esci
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
