import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { primoGiornoMeseLocale as primoGiornoMese } from '../lib/date'

const TIPO_LABEL = {
  fitto_locale: 'Fitto locale',
  casa_dipendente: 'Case dipendenti',
}

export default function SpeseFisse() {
  const { profile, isMaster } = useAuth()
  const [voci, setVoci] = useState([])
  const [pagamenti, setPagamenti] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostraForm, setMostraForm] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState(null)

  const mese = primoGiornoMese()

  const VUOTO = { nome: '', tipo: 'fitto_locale', importo: '', valuta: 'EGP', giorno_scadenza: '5', note: '' }
  const [form, setForm] = useState(VUOTO)

  async function carica() {
    setLoading(true)
    const [{ data: v }, { data: p }] = await Promise.all([
      supabase.from('spese_fisse').select('*').eq('attiva', true).order('tipo').order('nome'),
      supabase.from('pagamenti_spese_fisse').select('*').eq('mese', mese),
    ])
    setVoci(v || [])
    setPagamenti(p || [])
    setLoading(false)
  }

  useEffect(() => { carica() }, [])

  function annullaForm() {
    setForm(VUOTO)
    setEditandoId(null)
  }

  function apriModifica(v) {
    setForm({
      nome: v.nome,
      tipo: v.tipo,
      importo: v.importo,
      valuta: v.valuta,
      giorno_scadenza: v.giorno_scadenza,
      note: v.note || '',
    })
    setEditandoId(v.id)
    setMostraForm(true)
  }

  async function salva(e) {
    e.preventDefault()
    setSalvando(true)
    const payload = {
      nome: form.nome,
      tipo: form.tipo,
      importo: Number(form.importo) || 0,
      valuta: form.valuta,
      giorno_scadenza: Number(form.giorno_scadenza) || 1,
      note: form.note || null,
    }
    let error
    if (editandoId) {
      const res = await supabase.from('spese_fisse').update(payload).eq('id', editandoId)
      error = res.error
    } else {
      const res = await supabase.from('spese_fisse').insert(payload)
      error = res.error
    }
    setSalvando(false)
    if (!error) {
      annullaForm()
      carica()
    } else {
      alert('Errore: ' + error.message)
    }
  }

  async function eliminaVoce(id) {
    if (!confirm('Eliminare questa voce fissa? Lo storico dei pagamenti passati resterà comunque visibile in Uscite.')) return
    const { error } = await supabase.from('spese_fisse').update({ attiva: false }).eq('id', id)
    if (!error) carica()
  }

  async function segnaPagato(voce) {
    if (!confirm(`Confermi il pagamento di ${voce.nome} per questo mese?`)) return
    const { error } = await supabase.from('pagamenti_spese_fisse').insert({
      spesa_fissa_id: voce.id,
      mese,
      importo: voce.importo,
      inserito_da: profile.id,
    })
    if (!error) {
      carica()
    } else {
      alert('Errore: ' + error.message)
    }
  }

  const pagamentiMap = {}
  pagamenti.forEach((p) => { pagamentiMap[p.spesa_fissa_id] = p })

  const simboloValuta = { EUR: '€', USD: '$', EGP: 'LE' }
  const oggiGiorno = new Date().getDate()

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Spese fisse</h1>
          <p className="page-subtitle">Fitto del locale e case dei dipendenti — voci ricorrenti, da segnare come pagate ogni mese.</p>
        </div>
        {isMaster && (
          <button className="btn btn-primary" onClick={() => { if (mostraForm) annullaForm(); setMostraForm((v) => !v) }}>
            {mostraForm ? 'Nascondi modulo' : '+ Nuova voce fissa'}
          </button>
        )}
      </div>

      {isMaster && mostraForm && (
        <form onSubmit={salva} className="card" style={{ marginBottom: 28 }}>
          {editandoId && (
            <div style={{ marginBottom: 16, padding: '8px 14px', background: 'var(--sabbia-chiara)', borderRadius: 8, fontSize: 13.5, color: 'var(--notte)' }}>
              Stai modificando una voce esistente (es. cambio casa o canone).
            </div>
          )}
          <div className="form-grid">
            <div className="field">
              <label>Nome</label>
              <input type="text" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="es. Fitto locale, Casa Ahmed…" required />
            </div>
            <div className="field">
              <label>Tipo</label>
              <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}>
                <option value="fitto_locale">Fitto locale</option>
                <option value="casa_dipendente">Case dipendenti</option>
              </select>
            </div>
            <div className="field">
              <label>Importo</label>
              <input type="number" step="0.01" value={form.importo} onChange={(e) => setForm((f) => ({ ...f, importo: e.target.value }))} placeholder="0.00" required />
            </div>
            <div className="field">
              <label>Valuta</label>
              <select value={form.valuta} onChange={(e) => setForm((f) => ({ ...f, valuta: e.target.value }))}>
                <option value="EGP">Lire egiziane (LE)</option>
                <option value="EUR">Euro (€)</option>
                <option value="USD">Dollari ($)</option>
              </select>
            </div>
            <div className="field">
              <label>Giorno scadenza nel mese</label>
              <input type="number" min="1" max="28" value={form.giorno_scadenza} onChange={(e) => setForm((f) => ({ ...f, giorno_scadenza: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Note</label>
              <input type="text" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="opzionale" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button type="submit" className="btn btn-accent" disabled={salvando}>
              {salvando ? 'Salvataggio…' : editandoId ? 'Salva modifiche' : 'Aggiungi voce'}
            </button>
            {editandoId && (
              <button type="button" className="btn btn-ghost" onClick={annullaForm}>Annulla</button>
            )}
          </div>
        </form>
      )}

      {loading ? (
        <p className="page-subtitle">Caricamento…</p>
      ) : voci.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-title">Nessuna voce fissa configurata</div>
          <p>{isMaster ? 'Aggiungi la prima voce (es. Fitto locale) con il pulsante sopra.' : 'Il Master non ha ancora configurato spese fisse.'}</p>
        </div>
      ) : (
        ['fitto_locale', 'casa_dipendente'].map((tipo) => {
          const vociTipo = voci.filter((v) => v.tipo === tipo)
          if (vociTipo.length === 0) return null
          return (
            <div key={tipo} style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 16, marginBottom: 14, color: 'var(--notte)' }}>{TIPO_LABEL[tipo]}</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {vociTipo.map((v) => {
                  const pagato = !!pagamentiMap[v.id]
                  const inRitardo = !pagato && oggiGiorno > v.giorno_scadenza
                  return (
                    <div key={v.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{v.nome}</div>
                        <div style={{ fontSize: 13, color: 'var(--inchiostro-soft)' }}>
                          {simboloValuta[v.valuta]} {Number(v.importo).toFixed(2)} — scadenza il {v.giorno_scadenza} di ogni mese
                          {v.note && ` · ${v.note}`}
                        </div>
                      </div>

                      {pagato ? (
                        <span className="tag" style={{ background: 'rgba(47,158,104,0.15)', color: 'var(--smeraldo)' }}>
                          Pagato il {new Date(pagamentiMap[v.id].data_pagamento).toLocaleDateString('it-IT')}
                        </span>
                      ) : (
                        <>
                          <span className="tag" style={{ background: inRitardo ? 'rgba(217,104,79,0.15)' : 'var(--sabbia-chiara)', color: inRitardo ? 'var(--corallo)' : 'var(--notte)' }}>
                            {inRitardo ? 'In ritardo' : 'Da pagare'}
                          </span>
                          <button className="btn btn-accent btn-sm" onClick={() => segnaPagato(v)}>
                            Segna pagato
                          </button>
                        </>
                      )}

                      {isMaster && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => apriModifica(v)}>Modifica</button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--corallo)' }} onClick={() => eliminaVoce(v.id)}>Elimina</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
