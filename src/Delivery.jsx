import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const oggi = () => new Date().toISOString().slice(0, 10)

export default function Delivery() {
  const { profile, isMaster, isViewer } = useAuth()
  const [righe, setRighe] = useState([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [mostraForm, setMostraForm] = useState(!isViewer)

  const [form, setForm] = useState({
    data: oggi(),
    importo_eur: '',
    importo_egp: '',
    note: '',
  })

  async function carica() {
    setLoading(true)
    const { data, error } = await supabase
      .from('delivery')
      .select('*, profiles:inserito_da(nome)')
      .order('data', { ascending: false })
      .limit(60)
    if (!error) setRighe(data)
    setLoading(false)
  }

  useEffect(() => { carica() }, [])

  function update(campo, valore) {
    setForm((f) => ({ ...f, [campo]: valore }))
  }

  async function salva(e) {
    e.preventDefault()
    setSalvando(true)
    const { error } = await supabase.from('delivery').insert({
      data: form.data,
      importo_eur: Number(form.importo_eur) || 0,
      importo_egp: Number(form.importo_egp) || 0,
      note: form.note || null,
      inserito_da: profile.id,
    })
    setSalvando(false)
    if (!error) {
      setForm({ data: oggi(), importo_eur: '', importo_egp: '', note: '' })
      carica()
    } else {
      alert('Errore nel salvataggio: ' + error.message)
    }
  }

  const puoInserire = isMaster || profile?.ruolo === 'operatore'
  const totEur = righe.reduce((a, r) => a + Number(r.importo_eur), 0)
  const totEgp = righe.reduce((a, r) => a + Number(r.importo_egp), 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Delivery</h1>
          <p className="page-subtitle">Incassi degli ordini a domicilio, separati dalla cassa di sala.</p>
        </div>
        {puoInserire && (
          <button className="btn btn-primary" onClick={() => setMostraForm((v) => !v)}>
            {mostraForm ? 'Nascondi modulo' : '+ Nuovo incasso delivery'}
          </button>
        )}
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Totale Delivery € (ultimi 60)</div>
          <div className="stat-value">€ {totEur.toFixed(2)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Totale Delivery LE (ultimi 60)</div>
          <div className="stat-value">{totEgp.toFixed(0)} LE</div>
        </div>
      </div>

      {puoInserire && mostraForm && (
        <form onSubmit={salva} className="card" style={{ marginBottom: 28 }}>
          <div className="form-grid">
            <div className="field">
              <label>Data</label>
              <input type="date" value={form.data} onChange={(e) => update('data', e.target.value)} required />
            </div>
            <div className="field">
              <label>Incasso delivery €</label>
              <input type="number" step="0.01" value={form.importo_eur} onChange={(e) => update('importo_eur', e.target.value)} placeholder="0.00" />
            </div>
            <div className="field">
              <label>Incasso delivery LE</label>
              <input type="number" step="0.01" value={form.importo_egp} onChange={(e) => update('importo_egp', e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <label>Note (opzionale)</label>
            <input type="text" value={form.note} onChange={(e) => update('note', e.target.value)} placeholder="es. piattaforma usata, numero ordini…" />
          </div>
          <button type="submit" className="btn btn-accent" style={{ marginTop: 18 }} disabled={salvando}>
            {salvando ? 'Salvataggio…' : 'Salva delivery'}
          </button>
        </form>
      )}

      <h3 style={{ fontSize: 16, marginBottom: 14, color: 'var(--notte)' }}>Storico</h3>

      {loading ? (
        <p className="page-subtitle">Caricamento…</p>
      ) : righe.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-title">Nessun incasso delivery registrato</div>
          <p>Quando inserisci il primo incasso, apparirà qui.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>€ Delivery</th>
                <th>LE Delivery</th>
                <th>Note</th>
                <th>Inserito da</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.data).toLocaleDateString('it-IT')}</td>
                  <td>€ {Number(r.importo_eur).toFixed(2)}</td>
                  <td>{Number(r.importo_egp).toFixed(0)} LE</td>
                  <td style={{ color: 'var(--inchiostro-soft)' }}>{r.note || '—'}</td>
                  <td style={{ color: 'var(--inchiostro-soft)' }}>{r.profiles?.nome || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
