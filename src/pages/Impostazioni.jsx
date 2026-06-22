import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function Impostazioni() {
  const { profile } = useAuth()
  const [tassi, setTassi] = useState({ eur_usd: '', eur_egp: '', eur_gbp: '' })
  const [categorie, setCategorie] = useState([])
  const [nuovaCategoria, setNuovaCategoria] = useState('')
  const [salvandoTassi, setSalvandoTassi] = useState(false)
  const [messaggio, setMessaggio] = useState('')

  async function carica() {
    const { data: t } = await supabase.from('tassi_cambio').select('*').order('created_at', { ascending: false }).limit(1)
    if (t && t.length) {
      setTassi({ eur_usd: t[0].eur_usd, eur_egp: t[0].eur_egp, eur_gbp: t[0].eur_gbp })
    }
    const { data: c } = await supabase.from('categorie_uscite').select('*').order('ordine')
    setCategorie(c || [])
  }

  useEffect(() => { carica() }, [])

  async function salvaTassi(e) {
    e.preventDefault()
    setSalvandoTassi(true)
    const { error } = await supabase.from('tassi_cambio').insert({
      eur_usd: Number(tassi.eur_usd),
      eur_egp: Number(tassi.eur_egp),
      eur_gbp: Number(tassi.eur_gbp),
      created_by: profile.id,
    })
    setSalvandoTassi(false)
    setMessaggio(error ? 'Errore nel salvataggio.' : 'Tassi di cambio aggiornati.')
    setTimeout(() => setMessaggio(''), 3000)
  }

  async function aggiungiCategoria(e) {
    e.preventDefault()
    if (!nuovaCategoria.trim()) return
    const ordine = categorie.length ? Math.max(...categorie.map((c) => c.ordine)) + 1 : 1
    const { error } = await supabase.from('categorie_uscite').insert({ nome: nuovaCategoria.trim(), ordine })
    if (!error) {
      setNuovaCategoria('')
      carica()
    }
  }

  async function toggleCategoria(id, attiva) {
    await supabase.from('categorie_uscite').update({ attiva: !attiva }).eq('id', id)
    carica()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Impostazioni</h1>
          <p className="page-subtitle">Tassi di cambio e categorie di spesa, visibili a tutti ma modificabili solo da te.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 28 }}>
        <h3 style={{ fontSize: 15, marginBottom: 16, fontFamily: 'var(--font-body)', fontWeight: 700 }}>Tassi di cambio (base Euro)</h3>
        <form onSubmit={salvaTassi}>
          <div className="form-grid">
            <div className="field">
              <label>1 € = ? $ (Dollari)</label>
              <input type="number" step="0.0001" value={tassi.eur_usd} onChange={(e) => setTassi((t) => ({ ...t, eur_usd: e.target.value }))} required />
            </div>
            <div className="field">
              <label>1 € = ? LE (Lire egiziane)</label>
              <input type="number" step="0.0001" value={tassi.eur_egp} onChange={(e) => setTassi((t) => ({ ...t, eur_egp: e.target.value }))} required />
            </div>
            <div className="field">
              <label>1 € = ? £ (Sterline)</label>
              <input type="number" step="0.0001" value={tassi.eur_gbp} onChange={(e) => setTassi((t) => ({ ...t, eur_gbp: e.target.value }))} required />
            </div>
          </div>
          <button type="submit" className="btn btn-accent" style={{ marginTop: 16 }} disabled={salvandoTassi}>
            {salvandoTassi ? 'Salvataggio…' : 'Aggiorna tassi di cambio'}
          </button>
          {messaggio && <span style={{ marginLeft: 14, fontSize: 13.5, color: 'var(--smeraldo)' }}>{messaggio}</span>}
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 16, fontFamily: 'var(--font-body)', fontWeight: 700 }}>Categorie di uscita</h3>

        <form onSubmit={aggiungiCategoria} style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <input type="text" value={nuovaCategoria} onChange={(e) => setNuovaCategoria(e.target.value)} placeholder="es. Marketing, Tasse…" style={{ flex: 1, padding: '10px 12px', borderRadius: 6, border: '1px solid var(--linea)' }} />
          <button type="submit" className="btn btn-primary btn-sm">Aggiungi</button>
        </form>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {categorie.map((c) => (
            <button
              key={c.id}
              onClick={() => toggleCategoria(c.id, c.attiva)}
              className="tag"
              style={{
                border: 'none',
                opacity: c.attiva ? 1 : 0.4,
                cursor: 'pointer',
              }}
              title={c.attiva ? 'Clicca per disattivare' : 'Clicca per riattivare'}
            >
              {c.nome} {c.attiva ? '' : '(disattivata)'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
