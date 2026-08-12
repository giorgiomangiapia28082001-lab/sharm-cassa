import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/Toast'
import { esegui, avvisaSeOffline } from '../lib/operazioni'
import { caricaAllegato, isPdf } from '../lib/foto'

import { oggiLocale } from '../lib/date'

const oggi = oggiLocale

export default function Soci() {
  const { isMaster, profile } = useAuth()
  const toast = useToast()
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
  const [chiusuraDa, setChiusuraDa] = useState('')
  const [chiusuraA, setChiusuraA] = useState('')

  // Versamenti dei soci: contanti messi di tasca propria.
  // Restano nella contabilità soci e NON toccano la cassa del direttore.
  const [versamenti, setVersamenti] = useState([])
  const [mostraFormVers, setMostraFormVers] = useState(false)
  const [salvandoVers, setSalvandoVers] = useState(false)
  const [editandoVersId, setEditandoVersId] = useState(null)
  const [formVers, setFormVers] = useState({
    socio_id: '', data: oggi(), descrizione: '',
    importo_eur: '', importo_egp: '',
    allegato: null, foto_url_esistente: '',
  })

  const [form, setForm] = useState({
    socio_id: '',
    data: oggi(),
    descrizione: '',
    importo_eur: '',
    importo_egp: '',
    allegato: null,        // nuovo file scelto (immagine o PDF)
    foto_url_esistente: '', // allegato già salvato (in modifica)
  })

  async function carica() {
    setLoading(true)
    const [{ data: s }, { data: sp }, { data: pAperto }, { data: pStorico }, { data: vers }] = await Promise.all([
      supabase.from('soci').select('*').order('nome'),
      supabase.from('spese_socio').select('*, soci(nome)').order('data', { ascending: false }),
      supabase.from('periodi_soci').select('*').is('data_chiusura', null).maybeSingle(),
      supabase.from('periodi_soci').select('*, profiles:chiuso_da(nome)').not('data_chiusura', 'is', null).order('data_chiusura', { ascending: false }),
      supabase.from('versamenti_socio').select('*, soci(nome)').order('data', { ascending: false }),
    ])
    setSoci(s || [])
    setSpese(sp || [])
    setVersamenti(vers || [])
    setPeriodoAperto(pAperto || null)
    setStoricoPeriodi(pStorico || [])
    if (s?.length && !form.socio_id) setForm((f) => ({ ...f, socio_id: s[0].id }))
    setLoading(false)
  }

  useEffect(() => { avvisaSeOffline(toast); carica() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function chiudiPeriodo() {
    setChiudendo(true)
    const { error } = await esegui(
      supabase.rpc('chiudi_periodo_soci', {
        p_note: noteChiusura || null,
        p_chiuso_da: profile.id,
        p_data_inizio: chiusuraDa || null,
        p_data_fine: chiusuraA || null,
      }),
      toast, 'la chiusura del periodo'
    )
    setChiudendo(false)
    if (!error) {
      toast.success('Periodo chiuso.')
      setMostraConfermaChiusura(false)
      setNoteChiusura('')
      setChiusuraDa('')
      setChiusuraA('')
      carica()
    }
  }

  async function riapriPeriodo(id) {
    if (!confirm('Riaprire questo periodo passato per correggerlo? Finché resta riaperto, le nuove spese inserite andranno in questo vecchio periodo: ricordati di richiuderlo subito dopo la correzione.')) return
    const { error } = await esegui(
      supabase.rpc('riapri_periodo_soci', { p_periodo_id: id }),
      toast, 'la riapertura del periodo'
    )
    if (!error) {
      toast.success('Periodo riaperto.')
      setMostraStorico(false)
      carica()
    }
  }

  function annullaForm() {
    setForm({ socio_id: soci[0]?.id || '', data: oggi(), descrizione: '', importo_eur: '', importo_egp: '', allegato: null, foto_url_esistente: '' })
    setEditandoId(null)
  }

  function apriModificaRiga(s) {
    setForm({
      socio_id: s.socio_id,
      data: s.data,
      descrizione: s.descrizione || '',
      importo_eur: s.importo_eur || '',
      importo_egp: s.importo_egp || '',
      allegato: null,
      foto_url_esistente: s.foto_url || '',
    })
    setEditandoId(s.id)
    setMostraForm(true)
  }

  async function salva(e) {
    e.preventDefault()
    setSalvando(true)

    // Se è stato scelto un nuovo allegato (foto o PDF), lo carichiamo prima
    // nello Storage e ne salviamo l'URL. Se manca la rete, avvisiamo e
    // salviamo comunque la spesa senza allegato (l'importo è la cosa
    // importante da non perdere).
    let foto_url = form.foto_url_esistente || null
    if (form.allegato) {
      const { url, errore } = await caricaAllegato(form.allegato, `soci/${form.socio_id || 'na'}`)
      if (url) foto_url = url
      else toast.warning(errore + ' La spesa verrà salvata senza allegato.')
    }

    const payload = {
      socio_id: form.socio_id,
      data: form.data,
      descrizione: form.descrizione || null,
      importo_eur: Number(form.importo_eur) || 0,
      importo_egp: Number(form.importo_egp) || 0,
      foto_url,
    }

    const { error } = editandoId
      ? await esegui(supabase.from('spese_socio').update(payload).eq('id', editandoId), toast, 'il salvataggio della spesa')
      : await esegui(supabase.from('spese_socio').insert(payload), toast, 'il salvataggio della spesa')

    setSalvando(false)
    if (!error) {
      toast.success(editandoId ? 'Spesa modificata.' : 'Spesa salvata.')
      annullaForm()
      carica()
    }
  }

  async function eliminaRiga(id) {
    if (!confirm('Eliminare questa spesa? L\'operazione non è reversibile.')) return
    const { error } = await esegui(
      supabase.from('spese_socio').delete().eq('id', id),
      toast, 'l\'eliminazione della spesa'
    )
    if (!error) {
      toast.success('Spesa eliminata.')
      carica()
    }
  }

  // ────────────────────────────────────────────────
  // VERSAMENTI DEI SOCI
  // Contanti che i soci mettono di tasca propria. Restano qui: non
  // entrano nel saldo della Cassa. Sarà il Master a riportarli a mano
  // in Cassa quando lo riterrà opportuno.
  // ────────────────────────────────────────────────
  function annullaFormVers() {
    setFormVers({ socio_id: soci[0]?.id || '', data: oggi(), descrizione: '', importo_eur: '', importo_egp: '', allegato: null, foto_url_esistente: '' })
    setEditandoVersId(null)
  }

  function apriModificaVers(v) {
    setFormVers({
      socio_id: v.socio_id,
      data: v.data,
      descrizione: v.descrizione || '',
      importo_eur: v.importo_eur || '',
      importo_egp: v.importo_egp || '',
      allegato: null,
      foto_url_esistente: v.foto_url || '',
    })
    setEditandoVersId(v.id)
    setMostraFormVers(true)
  }

  async function salvaVersamento(e) {
    e.preventDefault()
    if (!formVers.socio_id) { toast.warning('Scegli il socio che ha versato.'); return }
    if (!Number(formVers.importo_eur) && !Number(formVers.importo_egp)) {
      toast.warning('Inserisci almeno un importo.')
      return
    }
    setSalvandoVers(true)

    let foto_url = formVers.foto_url_esistente || null
    if (formVers.allegato) {
      const { url, errore } = await caricaAllegato(formVers.allegato, `soci/versamenti/${formVers.socio_id}`)
      if (url) foto_url = url
      else toast.warning(errore + ' Il versamento verrà salvato senza allegato.')
    }

    const payload = {
      socio_id: formVers.socio_id,
      data: formVers.data,
      descrizione: formVers.descrizione || null,
      importo_eur: Number(formVers.importo_eur) || 0,
      importo_egp: Number(formVers.importo_egp) || 0,
      foto_url,
    }

    const { error } = editandoVersId
      ? await esegui(supabase.from('versamenti_socio').update(payload).eq('id', editandoVersId), toast, 'il salvataggio del versamento')
      : await esegui(supabase.from('versamenti_socio').insert({ ...payload, inserito_da: profile.id }), toast, 'il salvataggio del versamento')

    setSalvandoVers(false)
    if (!error) {
      toast.success(editandoVersId ? 'Versamento modificato.' : 'Versamento registrato.')
      annullaFormVers()
      setMostraFormVers(false)
      carica()
    }
  }

  async function eliminaVersamento(id) {
    if (!confirm('Eliminare questo versamento?')) return
    const { error } = await esegui(supabase.from('versamenti_socio').delete().eq('id', id), toast, 'l\'eliminazione del versamento')
    if (!error) { toast.success('Versamento eliminato.'); carica() }
  }

  async function segnaRiportato(v) {
    const { error } = await esegui(
      supabase.from('versamenti_socio').update({ riportato_in_cassa: !v.riportato_in_cassa }).eq('id', v.id),
      toast, 'l\'aggiornamento del promemoria'
    )
    if (!error) carica()
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

  const versamentiDelPeriodo = periodoAperto ? versamenti.filter((v) => v.periodo_soci_id === periodoAperto.id) : versamenti
  const totVersEur = versamentiDelPeriodo.reduce((a, v) => a + Number(v.importo_eur || 0), 0)
  const totVersEgp = versamentiDelPeriodo.reduce((a, v) => a + Number(v.importo_egp || 0), 0)

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
          <div style={{ background: 'var(--sabbia-chiara)', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>Periodo da chiudere (facoltativo)</div>
            <p style={{ fontSize: 12.5, color: 'var(--inchiostro-soft)', marginTop: 0, marginBottom: 10 }}>
              Se lasci vuoto, viene chiuso tutto. Se indichi le date, resta chiuso solo ciò che rientra in quei giorni: il resto passa al periodo nuovo.
            </p>
            <div className="form-grid">
              <div className="field">
                <label>Dal giorno</label>
                <input type="date" value={chiusuraDa} onChange={(e) => setChiusuraDa(e.target.value)} />
              </div>
              <div className="field">
                <label>Al giorno</label>
                <input type="date" value={chiusuraA} onChange={(e) => setChiusuraA(e.target.value)} />
              </div>
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
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <label>Allegato — foto o PDF (opzionale)</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setForm((f) => ({ ...f, allegato: e.target.files?.[0] || null }))}
              />
              {form.allegato && (
                <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)', marginTop: 4 }}>
                  Nuovo file selezionato: {form.allegato.name}
                </div>
              )}
              {!form.allegato && form.foto_url_esistente && (
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  <a href={form.foto_url_esistente} target="_blank" rel="noreferrer">📎 Allegato attuale</a>
                  <span style={{ color: 'var(--inchiostro-soft)' }}> — scegli un file per sostituirlo</span>
                </div>
              )}
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
                  {s.foto_url && (
                    <div style={{ marginTop: 6 }}>
                      <a href={s.foto_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                        📎 {isPdf(s.foto_url) ? 'Vedi PDF' : 'Vedi allegato'}
                      </a>
                    </div>
                  )}
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

      {/* ═══════════ VERSAMENTI DEI SOCI ═══════════ */}
      <div style={{ marginTop: 34, paddingTop: 24, borderTop: '2px solid var(--linea)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <div>
            <h3 style={{ fontSize: 16, margin: 0, color: 'var(--notte)' }}>Versamenti dei soci</h3>
            <p style={{ fontSize: 12.5, color: 'var(--inchiostro-soft)', margin: '4px 0 0' }}>
              Contanti messi dai soci. Restano solo qui: <strong>non entrano nella Cassa</strong>. Sarai tu a riportarli a mano in Cassa quando vorrai.
            </p>
          </div>
          {isMaster && (
            <button className="btn btn-primary" onClick={() => { if (mostraFormVers) annullaFormVers(); setMostraFormVers((v) => !v) }}>
              {mostraFormVers ? 'Annulla' : '+ Nuovo versamento'}
            </button>
          )}
        </div>

        {(totVersEur > 0 || totVersEgp > 0) && (
          <div className="stats-grid" style={{ margin: '16px 0' }}>
            <div className="stat-card">
              <div className="stat-label">Versato nel periodo (EUR)</div>
              <div className="stat-value positivo">€ {totVersEur.toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Versato nel periodo (LE)</div>
              <div className="stat-value positivo">{totVersEgp.toFixed(0)} LE</div>
            </div>
          </div>
        )}

        {isMaster && mostraFormVers && (
          <form onSubmit={salvaVersamento} className="card" style={{ margin: '16px 0' }}>
            <div className="form-grid">
              <div className="field">
                <label>Socio</label>
                <select value={formVers.socio_id} onChange={(e) => setFormVers((f) => ({ ...f, socio_id: e.target.value }))} required>
                  <option value="">— scegli —</option>
                  {soci.map((so) => <option key={so.id} value={so.id}>{so.nome}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Data</label>
                <input type="date" value={formVers.data} onChange={(e) => setFormVers((f) => ({ ...f, data: e.target.value }))} required />
              </div>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>Descrizione (opzionale)</label>
                <input type="text" value={formVers.descrizione} onChange={(e) => setFormVers((f) => ({ ...f, descrizione: e.target.value }))} placeholder="es. contanti per pagamento fornitore" />
              </div>
              <div className="field">
                <label>Importo €</label>
                <input type="number" step="0.01" value={formVers.importo_eur} onChange={(e) => setFormVers((f) => ({ ...f, importo_eur: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="field">
                <label>Importo LE</label>
                <input type="number" step="0.01" value={formVers.importo_egp} onChange={(e) => setFormVers((f) => ({ ...f, importo_egp: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>Allegato — foto o PDF (opzionale)</label>
                <input type="file" accept="image/*,application/pdf" onChange={(e) => setFormVers((f) => ({ ...f, allegato: e.target.files?.[0] || null }))} />
                {formVers.allegato && (
                  <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)', marginTop: 4 }}>Nuovo file: {formVers.allegato.name}</div>
                )}
                {!formVers.allegato && formVers.foto_url_esistente && (
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    <a href={formVers.foto_url_esistente} target="_blank" rel="noreferrer">📎 Allegato attuale</a>
                    <span style={{ color: 'var(--inchiostro-soft)' }}> — scegli un file per sostituirlo</span>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="submit" className="btn btn-accent" disabled={salvandoVers}>
                {salvandoVers ? 'Salvataggio…' : editandoVersId ? 'Salva modifiche' : 'Registra versamento'}
              </button>
              {editandoVersId && <button type="button" className="btn btn-ghost" onClick={annullaFormVers}>Annulla modifica</button>}
            </div>
          </form>
        )}

        {versamentiDelPeriodo.length === 0 ? (
          <div className="empty-state card" style={{ marginTop: 16 }}>
            <div className="empty-state-title">Nessun versamento in questo periodo</div>
            <p>Quando un socio mette dei contanti, registralo qui.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            {versamentiDelPeriodo.map((v) => (
              <div key={v.id} className="card" style={{ padding: '14px', borderLeft: '3px solid var(--smeraldo)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <span className="tag" style={{ marginBottom: 6, display: 'inline-block' }}>{v.soci?.nome}</span>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{v.descrizione || 'Versamento contanti'}</div>
                    <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)', marginTop: 3 }}>
                      {new Date(v.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                    {v.foto_url && (
                      <div style={{ marginTop: 6 }}>
                        <a href={v.foto_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                          📎 {isPdf(v.foto_url) ? 'Vedi PDF' : 'Vedi allegato'}
                        </a>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {Number(v.importo_eur) > 0 && <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--smeraldo)' }}>€ {Number(v.importo_eur).toFixed(2)}</div>}
                    {Number(v.importo_egp) > 0 && <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--smeraldo)' }}>{Number(v.importo_egp).toFixed(0)} LE</div>}
                  </div>
                </div>

                <div style={{ fontSize: 12, color: v.riportato_in_cassa ? 'var(--smeraldo)' : 'var(--inchiostro-soft)' }}>
                  {v.riportato_in_cassa ? '✓ Già riportato in Cassa da te' : '○ Non ancora riportato in Cassa'}
                </div>

                {isMaster && (
                  <div style={{ display: 'flex', gap: 8, paddingTop: 10, marginTop: 8, borderTop: '1px solid var(--linea)', flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost btn-sm" style={{ flex: '1 1 auto' }} onClick={() => segnaRiportato(v)}>
                      {v.riportato_in_cassa ? 'Segna come non riportato' : 'Segna come riportato'}
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ flex: '1 1 auto' }} onClick={() => apriModificaVers(v)}>Modifica</button>
                    <button className="btn btn-ghost btn-sm" style={{ flex: '1 1 auto', color: 'var(--corallo)' }} onClick={() => eliminaVersamento(v.id)}>Elimina</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
