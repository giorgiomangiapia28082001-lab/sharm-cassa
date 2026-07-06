import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

import { oggiLocale } from '../lib/date'

const oggi = oggiLocale

const VUOTO = {
  data: oggi(),
  descrizione: '',
  categoria_id: '',
  valuta: 'EGP',
  importo: '',
  metodo_pagamento: 'contanti',
  foto: null,
}

export default function Uscite() {
  const { profile, isMaster, isViewer } = useAuth()
  const [righe, setRighe] = useState([])
  const [categorie, setCategorie] = useState([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [mostraForm, setMostraForm] = useState(!isViewer)
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroMetodo, setFiltroMetodo] = useState('')
  const [editandoId, setEditandoId] = useState(null)
  const [editandoGeneratoDaAcconto, setEditandoGeneratoDaAcconto] = useState(false)

  const [form, setForm] = useState(VUOTO)

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
      setForm((f) => (f.categoria_id ? f : { ...f, categoria_id: cat[0]?.id || '' }))
    }
    setLoading(false)
  }

  useEffect(() => {
    carica()
  }, [])

  function update(campo, valore) {
    setForm((f) => ({ ...f, [campo]: valore }))
  }

  function annullaForm() {
    setForm({ ...VUOTO, categoria_id: categorie[0]?.id || '' })
    setEditandoId(null)
    setEditandoGeneratoDaAcconto(false)
  }

  function apriModificaRiga(r) {
    setForm({
      data: r.data,
      descrizione: r.descrizione,
      categoria_id: r.categoria_id,
      valuta: r.valuta,
      importo: r.importo,
      metodo_pagamento: r.metodo_pagamento,
      foto: null,
    })
    setEditandoId(r.id)
    setEditandoGeneratoDaAcconto(!!r.generato_da_acconto_id)
    setMostraForm(true)
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

    if (editandoId) {
      const payload = {
        data: form.data,
        descrizione: form.descrizione,
        categoria_id: form.categoria_id,
        valuta: form.valuta,
        importo: Number(form.importo) || 0,
        metodo_pagamento: form.metodo_pagamento,
      }
      if (foto_url) payload.foto_url = foto_url
      const { error } = await supabase.from('uscite').update(payload).eq('id', editandoId)
      setSalvando(false)
      if (!error) {
        annullaForm()
        carica()
      } else {
        alert('Errore nel salvataggio: ' + error.message)
      }
    } else {
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
  }

  async function eliminaRiga(r) {
    const messaggio = r.generato_da_acconto_id
      ? 'Questa uscita è collegata a un acconto dipendente: eliminandola, anche la parte corrispondente dell\'acconto verrà azzerata. Continuare?'
      : 'Eliminare questa uscita? L\'operazione non è reversibile.'
    if (!confirm(messaggio)) return
    const { error } = await supabase.from('uscite').delete().eq('id', r.id)
    if (!error) {
      carica()
    } else {
      alert('Errore nell\'eliminazione: ' + error.message)
    }
  }

  const puoInserire = isMaster || profile?.ruolo === 'operatore'
  const righeFiltrate = righe
    .filter((r) => !filtroCategoria || r.categoria_id === filtroCategoria)
    .filter((r) => !filtroMetodo || (r.metodo_pagamento || 'contanti') === filtroMetodo)

  const simboloValuta = { EUR: '€', USD: '$', EGP: 'LE' }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Uscite</h1>
          <p className="page-subtitle">Registra le spese giorno per giorno, con categoria ed eventuale foto dello scontrino.</p>
        </div>
        {puoInserire && (
          <button className="btn btn-primary" onClick={() => { if (mostraForm) { annullaForm() } setMostraForm((v) => !v) }}>
            {mostraForm ? 'Nascondi modulo' : '+ Nuova uscita'}
          </button>
        )}
      </div>

      {puoInserire && mostraForm && (
        <form onSubmit={salva} className="card" style={{ marginBottom: 28 }}>
          {editandoId && (
            <div style={{ marginBottom: 16, padding: '8px 14px', background: 'var(--sabbia-chiara)', borderRadius: 8, fontSize: 13.5, color: 'var(--notte)' }}>
              Stai modificando un'uscita esistente.
              {editandoGeneratoDaAcconto && ' Questa riga è collegata a un acconto dipendente: il residuo verrà aggiornato automaticamente.'}
            </div>
          )}
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
              <label>Foto scontrino {editandoId ? '(lascia vuoto per non cambiarla)' : '(opzionale)'}</label>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => update('foto', e.target.files[0])} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button type="submit" className="btn btn-accent" disabled={salvando}>
              {salvando ? 'Salvataggio…' : editandoId ? 'Salva modifiche' : 'Salva uscita'}
            </button>
            {editandoId && (
              <button type="button" className="btn btn-ghost" onClick={annullaForm}>
                Annulla modifica
              </button>
            )}
          </div>
        </form>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, color: 'var(--notte)', margin: 0, flex: '1 1 auto' }}>Storico</h3>
        <select value={filtroMetodo} onChange={(e) => setFiltroMetodo(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--linea)', background: '#fff' }}>
          <option value="">Tutti i metodi</option>
          <option value="contanti">Contanti</option>
          <option value="pos">POS</option>
          <option value="bonifico">Bonifico</option>
        </select>
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
          <div className="empty-state-title">Nessuna uscita trovata</div>
          <p>Nessuna uscita corrisponde ai filtri selezionati.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {righeFiltrate.map((r) => (
            <div key={r.id} className="card" style={{ padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {r.descrizione || '—'}
                    {r.generato_da_acconto_id && (
                      <span className="tag" style={{ marginLeft: 8, background: 'var(--sabbia-chiara)', fontSize: 11 }}>acconto</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)', marginTop: 2 }}>
                    {new Date(r.data).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {' · '}{r.profiles?.nome || '—'}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--corallo)' }}>
                    {simboloValuta[r.valuta]} {Number(r.importo).toFixed(2)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--inchiostro-soft)', marginTop: 2, textTransform: 'capitalize' }}>
                    {r.metodo_pagamento || 'contanti'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="tag">{r.categorie_uscite?.nome}</span>
                {r.foto_url && (
                  <a href={r.foto_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>📎 Vedi foto</a>
                )}
              </div>
              {isMaster && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--linea)' }}>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => apriModificaRiga(r)}>Modifica</button>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1, color: 'var(--corallo)' }} onClick={() => eliminaRiga(r)}>Elimina</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
