import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const oggi = () => new Date().toISOString().slice(0, 10)

const VUOTO = {
  data: oggi(),
  eur_contanti: '',
  fondo_cassa: '',
  bonifici: '',
  egp_pos: '',
  usd_contanti: '',
  egp_contanti: '',
  delivery_eur: '',
  delivery_egp: '',
  numero_persone: '',
  note: '',
}

export default function Incassi() {
  const { profile, isMaster, isViewer } = useAuth()
  const [righe, setRighe] = useState([])
  const [form, setForm] = useState(VUOTO)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [mostraForm, setMostraForm] = useState(!isViewer)

  async function carica() {
    setLoading(true)
    const { data, error } = await supabase
      .from('incassi')
      .select('*, profiles:inserito_da(nome)')
      .order('data', { ascending: false })
      .limit(60)
    if (!error) setRighe(data)
    setLoading(false)
  }

  useEffect(() => {
    carica()
  }, [])

  function update(campo, valore) {
    setForm((f) => ({ ...f, [campo]: valore }))
  }

  async function salva(e) {
    e.preventDefault()
    setSalvando(true)
    const payload = {
      data: form.data,
      eur_contanti: Number(form.eur_contanti) || 0,
      fondo_cassa: Number(form.fondo_cassa) || 0,
      bonifici: Number(form.bonifici) || 0,
      egp_pos: Number(form.egp_pos) || 0,
      usd_contanti: Number(form.usd_contanti) || 0,
      egp_contanti: Number(form.egp_contanti) || 0,
      delivery_eur: Number(form.delivery_eur) || 0,
      delivery_egp: Number(form.delivery_egp) || 0,
      numero_persone: Number(form.numero_persone) || 0,
      note: form.note || null,
      inserito_da: profile.id,
    }
    const { error } = await supabase.from('incassi').insert(payload)
    setSalvando(false)
    if (!error) {
      setForm({ ...VUOTO, data: oggi() })
      carica()
    } else {
      alert('Errore nel salvataggio: ' + error.message)
    }
  }

  const puoInserire = isMaster || profile?.ruolo === 'operatore'

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Incassi serata</h1>
          <p className="page-subtitle">Registra l'incasso di sala e il delivery di ogni serata, diviso per valuta.</p>
        </div>
        {puoInserire && (
          <button className="btn btn-primary" onClick={() => setMostraForm((v) => !v)}>
            {mostraForm ? 'Nascondi modulo' : '+ Nuovo incasso'}
          </button>
        )}
      </div>

      {puoInserire && mostraForm && (
        <form onSubmit={salva} className="card" style={{ marginBottom: 28 }}>
          <div className="form-grid">
            <div className="field">
              <label>Data</label>
              <input type="date" value={form.data} onChange={(e) => update('data', e.target.value)} required />
            </div>
            <div className="field">
              <label>N° persone servite</label>
              <input type="number" min="0" value={form.numero_persone} onChange={(e) => update('numero_persone', e.target.value)} placeholder="0" />
            </div>
          </div>

          <h3 style={{ fontSize: 15, color: 'var(--inchiostro-soft)', margin: '20px 0 10px', fontFamily: 'var(--font-body)', fontWeight: 700 }}>
            Euro (EUR)
          </h3>
          <div className="form-grid">
            <div className="field">
              <label>Contanti €</label>
              <input type="number" step="0.01" value={form.eur_contanti} onChange={(e) => update('eur_contanti', e.target.value)} placeholder="0.00" />
            </div>
            <div className="field">
              <label>Fondo cassa €</label>
              <input type="number" step="0.01" value={form.fondo_cassa} onChange={(e) => update('fondo_cassa', e.target.value)} placeholder="0.00" />
            </div>
            <div className="field">
              <label>Bonifici €</label>
              <input type="number" step="0.01" value={form.bonifici} onChange={(e) => update('bonifici', e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <h3 style={{ fontSize: 15, color: 'var(--inchiostro-soft)', margin: '20px 0 10px', fontFamily: 'var(--font-body)', fontWeight: 700 }}>
            Lire egiziane (EGP) — valuta principale
          </h3>
          <div className="form-grid">
            <div className="field">
              <label>POS (carta) LE</label>
              <input type="number" step="0.01" value={form.egp_pos} onChange={(e) => update('egp_pos', e.target.value)} placeholder="0.00" />
            </div>
            <div className="field">
              <label>Contanti LE</label>
              <input type="number" step="0.01" value={form.egp_contanti} onChange={(e) => update('egp_contanti', e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <h3 style={{ fontSize: 15, color: 'var(--inchiostro-soft)', margin: '20px 0 10px', fontFamily: 'var(--font-body)', fontWeight: 700 }}>
            Altre valute
          </h3>
          <div className="form-grid">
            <div className="field">
              <label>Dollari $ (contanti)</label>
              <input type="number" step="0.01" value={form.usd_contanti} onChange={(e) => update('usd_contanti', e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <h3 style={{ fontSize: 15, color: 'var(--corallo)', margin: '20px 0 10px', fontFamily: 'var(--font-body)', fontWeight: 700, borderTop: '1px dashed var(--linea)', paddingTop: 18 }}>
            Delivery (separato dalla sala)
          </h3>
          <div className="form-grid">
            <div className="field">
              <label>Delivery €</label>
              <input type="number" step="0.01" value={form.delivery_eur} onChange={(e) => update('delivery_eur', e.target.value)} placeholder="0.00" />
            </div>
            <div className="field">
              <label>Delivery LE</label>
              <input type="number" step="0.01" value={form.delivery_egp} onChange={(e) => update('delivery_egp', e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div className="field" style={{ marginTop: 16 }}>
            <label>Note (opzionale)</label>
            <textarea rows="2" value={form.note} onChange={(e) => update('note', e.target.value)} placeholder="Eventuali annotazioni sulla serata…" />
          </div>

          <button type="submit" className="btn btn-accent" style={{ marginTop: 18 }} disabled={salvando}>
            {salvando ? 'Salvataggio…' : 'Salva incasso'}
          </button>
        </form>
      )}

      <h3 style={{ fontSize: 16, marginBottom: 14, color: 'var(--notte)' }}>Storico</h3>

      {loading ? (
        <p className="page-subtitle">Caricamento…</p>
      ) : righe.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-title">Nessun incasso registrato</div>
          <p>Quando inserisci il primo incasso, apparirà qui.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>€ Contanti</th>
                <th>€ Fondo cassa</th>
                <th>€ Bonifici</th>
                <th>LE POS</th>
                <th>LE Contanti</th>
                <th>$ Contanti</th>
                <th>Delivery €</th>
                <th>Delivery LE</th>
                <th>Persone</th>
                <th>Inserito da</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.data).toLocaleDateString('it-IT')}</td>
                  <td>€ {Number(r.eur_contanti).toFixed(2)}</td>
                  <td>€ {Number(r.fondo_cassa).toFixed(2)}</td>
                  <td>€ {Number(r.bonifici).toFixed(2)}</td>
                  <td>{Number(r.egp_pos).toFixed(0)} LE</td>
                  <td>{Number(r.egp_contanti).toFixed(0)} LE</td>
                  <td>$ {Number(r.usd_contanti).toFixed(2)}</td>
                  <td>€ {Number(r.delivery_eur || 0).toFixed(2)}</td>
                  <td>{Number(r.delivery_egp || 0).toFixed(0)} LE</td>
                  <td>{r.numero_persone}</td>
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
