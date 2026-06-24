import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Login from './pages/Login'
import Layout from './pages/Layout'
import Riepilogo from './pages/Riepilogo'
import Cassa from './pages/Cassa'
import Incassi from './pages/Incassi'
import SpeseFisse from './pages/SpeseFisse'
import Uscite from './pages/Uscite'
import Dipendenti from './pages/Dipendenti'
import Soci from './pages/Soci'
import Impostazioni from './pages/Impostazioni'

function RotteProtette() {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--inchiostro-soft)' }}>
        Caricamento…
      </div>
    )
  }

  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  // Sessione attiva ma profilo non ancora caricato o assente
  if (!profile) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--inchiostro-soft)', textAlign: 'center', padding: 20 }}>
        Il tuo account non ha ancora un ruolo assegnato.<br />Contatta il responsabile del gestionale.
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Riepilogo />} />
        <Route path="cassa" element={<Cassa />} />
        <Route path="incassi" element={<Incassi />} />
        <Route path="spese-fisse" element={<SpeseFisse />} />
        <Route path="uscite" element={<Uscite />} />
        <Route path="dipendenti" element={<Dipendenti />} />
        <Route
          path="soci"
          element={profile.ruolo === 'master' || profile.ruolo === 'viewer' ? <Soci /> : <Navigate to="/" />}
        />
        <Route
          path="impostazioni"
          element={profile.ruolo === 'master' ? <Impostazioni /> : <Navigate to="/" />}
        />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RotteProtette />
      </AuthProvider>
    </BrowserRouter>
  )
}
