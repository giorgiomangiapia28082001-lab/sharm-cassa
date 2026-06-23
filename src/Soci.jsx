import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const oggi = () => new Date().toISOString().slice(0, 10)

export default function Soci() {
  const { isMaster } = useAuth()
  const [soci, setSoci] = useState([])
  const [spese, setSpese] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostraForm, setMostraForm] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const [form, setForm] = useState({
    socio_id: '',
    data: oggi(),
    descrizione: '',
    importo_eur: '',
    importo_egp: '',
  })

  async function carica() {
    setLoading(true)
    const [{ data: s }, { data: sp }] = await Promise.all([
      supabase.from('soci').select('*').order('nome'),
      supabase.from('spese_socio').select('*, soci(nome)').order('data', { ascending: false }),
    ])
    setSoci(s || [])
    setSpese(sp || [])
    if (s?.length && !form.socio_id) setForm((f) => ({ ...f, socio_id: s[0].id }))
    setLoading(false)
  }

  useEffect(() => { carica() }, [])

  async function salva(e) {
    e.preventDefault()
    setSalvando(true)
    const { error } = await supabase.from('spese_socio').insert({
      socio_id: form.socio_id,
      data: form.data,
      descrizione: form.descrizione || null,
      importo_eur: Number(form.importo_eur) || 0,
      importo_egp: Number(form.importo_egp) || 0,
    })
    setSalvando(false)
    if (!error) {
      setForm((f) => ({ ...f, descrizione: '', importo_eur: '', importo_egp: '' }))
      carica()
    } else {
      alert('Errore: ' + error.message)
    }
  }

  const totaliPerSocio = soci.map((s) => {
    const sueSpese = spese.filter((sp) => sp.socio_id === s.id)
    return {
      ...s,
      totaleEur: sueSpese.reduce((acc, sp) => acc + Number(sp.importo_eur), 0),
      totaleEgp: sueSpese.reduce((acc, sp) => acc + Number(sp.importo_egp), 0),
    }
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Spese soci</h1>
          <p className="page-subtitle">Spese personali sostenute dai proprietari, scalate a parte dall'utile da dividere a fine mese.</p>
        </div>
        {isMaster && (
          <button className="btn btn-primary" onClick={() => setMostraForm((v) => !v)}>
            {mostraForm ? 'Nascondi modulo' : '+ Nuova spesa'}
          </button>
        )}
      </div>

      <div className="stats-grid">
        {totaliPerSocio.map((s) => (
          <div key={s.id} className="stat-card">
            <div className="stat-label">{s.nome} — totale</div>
            <div className="stat-value">€ {s.totaleEur.toFixed(2)}</div>
            <div style={{ fontSize: 13, color: 'var(--inchiostro-soft)', marginTop: 4 }}>{s.totaleEgp.toFixed(0)} LE</div>
          </div>
        ))}
      </div>

      {isMaster && mostraForm && (
        <form onSubmit={salva} className="card" style={{ marginBottom: 28 }}>
          <div className="form-grid">
            <div className="field">
              <label>Socio</label>
              <select value={form.socio_id} onChange={(e) => setForm((f) => ({ ...f, socio_id: e.target.value }))}>
                {soci.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Data</label>
              <input type="date" value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} required />
            </div>
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <label>Descrizione</label>
              <input type="text" value={form.descrizione} onChange={(e) => setForm((f) => ({ ...f, descrizione: e.target.value }))} placeholder="opzionale" />
            </div>
            <div className="field">
              <label>Importo €</label>
              <input type="number" step="0.01" value={form.importo_eur} onChange={(e) => setForm((f) => ({ ...f, importo_eur: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="field">
              <label>Importo LE</label>
              <input type="number" step="0.01" value={form.importo_egp} onChange={(e) => setForm((f) => ({ ...f, importo_egp: e.target.value }))} placeholder="0.00" />
            </div>
          </div>
          <button type="submit" className="btn btn-accent" style={{ marginTop: 18 }} disabled={salvando}>
            {salvando ? 'Salvataggio…' : 'Salva spesa'}
          </button>
        </form>
      )}

      <h3 style={{ fontSize: 16, marginBottom: 14, color: 'var(--notte)' }}>Storico</h3>

      {loading ? (
        <p className="page-subtitle">Caricamento…</p>
      ) : spese.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-title">Nessuna spesa registrata</div>
          <p>Le spese personali dei soci appariranno qui.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Socio</th>
                <th>Descrizione</th>
                <th>Importo €</th>
                <th>Importo LE</th>
              </tr>
            </thead>
            <tbody>
              {spese.map((s) => (
                <tr key={s.id}>
                  <td>{new Date(s.data).toLocaleDateString('it-IT')}</td>
                  <td><span className="tag">{s.soci?.nome}</span></td>
                  <td>{s.descrizione || '—'}</td>
                  <td>€ {Number(s.importo_eur).toFixed(2)}</td>
                  <td>{Number(s.importo_egp).toFixed(0)} LE</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
