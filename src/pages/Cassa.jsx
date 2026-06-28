import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

import { oggiLocale } from '../lib/date'

const oggi = oggiLocale

const VALUTE = { EUR: '€', USD: '$', EGP: 'LE' }

export default function Cassa() {
  const { profile, isMaster } = useAuth()
  const [saldo, setSaldo] = useState(null)
  const [movimenti, setMovimenti] = useState([])
  const [loading, setLoading] = useState(true)
  const [salvandoCambio, setSalvandoCambio] = useState(false)
  const [salvandoPrelievo, setSalvandoPrelievo] = useState(false)

  const [cambioForm, setCambioForm] = useState({ valuta_da: 'EUR', importo_da: '', valuta_a: 'EGP', importo_a: '', note: '' })
  const [prelievoForm, setPrelievoForm] = useState({ importo_pos: '', note: '' })

  async function carica() {
    setLoading(true)
    const [{ data: s }, { data: m }] = await Promise.all([
      supabase.from('saldo_cassa_attuale').select('*').single(),
      supabase.from('movimenti_cassa').select('*, profiles:inserito_da(nome)').order('created_at', { ascending: false }).limit(30),
    ])
    setSaldo(s)
    setMovimenti(m || [])
    setLoading(false)
  }

  useEffect(() => { carica() }, [])

  async function salvaCambio(e) {
    e.preventDefault()
    setSalvandoCambio(true)
    const { error } = await supabase.from('movimenti_cassa').insert({
      tipo: 'cambio_valuta',
      data: oggi(),
      valuta_da: cambioForm.valuta_da,
      importo_da: Number(cambioForm.importo_da) || 0,
      valuta_a: cambioForm.valuta_a,
      importo_a: Number(cambioForm.importo_a) || 0,
      note: cambioForm.note || null,
      inserito_da: profile.id,
    })
    setSalvandoCambio(false)
    if (!error) {
      setCambioForm({ valuta_da: 'EUR', importo_da: '', valuta_a: 'EGP', importo_a: '', note: '' })
      carica()
    } else {
      alert('Errore: ' + error.message)
    }
  }

  async function salvaPrelievo(e) {
    e.preventDefault()
    setSalvandoPrelievo(true)
    const { error } = await supabase.from('movimenti_cassa').insert({
      tipo: 'prelievo_pos',
      data: oggi(),
      importo_pos: Number(prelievoForm.importo_pos) || 0,
      note: prelievoForm.note || null,
      inserito_da: profile.id,
    })
    setSalvandoPrelievo(false)
    if (!error) {
      setPrelievoForm({ importo_pos: '', note: '' })
      carica()
    } else {
      alert('Errore: ' + error.message)
    }
  }

  async function eliminaMovimento(id) {
    if (!confirm('Eliminare questo movimento? Il saldo verrà ricalcolato.')) return
    const { error } = await supabase.from('movimenti_cassa').delete().eq('id', id)
    if (!error) carica()
  }

  const tassoEffettivo = (Number(cambioForm.importo_da) > 0 && Number(cambioForm.importo_a) > 0)
    ? (Number(cambioForm.importo_a) / Number(cambioForm.importo_da)).toFixed(4)
    : null

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cassa</h1>
          <p className="page-subtitle">Saldo in tempo reale di contanti e POS, da confrontare con quanto ha in mano il direttore.</p>
        </div>
      </div>

      {loading || !saldo ? (
        <p className="page-subtitle">Caricamento…</p>
      ) : (
        <div className="stats-grid" style={{ marginBottom: 28 }}>
          <div className="stat-card">
            <div className="stat-label">Contanti €</div>
            <div className="stat-value">€ {Number(saldo.contanti_eur).toFixed(2)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Contanti LE</div>
            <div className="stat-value">{Number(saldo.contanti_egp).toFixed(0)} LE</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Contanti $</div>
            <div className="stat-value">$ {Number(saldo.contanti_usd).toFixed(2)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Saldo POS (LE)</div>
            <div className="stat-value">{Number(saldo.saldo_pos_egp).toFixed(0)} LE</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 28 }}>
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 14, fontFamily: 'var(--font-body)', fontWeight: 700 }}>Cambio valuta</h3>
          <form onSubmit={salvaCambio}>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="field">
                <label>Dò (valuta)</label>
                <select value={cambioForm.valuta_da} onChange={(e) => setCambioForm((f) => ({ ...f, valuta_da: e.target.value }))}>
                  <option value="EUR">Euro (€)</option>
                  <option value="USD">Dollari ($)</option>
                  <option value="EGP">Lire (LE)</option>
                </select>
              </div>
              <div className="field">
                <label>Importo dato</label>
                <input type="number" step="0.01" value={cambioForm.importo_da} onChange={(e) => setCambioForm((f) => ({ ...f, importo_da: e.target.value }))} placeholder="0.00" required />
              </div>
              <div className="field">
                <label>Ricevo (valuta)</label>
                <select value={cambioForm.valuta_a} onChange={(e) => setCambioForm((f) => ({ ...f, valuta_a: e.target.value }))}>
                  <option value="EGP">Lire (LE)</option>
                  <option value="EUR">Euro (€)</option>
                  <option value="USD">Dollari ($)</option>
                </select>
              </div>
              <div className="field">
                <label>Importo ricevuto</label>
                <input type="number" step="0.01" value={cambioForm.importo_a} onChange={(e) => setCambioForm((f) => ({ ...f, importo_a: e.target.value }))} placeholder="0.00" required />
              </div>
            </div>
            {tassoEffettivo && (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--inchiostro-soft)' }}>
                Tasso effettivo: 1 {cambioForm.valuta_da} = {tassoEffettivo} {cambioForm.valuta_a}
              </div>
            )}
            <div className="field" style={{ marginTop: 12 }}>
              <label>Note (opzionale)</label>
              <input type="text" value={cambioForm.note} onChange={(e) => setCambioForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
            <button type="submit" className="btn btn-accent btn-sm" style={{ marginTop: 14 }} disabled={salvandoCambio}>
              {salvandoCambio ? 'Salvataggio…' : 'Registra cambio'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 14, fontFamily: 'var(--font-body)', fontWeight: 700 }}>Prelievo da POS → Contanti</h3>
          <p style={{ fontSize: 13, color: 'var(--inchiostro-soft)', marginBottom: 14 }}>
            Quando si prelevano soldi accumulati sul POS e diventano contanti in cassa (LE).
          </p>
          <form onSubmit={salvaPrelievo}>
            <div className="field">
              <label>Importo prelevato (LE)</label>
              <input type="number" step="0.01" value={prelievoForm.importo_pos} onChange={(e) => setPrelievoForm((f) => ({ ...f, importo_pos: e.target.value }))} placeholder="0.00" required />
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Note (opzionale)</label>
              <input type="text" value={prelievoForm.note} onChange={(e) => setPrelievoForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
            <button type="submit" className="btn btn-accent btn-sm" style={{ marginTop: 14 }} disabled={salvandoPrelievo}>
              {salvandoPrelievo ? 'Salvataggio…' : 'Registra prelievo'}
            </button>
          </form>
        </div>
      </div>

      <h3 style={{ fontSize: 16, marginBottom: 14, color: 'var(--notte)' }}>Movimenti recenti</h3>
      {movimenti.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-title">Nessun movimento registrato</div>
          <p>Cambi valuta e prelievi POS appariranno qui.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Dettaglio</th>
                <th>Note</th>
                <th>Inserito da</th>
                {isMaster && <th></th>}
              </tr>
            </thead>
            <tbody>
              {movimenti.map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.data).toLocaleDateString('it-IT')}</td>
                  <td>
                    <span className="tag">{m.tipo === 'cambio_valuta' ? 'Cambio valuta' : 'Prelievo POS'}</span>
                  </td>
                  <td>
                    {m.tipo === 'cambio_valuta'
                      ? `${VALUTE[m.valuta_da]} ${Number(m.importo_da).toFixed(2)} → ${VALUTE[m.valuta_a]} ${Number(m.importo_a).toFixed(2)}`
                      : `${Number(m.importo_pos).toFixed(2)} LE da POS a contanti`}
                  </td>
                  <td style={{ color: 'var(--inchiostro-soft)' }}>{m.note || '—'}</td>
                  <td style={{ color: 'var(--inchiostro-soft)' }}>{m.profiles?.nome || '—'}</td>
                  {isMaster && (
                    <td>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--corallo)' }} onClick={() => eliminaMovimento(m.id)}>Elimina</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
