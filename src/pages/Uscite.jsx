import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const oggi = () => new Date().toISOString().slice(0, 10)

export default function Uscite() {
  const { profile, isMaster, isViewer } = useAuth()
  const [righe, setRighe] = useState([])
  const [categorie, setCategorie] = useState([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [mostraForm, setMostraForm] = useState(!isViewer)
  const [filtroCategoria, setFiltroCategoria] = useState('')

  const [form, setForm] = useState({
    data: oggi(),
    descrizione: '',
    categoria_id: '',
    valuta: 'EGP',
    importo: '',
    metodo_pagamento: 'contanti',
    foto: null,
  })

  async function carica() {
    setLoading(true)
    const [{ data: us }, { data: cat }] = await Promise.all([
      supabase
        .from('uscite')
        .select('*, categorie_uscite(nome), profiles:inserito_da(nome)')
        .order('data', { ascending: false })
        .limit(100),
      supabase.from('categorie_uscite').select('*').eq('attiva', true).order('ordine'),
    ])
    if (us) setRighe(us)
    if (cat) {
      setCategorie(cat)
      if (!form.categoria_id && cat.length) {
        setForm((f) => ({ ...f, categoria_id: cat[0].id }))
      }
    }
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

    let foto_url = null
    if (form.foto) {
      const ext = form.foto.name.split('.').pop()
      const path = `scontrini/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadError } = await supabase.storage.from('foto').upload(path, form.foto)
      if (!uploadError) {
        const { data } = supabase.storage.from('foto').getPublicUrl(path)
        foto_url = data.publicUrl
      }
    }

    const payload = {
      data: form.data,
      descrizione: form.descrizione,
      categoria_id: form.categoria_id,
      valuta: form.valuta,
      importo: Number(form.importo) || 0,
      metodo_pagamento: form.metodo_pagamento,
      foto_url,
      inserito_da: profile.id,
    }
    const { error } = await supabase.from('uscite').insert(payload)
    setSalvando(false)
    if (!error) {
      setForm((f) => ({ ...f, descrizione: '', importo: '', foto: null }))
      carica()
    } else {
      alert('Errore nel salvataggio: ' + error.message)
    }
  }

  const puoInserire = isMaster || profile?.ruolo === 'operatore'
  const righeFiltrate = filtroCategoria
    ? righe.filter((r) => r.categoria_id === filtroCategoria)
    : righe

  const simboloValuta = { EUR: '€', USD: '$', EGP: 'LE', GBP: '£' }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Uscite</h1>
          <p className="page-subtitle">Registra le spese giorno per giorno, con categoria ed eventuale foto dello scontrino.</p>
        </div>
        {puoInserire && (
          <button className="btn btn-primary" onClick={() => setMostraForm((v) => !v)}>
            {mostraForm ? 'Nascondi modulo' : '+ Nuova uscita'}
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
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <label>Descrizione</label>
              <input type="text" value={form.descrizione} onChange={(e) => update('descrizione', e.target.value)} placeholder="es. Pollo, olio, manutenzione frigo…" required />
            </div>
            <div className="field">
              <label>Categoria</label>
              <select value={form.categoria_id} onChange={(e) => update('categoria_id', e.target.value)} required>
                {categorie.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-grid" style={{ marginTop: 16 }}>
            <div className="field">
              <label>Valuta</label>
              <select value={form.valuta} onChange={(e) => update('valuta', e.target.value)}>
                <option value="EGP">Lire egiziane (LE)</option>
                <option value="EUR">Euro (€)</option>
                <option value="USD">Dollari ($)</option>
                <option value="GBP">Sterline (£)</option>
              </select>
            </div>
            <div className="field">
              <label>Importo</label>
              <input type="number" step="0.01" value={form.importo} onChange={(e) => update('importo', e.target.value)} placeholder="0.00" required />
            </div>
            <div className="field">
              <label>Metodo</label>
              <select value={form.metodo_pagamento} onChange={(e) => update('metodo_pagamento', e.target.value)}>
                <option value="contanti">Contanti</option>
                <option value="pos">POS</option>
                <option value="bonifico">Bonifico</option>
              </select>
            </div>
            <div className="field">
              <label>Foto scontrino (opzionale)</label>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => update('foto', e.target.files[0])} />
            </div>
          </div>

          <button type="submit" className="btn btn-accent" style={{ marginTop: 18 }} disabled={salvando}>
            {salvando ? 'Salvataggio…' : 'Salva uscita'}
          </button>
        </form>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, color: 'var(--notte)' }}>Storico</h3>
        <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--linea)', background: '#fff' }}>
          <option value="">Tutte le categorie</option>
          {categorie.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="page-subtitle">Caricamento…</p>
      ) : righeFiltrate.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-title">Nessuna uscita registrata</div>
          <p>Quando inserisci la prima spesa, apparirà qui.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrizione</th>
                <th>Categoria</th>
                <th>Importo</th>
                <th>Metodo</th>
                <th>Foto</th>
                <th>Inserito da</th>
              </tr>
            </thead>
            <tbody>
              {righeFiltrate.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.data).toLocaleDateString('it-IT')}</td>
                  <td>{r.descrizione}</td>
                  <td><span className="tag">{r.categorie_uscite?.nome}</span></td>
                  <td>{simboloValuta[r.valuta]} {Number(r.importo).toFixed(2)}</td>
                  <td style={{ textTransform: 'capitalize' }}>{r.metodo_pagamento}</td>
                  <td>
                    {r.foto_url ? (
                      <a href={r.foto_url} target="_blank" rel="noreferrer">Vedi foto</a>
                    ) : '—'}
                  </td>
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
