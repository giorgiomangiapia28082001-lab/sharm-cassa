import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

const NAV_ITEMS = [
  { to: '/', icon: '◈', label: 'Riepilogo', roles: ['master', 'operatore', 'viewer', 'proprietario'] },
  { to: '/cassa', icon: '◫', label: 'Cassa', roles: ['master', 'operatore', 'viewer', 'proprietario'] },
  { to: '/archivio', icon: '▤', label: 'Archivio periodi', roles: ['master', 'viewer', 'proprietario'] },
  { to: '/incassi', icon: '€', label: 'Incassi serata', roles: ['master', 'operatore', 'viewer', 'proprietario'] },
  { to: '/chioschetto', icon: '☕', label: 'Chioschetto', roles: ['master', 'operatore', 'viewer', 'proprietario'] },
  { to: '/uscite', icon: '↓', label: 'Uscite', roles: ['master', 'operatore', 'viewer', 'proprietario'] },
  { to: '/spese-fisse', icon: '⏲', label: 'Spese fisse', roles: ['master', 'operatore', 'viewer', 'proprietario'] },
  { to: '/dipendenti', icon: '◐', label: 'Dipendenti', roles: ['master', 'operatore', 'viewer', 'proprietario'] },
  { to: '/inventario', icon: '▦', label: 'Inventario', roles: ['master', 'operatore', 'viewer', 'proprietario'] },
  { to: '/soci', icon: '◆', label: 'Spese soci', roles: ['master', 'viewer', 'proprietario'] },
  { to: '/impostazioni', icon: '⚙', label: 'Impostazioni', roles: ['master'] },
]

const ROLE_LABELS = {
  master: 'Master',
  operatore: 'Operatore',
  viewer: 'Sola visione',
  proprietario: 'Proprietario',
}

export default function Layout() {
  const { profile, signOut } = useAuth()
  const ruolo = profile?.ruolo
  const { pathname } = useLocation()
  // Sul telefono il menu è un pannello che si apre con ☰ (su computer è
  // sempre visibile a sinistra e questo stato non conta).
  const [menuAperto, setMenuAperto] = useState(false)

  const items = NAV_ITEMS.filter((item) => item.roles.includes(ruolo))
  const paginaAttuale = items.find((i) => (i.to === '/' ? pathname === '/' : pathname.startsWith(i.to)))

  // Cambiando pagina il menu si richiude e si torna in cima.
  useEffect(() => {
    setMenuAperto(false)
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="topbar-menu" onClick={() => setMenuAperto(true)} aria-label="Apri il menu">☰</button>
        <div className="topbar-titolo">
          <span className="topbar-brand">Sharm Cassa</span>
          {paginaAttuale && <span className="topbar-pagina">{paginaAttuale.label}</span>}
        </div>
      </header>

      {menuAperto && <div className="sidebar-velo" onClick={() => setMenuAperto(false)} />}

      <aside className={`sidebar${menuAperto ? ' aperta' : ''}`}>
        <div className="sidebar-testa">
          <div>
            <div className="brand">Sharm Cassa</div>
            <div className="brand-sub">Gestionale ristorante</div>
          </div>
          <button className="sidebar-chiudi" onClick={() => setMenuAperto(false)} aria-label="Chiudi il menu">✕</button>
        </div>

        <nav>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMenuAperto(false)}
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
