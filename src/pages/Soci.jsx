import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

import { oggiLocale } from '../lib/date'

const oggi = oggiLocale

export default function Soci() {
  const { isMaster, profile } = useAuth()
  const [soci, setSoci] = useState([])
  const [spese, setSpese] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostraForm, setMostraForm] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState(null)

  const [periodoAperto, setPeriodoAperto] = useState(null)
  const [storicoPeriodi, setStoricoPeriodi] = useState([])
  const [mostraConfermaChiusura, setMostraConfermaChiusura] = useState(false)
  const [noteChiusura, setNoteChiusura] = useState('')
  const [chiudendo, setChiudendo] = useState(false)
  const [mostraStorico, setMostraStorico] = useState(false)

  const [form, setForm] = useState({
    socio_id: '',
    data: oggi(),
    descrizione: '',
    importo_eur: '',
    importo_egp: '',
  })

  async function carica() {
    setLoading(true)
    const [{ data: s }, { data: sp }, { data: pAperto }, { data: pStorico }] = await Promise.all([
      supabase.from('soci').select('*').order('nome'),
      supabase.from('spese_socio').select('*, soci(nome)').order('data', { ascending: false }),
      supabase.from('periodi_soci').select('*').is('data_chiusura', null).single(),
      supabase.from('periodi_soci').select('*, profiles:chiuso_da(nome)').not('data_chiusura', 'is', null).order('data_chiusura', { ascending: false }),
    ])
    setSoci(s || [])
    setSpese(sp || [])
    setPeriodoAperto(pAperto || null)
    setStoricoPeriodi(pStorico || [])
    if (s?.length && !form.socio_id) setForm((f) => ({ ...f, socio_id: s[0].id }))
    setLoading(false)
  }

  useEffect(() => { carica() }, [])

  async function chiudiPeriodo() {
    setChiudendo(true)
    const { error } = await supabase.rpc('chiudi_periodo_soci', {
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
    if (!confirm('Riaprire questo periodo passato per correggerlo? Finché resta riaperto, le nuove spese inserite andranno in questo vecchio periodo: ricordati di richiuderlo subito dopo la correzione.')) return
    const { error } = await supabase.rpc('riapri_periodo_soci', { p_periodo_id: id })
    if (!error) {
      setMostraStorico(false)
      carica()
    } else {
      alert('Errore: ' + error.message)
    }
  }

  function annullaForm() {
    setForm({ socio_id: soci[0]?.id || '', data: oggi(), descrizione: '', importo_eur: '', importo_egp: '' })
    setEditandoId(null)
  }

  function apriModificaRiga(s) {
    setForm({
      socio_id: s.socio_id,
      data: s.data,
      descrizione: s.descrizione || '',
      importo_eur: s.importo_eur || '',
      importo_egp: s.importo_egp || '',
    })
    setEditandoId(s.id)
    setMostraForm(true)
  }

  async function salva(e) {
    e.preventDefault()
    setSalvando(true)
    const payload = {
      socio_id: form.socio_id,
      data: form.data,
      descrizione: form.descrizione || null,
      importo_eur: Number(form.importo_eur) || 0,
      importo_egp: Number(form.importo_egp) || 0,
    }

    let error
    if (editandoId) {
      const res = await supabase.from('spese_socio').update(payload).eq('id', editandoId)
      error = res.error
    } else {
      const res = await supabase.from('spese_socio').insert(payload)
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

  async function eliminaRiga(id) {
    if (!confirm('Eliminare questa spesa? L\'operazione non è reversibile.')) return
    const { error } = await supabase.from('spese_socio').delete().eq('id', id)
    if (!error) {
      carica()
    } else {
      alert('Errore nell\'eliminazione: ' + error.message)
    }
  }

  const speseDelPeriodo = periodoAperto ? spese.filter((sp) => sp.periodo_soci_id === periodoAperto.id) : spese

  const totaliPerSocio = soci.map((s) => {
    const sueSpese = speseDelPeriodo.filter((sp) => sp.socio_id === s.id)
    return {
      ...s,
      totaleEur: sueSpese.reduce((acc, sp) => acc + Number(sp.importo_eur), 0),
      totaleEgp: sueSpese.reduce((acc, sp) => acc + Number(sp.importo_egp), 0),
    }
  })

  const stoSiamoSuPeriodoPassato = !!periodoAperto && storicoPeriodi.some((p) => p.id === periodoAperto.id)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Spese soci</h1>
          <p className="page-subtitle">Spese personali sostenute dai proprietari nel periodo corrente, scalate a parte dall'utile da dividere.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => setMostraStorico((v) => !v)}>
            {mostraStorico ? '✕ Chiudi storico' : 'Storico periodi'}
          </button>
          {isMaster && !stoSiamoSuPeriodoPassato && (
            <button className="btn btn-primary" onClick={() => setMostraConfermaChiusura(true)}>
              🔒 Chiudi periodo
            </button>
          )}
          {isMaster && (
            <button className="btn btn-primary" onClick={() => { if (mostraForm) { annullaForm() } setMostraForm((v) => !v) }}>
              {mostraForm ? 'Nascondi modulo' : '+ Nuova spesa'}
            </button>
          )}
        </div>
      </div>

      {isMaster && stoSiamoSuPeriodoPassato && (
        <div className="card" style={{ marginBottom: 24, borderLeft: '3px solid var(--corallo)', background: 'rgba(217,104,79,0.06)' }}>
          <strong style={{ color: 'var(--corallo)' }}>⚠️ Stai lavorando su un periodo passato riaperto</strong>
          <p style={{ fontSize: 13, color: 'var(--inchiostro-soft)', margin: '6px 0 12px' }}>
            Le spese che inserisci o modifichi ora appartengono a questo vecchio periodo, non a quello corrente. Richiudilo appena hai finito di correggerlo.
          </p>
          <button className="btn btn-primary btn-sm" onClick={() => setMostraConfermaChiusura(true)}>Richiudi questo periodo</button>
        </div>
      )}

      {mostraConfermaChiusura && (
        <div className="card" style={{ marginBottom: 24, borderLeft: '3px solid var(--corallo)' }}>
          <h3 style={{ fontSize: 15, marginBottom: 10, color: 'var(--corallo)' }}>Conferma chiusura periodo</h3>
          <p style={{ fontSize: 13, color: 'var(--inchiostro-soft)', marginBottom: 14 }}>
            Verranno salvati come storico i totali attuali per ciascun socio, poi le Spese Soci ripartiranno da 0. Nessuna spesa viene eliminata.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
            {totaliPerSocio.map((s) => (
              <div key={s.id} className="stat-card" style={{ padding: '10px 12px' }}>
                <div className="stat-label">{s.nome}</div>
                <div className="stat-value">€ {s.totaleEur.toFixed(2)}</div>
                <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)' }}>{s.totaleEgp.toFixed(0)} LE</div>
              </div>
            ))}
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
                    <th>Totali per socio</th>
                    <th>Note</th>
                    <th>Chiuso da</th>
                    {isMaster && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {storicoPeriodi.map((p) => (
                    <tr key={p.id}>
                      <td>#{p.numero}</td>
                      <td>{new Date(p.data_chiusura).toLocaleDateString('it-IT')}</td>
                      <td>
                        {(p.totali || []).map((t) => (
                          <div key={t.socio_id} style={{ fontSize: 13 }}>
                            <strong>{t.nome}:</strong> € {Number(t.eur).toFixed(2)} · {Number(t.egp).toFixed(0)} LE
                          </div>
                        ))}
                      </td>
                      <td style={{ color: 'var(--inchiostro-soft)' }}>{p.note || '—'}</td>
                      <td style={{ color: 'var(--inchiostro-soft)' }}>{p.profiles?.nome || '—'}</td>
                      {isMaster && (
                        <td>
                          <button className="btn btn-ghost btn-sm" disabled={stoSiamoSuPeriodoPassato} onClick={() => riapriPeriodo(p.id)}>
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
          {editandoId && (
            <div style={{ marginBottom: 16, padding: '8px 14px', background: 'var(--sabbia-chiara)', borderRadius: 8, fontSize: 13.5, color: 'var(--notte)' }}>
              Stai modificando una spesa esistente.
            </div>
          )}
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
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button type="submit" className="btn btn-accent" disabled={salvando}>
              {salvando ? 'Salvataggio…' : editandoId ? 'Salva modifiche' : 'Salva spesa'}
            </button>
            {editandoId && (
              <button type="button" className="btn btn-ghost" onClick={annullaForm}>
                Annulla modifica
              </button>
            )}
          </div>
        </form>
      )}

      <h3 style={{ fontSize: 16, marginBottom: 14, color: 'var(--notte)' }}>Spese del periodo corrente</h3>

      {loading ? (
        <p className="page-subtitle">Caricamento…</p>
      ) : speseDelPeriodo.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-title">Nessuna spesa in questo periodo</div>
          <p>Le spese personali dei soci appariranno qui.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {speseDelPeriodo.map((s) => (
            <div key={s.id} className="card" style={{ padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <div>
                  <span className="tag" style={{ marginBottom: 6, display: 'inline-block' }}>{s.soci?.nome}</span>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{s.descrizione || '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)', marginTop: 3 }}>
                    {new Date(s.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {Number(s.importo_eur) > 0 && <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--corallo)' }}>€ {Number(s.importo_eur).toFixed(2)}</div>}
                  {Number(s.importo_egp) > 0 && <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--corallo)' }}>{Number(s.importo_egp).toFixed(0)} LE</div>}
                </div>
              </div>
              {isMaster && (
                <div style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: '1px solid var(--linea)' }}>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => apriModificaRiga(s)}>Modifica</button>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1, color: 'var(--corallo)' }} onClick={() => eliminaRiga(s.id)}>Elimina</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
