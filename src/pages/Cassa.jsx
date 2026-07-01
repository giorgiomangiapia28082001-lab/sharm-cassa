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

  const [periodoAperto, setPeriodoAperto] = useState(null)
  const [storicoPeriodi, setStoricoPeriodi] = useState([])
  const [mostraConfermaChiusura, setMostraConfermaChiusura] = useState(false)
  const [noteChiusura, setNoteChiusura] = useState('')
  const [chiudendo, setChiudendo] = useState(false)
  const [mostraStorico, setMostraStorico] = useState(false)
  const [riaprendo, setRiaprendo] = useState(false)

  async function carica() {
    setLoading(true)
    const [{ data: s }, { data: m }, { data: pAperto }, { data: pStorico }] = await Promise.all([
      supabase.from('saldo_cassa_attuale').select('*').single(),
      supabase.from('movimenti_cassa').select('*, profiles:inserito_da(nome)').order('created_at', { ascending: false }).limit(30),
      supabase.from('periodi_cassa').select('*').is('data_chiusura', null).single(),
      supabase.from('periodi_cassa').select('*, profiles:chiuso_da(nome)').not('data_chiusura', 'is', null).order('data_chiusura', { ascending: false }),
    ])
    setSaldo(s)
    setMovimenti(m || [])
    setPeriodoAperto(pAperto || null)
    setStoricoPeriodi(pStorico || [])
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

  async function eliminaMovimento(m) {
    if (m.tipo === 'incasso_b2b') {
      alert('Questo movimento proviene da un pagamento Sadiki. Per eliminarlo, vai nella sezione Sadiki ed elimina il pagamento da lì.')
      return
    }
    if (!confirm('Eliminare questo movimento? Il saldo verrà ricalcolato.')) return
    const { error } = await supabase.from('movimenti_cassa').delete().eq('id', m.id)
    if (!error) carica()
  }

  async function chiudiPeriodo() {
    setChiudendo(true)
    const { error } = await supabase.rpc('chiudi_periodo_cassa', {
      p_note: noteChiusura || null,
      p_chiuso_da: profile.id,
    })
    setChiudendo(false)
    if (!error) {
      setMostraConfermaChiusura(false)
      setNoteChiusura('')
      carica()
    } else {
      alert('Errore: ' + error.message)
    }
  }

  async function riapriPeriodo(id) {
    if (!confirm('Riaprire questo periodo passato per correggerlo? Finché resta riaperto non potrai inserire nuovi incassi/uscite/movimenti: ricordati di richiuderlo subito dopo la correzione per tornare al periodo corrente.')) return
    setRiaprendo(true)
    const { error } = await supabase.rpc('riapri_periodo_cassa', { p_periodo_id: id })
    setRiaprendo(false)
    if (!error) {
      setMostraStorico(false)
      carica()
    } else {
      alert('Errore: ' + error.message)
    }
  }

  const tassoEffettivo = (Number(cambioForm.importo_da) > 0 && Number(cambioForm.importo_a) > 0)
    ? (Number(cambioForm.importo_a) / Number(cambioForm.importo_da)).toFixed(4)
    : null

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cassa</h1>
          <p className="page-subtitle">Saldo dall'ultima chiusura periodo, da confrontare con quanto ha in mano il direttore.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => setMostraStorico((v) => !v)}>
            {mostraStorico ? '✕ Chiudi storico' : 'Storico periodi'}
          </button>
          {isMaster && !(periodoAperto && storicoPeriodi.find((p) => p.id === periodoAperto.id)) && (
            <button className="btn btn-primary" onClick={() => setMostraConfermaChiusura(true)}>
              🔒 Chiudi periodo
            </button>
          )}
        </div>
      </div>

      {isMaster && periodoAperto && storicoPeriodi.find((p) => p.id === periodoAperto.id) && (
        <div className="card" style={{ marginBottom: 24, borderLeft: '3px solid var(--corallo)', background: 'rgba(217,104,79,0.06)' }}>
          <strong style={{ color: 'var(--corallo)' }}>⚠️ Stai lavorando su un periodo passato riaperto</strong>
          <p style={{ fontSize: 13, color: 'var(--inchiostro-soft)', margin: '6px 0 12px' }}>
            Le modifiche che fai ora (incassi, uscite, movimenti) appartengono a questo vecchio periodo, non al mese corrente. Richiudilo appena hai finito di correggerlo per tornare a lavorare sul periodo attuale.
          </p>
          <button className="btn btn-primary btn-sm" onClick={() => setMostraConfermaChiusura(true)}>Richiudi questo periodo</button>
        </div>
      )}

      {mostraConfermaChiusura && saldo && (
        <div className="card" style={{ marginBottom: 24, borderLeft: '3px solid var(--corallo)' }}>
          <h3 style={{ fontSize: 15, marginBottom: 10, color: 'var(--corallo)' }}>Conferma chiusura periodo</h3>
          <p style={{ fontSize: 13, color: 'var(--inchiostro-soft)', marginBottom: 14 }}>
            Verrà salvato come storico il saldo attuale, poi la Cassa ripartirà da 0. Questa azione non elimina nessun incasso o uscita: serve solo a "fotografare" il saldo di oggi come riferimento.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
            <div className="stat-card" style={{ padding: '10px 12px' }}>
              <div className="stat-label">Contanti €</div>
              <div className="stat-value">€ {Number(saldo.contanti_eur).toFixed(2)}</div>
            </div>
            <div className="stat-card" style={{ padding: '10px 12px' }}>
              <div className="stat-label">Contanti LE</div>
              <div className="stat-value">{Number(saldo.contanti_egp).toFixed(0)} LE</div>
            </div>
            <div className="stat-card" style={{ padding: '10px 12px' }}>
              <div className="stat-label">Contanti $</div>
              <div className="stat-value">$ {Number(saldo.contanti_usd).toFixed(2)}</div>
            </div>
            <div className="stat-card" style={{ padding: '10px 12px' }}>
              <div className="stat-label">Saldo POS (LE)</div>
              <div className="stat-value">{Number(saldo.saldo_pos_egp).toFixed(0)} LE</div>
            </div>
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Note (opzionale, es. "Chiusura giugno")</label>
            <input type="text" value={noteChiusura} onChange={(e) => setNoteChiusura(e.target.value)} placeholder="es. Chiusura mese di giugno" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={chiudiPeriodo} disabled={chiudendo}>
              {chiudendo ? 'Chiusura in corso…' : 'Conferma e azzera'}
            </button>
            <button className="btn btn-ghost" onClick={() => setMostraConfermaChiusura(false)}>Annulla</button>
          </div>
        </div>
      )}

      {mostraStorico && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Storico periodi chiusi</h3>
          {storicoPeriodi.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--inchiostro-soft)' }}>Nessun periodo chiuso finora.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Periodo</th>
                    <th>Chiuso il</th>
                    <th>Contanti €</th>
                    <th>Contanti LE</th>
                    <th>Contanti $</th>
                    <th>Saldo POS</th>
                    <th>Note</th>
                    <th>Chiuso da</th>
                    {isMaster && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {storicoPeriodi.map((c) => (
                    <tr key={c.id}>
                      <td>#{c.numero}</td>
                      <td>{new Date(c.data_chiusura).toLocaleDateString('it-IT')}</td>
                      <td>€ {Number(c.contanti_eur).toFixed(2)}</td>
                      <td>{Number(c.contanti_egp).toFixed(0)} LE</td>
                      <td>$ {Number(c.contanti_usd).toFixed(2)}</td>
                      <td>{Number(c.saldo_pos_egp).toFixed(0)} LE</td>
                      <td style={{ color: 'var(--inchiostro-soft)' }}>{c.note || '—'}</td>
                      <td style={{ color: 'var(--inchiostro-soft)' }}>{c.profiles?.nome || '—'}</td>
                      {isMaster && (
                        <td>
                          <button className="btn btn-ghost btn-sm" disabled={!!periodoAperto && storicoPeriodi.find((p) => p.id === periodoAperto.id)} onClick={() => riapriPeriodo(c.id)}>
                            Riapri
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
                    <span className="tag">{m.tipo === 'cambio_valuta' ? 'Cambio valuta' : m.tipo === 'incasso_b2b' ? 'Incasso Sadiki' : 'Prelievo POS'}</span>
                  </td>
                  <td>
                    {m.tipo === 'cambio_valuta'
                      ? `${VALUTE[m.valuta_da]} ${Number(m.importo_da).toFixed(2)} → ${VALUTE[m.valuta_a]} ${Number(m.importo_a).toFixed(2)}`
                      : m.tipo === 'incasso_b2b'
                      ? `+ ${VALUTE[m.valuta_a]} ${Number(m.importo_a).toFixed(2)}`
                      : `${Number(m.importo_pos).toFixed(2)} LE da POS a contanti`}
                  </td>
                  <td style={{ color: 'var(--inchiostro-soft)' }}>{m.note || '—'}</td>
                  <td style={{ color: 'var(--inchiostro-soft)' }}>{m.profiles?.nome || '—'}</td>
                  {isMaster && (
                    <td>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--corallo)' }} onClick={() => eliminaMovimento(m)}>Elimina</button>
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
