import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

import { oggiLocale, primoGiornoMeseLocale } from '../lib/date'

const oggi = oggiLocale

export default function Dipendenti() {
  const { profile, isMaster, isViewer } = useAuth()
  const [dipendenti, setDipendenti] = useState([])
  const [presenzeOggi, setPresenzeOggi] = useState({})
  const [accontiTotali, setAccontiTotali] = useState({})
  const [accontiDettaglio, setAccontiDettaglio] = useState({}) // id → [{data, importo_eur, importo_egp, erogato_da, note}]
  const [mostraExDipendenti, setMostraExDipendenti] = useState(false)
  const [stipendiCalcolati, setStipendiCalcolati] = useState({})
  const [loading, setLoading] = useState(true)
  const [dataSelezionata, setDataSelezionata] = useState(oggi())
  const [dipendenteAperto, setDipendenteAperto] = useState(null)
  const [dettaglioGiorniAperto, setDettaglioGiorniAperto] = useState(null)

  // form nuovo dipendente (solo master)
  const [mostraNuovo, setMostraNuovo] = useState(false)
  const [nuovo, setNuovo] = useState({ nome: '', ruolo_lavoro: '', data_inizio: '', stipendio_eur: '', stipendio_egp: '', foto: null })
  const [salvandoNuovo, setSalvandoNuovo] = useState(false)

  // form acconto
  const [accontoForm, setAccontoForm] = useState({ importo_eur: '', importo_egp: '', note: '', erogato_da: 'direttore' })
  const [salvandoAcconto, setSalvandoAcconto] = useState(false)

  // form modifica dipendente — solo Master, tutti i campi
  const [editForm, setEditForm] = useState({ nome: '', ruolo_lavoro: '', data_inizio: '', stipendio_eur: '', stipendio_egp: '', foto: null, foto_url_attuale: null })
  const [editandoDipendente, setEditandoDipendente] = useState(null)
  const [salvandoEdit, setSalvandoEdit] = useState(false)

  const puoSegnare = isMaster || profile?.ruolo === 'operatore'

  async function carica() {
    setLoading(true)
    const { data: dip } = await supabase.from('dipendenti').select('*').order('nome')
    setDipendenti(dip || [])

    const { data: pres } = await supabase.from('presenze').select('*').eq('data', dataSelezionata)
    const mapPres = {}
    ;(pres || []).forEach((p) => { mapPres[p.dipendente_id] = p })
    setPresenzeOggi(mapPres)

    const { data: acc } = await supabase.from('acconti').select('*').order('data', { ascending: false })

    // Recupera il periodo cassa aperto per filtrare gli acconti
    const { data: periodoAperto } = await supabase.from('periodi_cassa').select('id').is('data_chiusura', null).single()
    const periodoCassaId = periodoAperto?.id || null

    const mapAcc = {}
    const mapAccDet = {}
    ;(acc || []).forEach((a) => {
      // Mostra solo gli acconti del periodo cassa corrente
      if (periodoCassaId && a.periodo_cassa_id && a.periodo_cassa_id !== periodoCassaId) return
      if (!mapAcc[a.dipendente_id]) mapAcc[a.dipendente_id] = { eur: 0, egp: 0 }
      mapAcc[a.dipendente_id].eur += Number(a.importo_eur) || 0
      mapAcc[a.dipendente_id].egp += Number(a.importo_egp) || 0
      if (!mapAccDet[a.dipendente_id]) mapAccDet[a.dipendente_id] = []
      mapAccDet[a.dipendente_id].push(a)
    })
    setAccontiTotali(mapAcc)
    setAccontiDettaglio(mapAccDet)

    // Stipendio calcolato per il mese corrente (vista stipendi_calcolati)
    const primoGiornoMeseCorrente = primoGiornoMeseLocale()
    const { data: stip } = await supabase
      .from('stipendi_calcolati')
      .select('*')
      .eq('mese', primoGiornoMeseCorrente)
    const mapStip = {}
    ;(stip || []).forEach((s) => { mapStip[s.dipendente_id] = s })
    setStipendiCalcolati(mapStip)

    setLoading(false)
  }

  useEffect(() => { carica() }, [dataSelezionata])

  async function segnaPresenza(dipendenteId, stato, nomeDipendente) {
    if (!puoSegnare) return
    const esistente = presenzeOggi[dipendenteId]

    if (esistente) {
      if (esistente.stato === stato) return // già impostato così, nessuna modifica
      const labelStato = { presente: 'Presente', assente: 'Assente', parziale: 'Parziale' }
      const conferma = confirm(
        `${nomeDipendente}: stai cambiando da "${labelStato[esistente.stato]}" a "${labelStato[stato]}". Confermi?`
      )
      if (!conferma) return
      await supabase.from('presenze').update({ stato }).eq('id', esistente.id)
    } else {
      await supabase.from('presenze').insert({
        dipendente_id: dipendenteId,
        data: dataSelezionata,
        stato,
        inserito_da: profile.id,
      })
    }
    carica()
  }

  async function fotoToBase64(file) {
    return new Promise((resolve, reject) => {
      // Ridimensiona a max 200px per non appesantire il DB
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        const MAX = 200
        const scale = Math.min(MAX / img.width, MAX / img.height, 1)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.onerror = reject
      img.src = url
    })
  }

  async function salvaNuovoDipendente(e) {
    e.preventDefault()
    setSalvandoNuovo(true)

    let foto_url = null
    if (nuovo.foto) {
      try {
        foto_url = await fotoToBase64(nuovo.foto)
      } catch (err) {
        console.error('Errore conversione foto:', err)
      }
    }

    const { data: inserted, error } = await supabase.from('dipendenti').insert({
      nome: nuovo.nome,
      ruolo_lavoro: nuovo.ruolo_lavoro || null,
      data_inizio: nuovo.data_inizio || null,
      stipendio_eur: Number(nuovo.stipendio_eur) || 0,
      stipendio_egp: Number(nuovo.stipendio_egp) || 0,
      foto_url,
    }).select()
    if (error) { setSalvandoNuovo(false); alert('Errore salvataggio: ' + error.message); return }
    setSalvandoNuovo(false)
    if (!error) {
      setNuovo({ nome: '', ruolo_lavoro: '', data_inizio: '', stipendio_eur: '', stipendio_egp: '', foto: null })
      setMostraNuovo(false)
      carica()
    } else {
      alert('Errore: ' + error.message)
    }
  }

  async function salvaAcconto(dipendenteId) {
    setSalvandoAcconto(true)
    const { error } = await supabase.from('acconti').insert({
      dipendente_id: dipendenteId,
      data: oggi(),
      importo_eur: Number(accontoForm.importo_eur) || 0,
      importo_egp: Number(accontoForm.importo_egp) || 0,
      note: accontoForm.note || null,
      erogato_da: accontoForm.erogato_da || 'direttore',
      inserito_da: profile.id,
    })
    setSalvandoAcconto(false)
    if (!error) {
      setAccontoForm({ importo_eur: '', importo_egp: '', note: '', erogato_da: 'direttore' })
      carica()
    } else {
      alert('Errore: ' + error.message)
    }
  }

  async function terminaRapporto(d) {
    if (!confirm(`Terminare il rapporto di lavoro con ${d.nome}? Il dipendente verrà spostato tra gli ex dipendenti. I dati storici (presenze, acconti) restano conservati.`)) return
    const { error } = await supabase.from('dipendenti').update({ attivo: false }).eq('id', d.id)
    if (error) alert('Errore: ' + error.message)
    else { setDipendenteAperto(null); carica() }
  }

  async function riassumi(d) {
    if (!confirm(`Riassumere ${d.nome}? Il dipendente tornerà nella lista attiva.`)) return
    const { error } = await supabase.from('dipendenti').update({ attivo: true }).eq('id', d.id)
    if (error) alert('Errore: ' + error.message)
    else carica()
  }

  async function eliminaDipendente(d) {
    if (!confirm(`ELIMINAZIONE DEFINITIVA di ${d.nome}.\n\nATTENZIONE: verranno eliminati anche tutti i suoi dati storici (presenze, acconti, stipendi). Questa azione non può essere annullata.\n\nContinuare?`)) return
    if (!confirm(`Sei sicuro? Tutti i dati di ${d.nome} verranno cancellati per sempre.`)) return
    const { error } = await supabase.from('dipendenti').delete().eq('id', d.id)
    if (error) alert('Errore: ' + error.message)
    else { setDipendenteAperto(null); carica() }
  }

  async function eliminaAcconto(id, nomeDip) {
    if (!confirm(`Eliminare questo acconto di ${nomeDip}? Verrà rimossa anche la relativa voce dalle Uscite.`)) return
    const { error } = await supabase.from('acconti').delete().eq('id', id)
    if (error) alert('Errore: ' + error.message)
    else carica()
  }

  function apriModifica(d) {
    setEditForm({
      nome: d.nome || '',
      ruolo_lavoro: d.ruolo_lavoro || '',
      data_inizio: d.data_inizio || '',
      stipendio_eur: d.stipendio_eur || '',
      stipendio_egp: d.stipendio_egp || '',
      foto: null,
      foto_url_attuale: d.foto_url || null,
    })
    setEditandoDipendente(d.id)
  }

  async function salvaModificaDipendente(e) {
    e.preventDefault()
    setSalvandoEdit(true)

    let foto_url = editForm.foto_url_attuale
    if (editForm.foto) {
      try {
        foto_url = await fotoToBase64(editForm.foto)
      } catch (err) {
        console.error('Errore conversione foto:', err)
      }
    }

    const { error } = await supabase.from('dipendenti').update({
      nome: editForm.nome,
      ruolo_lavoro: editForm.ruolo_lavoro || null,
      data_inizio: editForm.data_inizio || null,
      stipendio_eur: Number(editForm.stipendio_eur) || 0,
      stipendio_egp: Number(editForm.stipendio_egp) || 0,
      foto_url,
    }).eq('id', editandoDipendente)

    setSalvandoEdit(false)
    if (!error) {
      setEditandoDipendente(null)
      carica()
    } else {
      alert('Errore nella modifica: ' + error.message)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dipendenti</h1>
          <p className="page-subtitle">Presenze giornaliere, stipendi e acconti con calcolo automatico del residuo.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="date" value={dataSelezionata} onChange={(e) => setDataSelezionata(e.target.value)} style={{ padding: '9px 12px', borderRadius: 6, border: '1px solid var(--linea)' }} />
          <button className="btn btn-ghost" onClick={() => setMostraExDipendenti((v) => !v)}>
            {mostraExDipendenti ? 'Mostra attivi' : 'Ex dipendenti'}
          </button>
          {isMaster && !mostraExDipendenti && (
            <button className="btn btn-primary" onClick={() => setMostraNuovo((v) => !v)}>
              {mostraNuovo ? 'Annulla' : '+ Nuovo dipendente'}
            </button>
          )}
        </div>
      </div>

      {isMaster && mostraNuovo && (
        <form onSubmit={salvaNuovoDipendente} className="card" style={{ marginBottom: 28 }}>
          <div className="form-grid">
            <div className="field">
              <label>Nome</label>
              <input type="text" value={nuovo.nome} onChange={(e) => setNuovo((f) => ({ ...f, nome: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Ruolo / mansione</label>
              <input type="text" value={nuovo.ruolo_lavoro} onChange={(e) => setNuovo((f) => ({ ...f, ruolo_lavoro: e.target.value }))} placeholder="es. Chef, Cameriere…" />
            </div>
            <div className="field">
              <label>Data inizio lavoro</label>
              <input type="date" value={nuovo.data_inizio} onChange={(e) => setNuovo((f) => ({ ...f, data_inizio: e.target.value }))} />
            </div>
            <div className="field">
              <label>Stipendio mensile €</label>
              <input type="number" step="0.01" value={nuovo.stipendio_eur} onChange={(e) => setNuovo((f) => ({ ...f, stipendio_eur: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="field">
              <label>Stipendio mensile LE</label>
              <input type="number" step="0.01" value={nuovo.stipendio_egp} onChange={(e) => setNuovo((f) => ({ ...f, stipendio_egp: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="field">
              <label>Foto</label>
              <input type="file" accept="image/*" onChange={(e) => setNuovo((f) => ({ ...f, foto: e.target.files[0] }))} />
            </div>
          </div>
          <button type="submit" className="btn btn-accent" style={{ marginTop: 18 }} disabled={salvandoNuovo}>
            {salvandoNuovo ? 'Salvataggio…' : 'Aggiungi dipendente'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="page-subtitle">Caricamento…</p>
      ) : (
        <>
        {(() => {
          const lista = dipendenti.filter((d) => mostraExDipendenti ? !d.attivo : d.attivo)
          if (lista.length === 0) return (
            <div className="empty-state card">
              <div className="empty-state-title">{mostraExDipendenti ? 'Nessun ex dipendente' : 'Nessun dipendente attivo'}</div>
              <p>{mostraExDipendenti ? 'Non ci sono dipendenti con rapporto terminato.' : isMaster ? 'Aggiungi il primo dipendente con il pulsante sopra.' : 'Il Master non ha ancora aggiunto dipendenti.'}</p>
            </div>
          )
          return (
        <div style={{ display: 'grid', gap: 12 }}>
          {lista.map((d) => {
            const stato = presenzeOggi[d.id]?.stato
            const acconti = accontiTotali[d.id] || { eur: 0, egp: 0 }
            const righeAcconti = accontiDettaglio[d.id] || []
            const calcoloMese = stipendiCalcolati[d.id]
            const stipendioDovutoEur = calcoloMese ? Number(calcoloMese.stipendio_dovuto_eur) : Number(d.stipendio_eur)
            const stipendioDovutoEgp = calcoloMese ? Number(calcoloMese.stipendio_dovuto_egp) : Number(d.stipendio_egp)
            const residuoEur = stipendioDovutoEur - acconti.eur
            const residuoEgp = stipendioDovutoEgp - acconti.egp
            const aperto = dipendenteAperto === d.id

            return (
              <div key={d.id} className="card" style={{ padding: '14px' }}>

                {/* Riga 1: foto + nome + pill presenze */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  {d.foto_url ? (
                    <img src={d.foto_url} alt={d.nome} className="photo-thumb"
                      onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                  ) : null}
                  <div className="photo-thumb" style={{ display: d.foto_url ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--sabbia-chiara)', color: 'var(--notte)', fontWeight: 700, flexShrink: 0 }}>
                    {d.nome.charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{d.nome}</div>
                    <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)' }}>{d.ruolo_lavoro || '—'}</div>
                  </div>
                  {/* Pill presenze — solo attivi, sempre visibili a destra */}
                  {d.attivo && (
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                      <button className={`attendance-pill ${stato === 'presente' ? 'presente' : 'vuoto'}`} onClick={() => segnaPresenza(d.id, 'presente', d.nome)} disabled={!puoSegnare} title="Presente">P</button>
                      <button className={`attendance-pill ${stato === 'parziale' ? 'parziale' : 'vuoto'}`} onClick={() => segnaPresenza(d.id, 'parziale', d.nome)} disabled={!puoSegnare} title="Parziale">½</button>
                      <button className={`attendance-pill ${stato === 'assente' ? 'assente' : 'vuoto'}`} onClick={() => segnaPresenza(d.id, 'assente', d.nome)} disabled={!puoSegnare} title="Assente">A</button>
                    </div>
                  )}
                </div>

                {/* Riga 2: azioni Master + Dettagli */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
                  <button className="btn btn-ghost btn-sm" style={{ flex: '1 1 auto' }} onClick={() => setDipendenteAperto(aperto ? null : d.id)}>
                    {aperto ? '▲ Chiudi' : '▼ Dettagli'}
                  </button>
                  {isMaster && d.attivo && (
                    <button className="btn btn-ghost btn-sm" style={{ flex: '1 1 auto' }} onClick={() => apriModifica(d)}>Modifica</button>
                  )}
                  {isMaster && d.attivo && (
                    <button className="btn btn-ghost btn-sm" style={{ flex: '1 1 auto', color: 'var(--corallo)' }} onClick={() => terminaRapporto(d)}>Termina</button>
                  )}
                  {isMaster && !d.attivo && (
                    <button className="btn btn-ghost btn-sm" style={{ flex: '1 1 auto', color: 'var(--smeraldo)' }} onClick={() => riassumi(d)}>↩ Riassumi</button>
                  )}
                  {isMaster && !d.attivo && (
                    <button className="btn btn-ghost btn-sm" style={{ flex: '1 1 auto', color: 'var(--corallo)' }} onClick={() => eliminaDipendente(d)}>Elimina</button>
                  )}
                </div>

                {isMaster && editandoDipendente === d.id && (
                  <form onSubmit={salvaModificaDipendente} style={{ marginTop: 18, paddingTop: 18, borderTop: '1px dashed var(--linea)' }}>
                    <h4 style={{ fontSize: 14, marginBottom: 12, fontFamily: 'var(--font-body)' }}>Modifica dati dipendente</h4>
                    <div className="form-grid">
                      <div className="field">
                        <label>Nome</label>
                        <input type="text" value={editForm.nome} onChange={(e) => setEditForm((f) => ({ ...f, nome: e.target.value }))} required />
                      </div>
                      <div className="field">
                        <label>Ruolo / mansione</label>
                        <input type="text" value={editForm.ruolo_lavoro} onChange={(e) => setEditForm((f) => ({ ...f, ruolo_lavoro: e.target.value }))} />
                      </div>
                      <div className="field">
                        <label>Data inizio lavoro</label>
                        <input type="date" value={editForm.data_inizio} onChange={(e) => setEditForm((f) => ({ ...f, data_inizio: e.target.value }))} />
                      </div>
                      <div className="field">
                        <label>Stipendio mensile €</label>
                        <input type="number" step="0.01" value={editForm.stipendio_eur} onChange={(e) => setEditForm((f) => ({ ...f, stipendio_eur: e.target.value }))} />
                      </div>
                      <div className="field">
                        <label>Stipendio mensile LE</label>
                        <input type="number" step="0.01" value={editForm.stipendio_egp} onChange={(e) => setEditForm((f) => ({ ...f, stipendio_egp: e.target.value }))} />
                      </div>
                      <div className="field">
                        <label>Nuova foto (lascia vuoto per non cambiarla)</label>
                        <input type="file" accept="image/*" onChange={(e) => setEditForm((f) => ({ ...f, foto: e.target.files[0] }))} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                      <button type="submit" className="btn btn-accent btn-sm" disabled={salvandoEdit}>
                        {salvandoEdit ? 'Salvataggio…' : 'Salva modifiche'}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditandoDipendente(null)}>
                        Annulla
                      </button>
                    </div>
                  </form>
                )}

                {aperto && (
                  <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--linea)' }}>
                    {calcoloMese && (
                      <div className="card" style={{ marginBottom: 16, background: 'var(--avorio)', border: '1px dashed var(--linea)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                          <div style={{ fontSize: 13, color: 'var(--inchiostro-soft)', lineHeight: 1.7 }}>
                            <strong style={{ color: 'var(--notte)' }}>Questo mese:</strong>{' '}
                            {calcoloMese.giorni_presenti} giorni presenti su {calcoloMese.riferimento} di riferimento
                            {calcoloMese.giorni_parziali > 0 && (
                              <span className="tag" style={{ marginLeft: 8, background: 'rgba(232,199,146,0.3)', color: '#8a6a2b' }}>
                                ⚠ {calcoloMese.giorni_parziali} giorni parziali da valutare a parte
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setDettaglioGiorniAperto(dettaglioGiorniAperto === d.id ? null : d.id)}
                          >
                            {dettaglioGiorniAperto === d.id ? 'Nascondi giorni ▾' : 'Vedi giorni ▸'}
                          </button>
                        </div>

                        {dettaglioGiorniAperto === d.id && (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--linea)' }}>
                            {calcoloMese.elenco_giorni_assenti?.length > 0 && (
                              <div style={{ fontSize: 13, color: 'var(--corallo)', marginBottom: 6 }}>
                                <strong>Giorni assenti:</strong> {calcoloMese.elenco_giorni_assenti.join(', ')}
                              </div>
                            )}

                            {calcoloMese.elenco_giorni_non_segnati?.length > 0 && (
                              <div style={{ fontSize: 13, color: '#8a6a2b', marginBottom: 6 }}>
                                <strong>⚠ Nessun dato inserito (contati come assenti):</strong> {calcoloMese.elenco_giorni_non_segnati.join(', ')}
                              </div>
                            )}

                            {calcoloMese.elenco_giorni_parziali?.length > 0 && (
                              <div style={{ fontSize: 13, color: 'var(--inchiostro-soft)' }}>
                                <strong>Giorni parziali:</strong> {calcoloMese.elenco_giorni_parziali.join(', ')}
                              </div>
                            )}

                            {!calcoloMese.elenco_giorni_assenti?.length && !calcoloMese.elenco_giorni_parziali?.length && (
                              <div style={{ fontSize: 13, color: 'var(--smeraldo)' }}>
                                Nessuna assenza questo mese.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="stats-grid" style={{ marginBottom: 18 }}>
                      <div className="stat-card">
                        <div className="stat-label">Stipendio base €</div>
                        <div className="stat-value">€ {Number(d.stipendio_eur).toFixed(2)}</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-label">Stipendio base LE</div>
                        <div className="stat-value">{Number(d.stipendio_egp).toFixed(0)} LE</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-label">Dovuto questo mese €</div>
                        <div className="stat-value">€ {stipendioDovutoEur.toFixed(2)}</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-label">Dovuto questo mese LE</div>
                        <div className="stat-value">{stipendioDovutoEgp.toFixed(0)} LE</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-label">Acconti versati €</div>
                        <div className="stat-value">€ {acconti.eur.toFixed(2)}</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-label">Acconti versati LE</div>
                        <div className="stat-value">{acconti.egp.toFixed(0)} LE</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-label">Residuo da pagare €</div>
                        <div className={`stat-value ${residuoEur < 0 ? 'negativo' : 'positivo'}`}>€ {residuoEur.toFixed(2)}</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-label">Residuo da pagare LE</div>
                        <div className={`stat-value ${residuoEgp < 0 ? 'negativo' : 'positivo'}`}>{residuoEgp.toFixed(0)} LE</div>
                      </div>
                    </div>

                    {d.data_inizio && (
                      <p style={{ fontSize: 13.5, color: 'var(--inchiostro-soft)', marginBottom: 16 }}>
                        In forza dal {new Date(d.data_inizio).toLocaleDateString('it-IT')}
                      </p>
                    )}

                    )}

                    {/* ── Storico acconti ── */}
                    {righeAcconti.length > 0 && (
                      <div style={{ marginTop: 20, marginBottom: 16 }}>
                        <h4 style={{ fontSize: 14, marginBottom: 10, fontFamily: 'var(--font-body)' }}>Storico acconti</h4>
                        <div style={{ overflowX: 'auto' }}>
                          <table>
                            <thead>
                              <tr>
                                <th>Data</th>
                                <th>Importo €</th>
                                <th>Importo LE</th>
                                <th>Erogato da</th>
                                <th>Note</th>
                                {isMaster && <th></th>}
                              </tr>
                            </thead>
                            <tbody>
                              {righeAcconti.map((a) => (
                                <tr key={a.id}>
                                  <td>{new Date(a.data).toLocaleDateString('it-IT')}</td>
                                  <td>{Number(a.importo_eur) > 0 ? `€ ${Number(a.importo_eur).toFixed(2)}` : '—'}</td>
                                  <td>{Number(a.importo_egp) > 0 ? `${Number(a.importo_egp).toFixed(0)} LE` : '—'}</td>
                                  <td style={{ textTransform: 'capitalize', color: 'var(--inchiostro-soft)' }}>
                                    {a.erogato_da === 'direttore' ? 'Cassa ristorante' : a.erogato_da}
                                  </td>
                                  <td style={{ color: 'var(--inchiostro-soft)' }}>{a.note || '—'}</td>
                                  {isMaster && (
                                    <td>
                                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--corallo)' }} onClick={() => eliminaAcconto(a.id, d.nome)}>
                                        Elimina
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* ── Registra acconto ── */}
                    {puoSegnare && d.attivo && (
                      <div>
                        <h4 style={{ fontSize: 14, marginBottom: 10, fontFamily: 'var(--font-body)' }}>Registra un acconto</h4>
                        <div className="form-grid">
                          <div className="field">
                            <label>Importo €</label>
                            <input type="number" step="0.01" value={accontoForm.importo_eur} onChange={(e) => setAccontoForm((f) => ({ ...f, importo_eur: e.target.value }))} placeholder="0.00" />
                          </div>
                          <div className="field">
                            <label>Importo LE</label>
                            <input type="number" step="0.01" value={accontoForm.importo_egp} onChange={(e) => setAccontoForm((f) => ({ ...f, importo_egp: e.target.value }))} placeholder="0.00" />
                          </div>
                          <div className="field">
                            <label>Note</label>
                            <input type="text" value={accontoForm.note} onChange={(e) => setAccontoForm((f) => ({ ...f, note: e.target.value }))} placeholder="opzionale" />
                          </div>
                          <div className="field">
                            <label>Chi ha dato i soldi</label>
                            <select value={accontoForm.erogato_da} onChange={(e) => setAccontoForm((f) => ({ ...f, erogato_da: e.target.value }))}>
                              <option value="direttore">Direttore / cassa ristorante</option>
                              <option value="gianluigi">Gianluigi</option>
                              <option value="luca">Luca</option>
                            </select>
                          </div>
                        </div>
                        <button className="btn btn-accent btn-sm" style={{ marginTop: 12 }} onClick={() => salvaAcconto(d.id)} disabled={salvandoAcconto}>
                          {salvandoAcconto ? 'Salvataggio…' : 'Registra acconto'}
                        </button>
                      </div>
                    )}

                  </div>
                )}
              </div>
            )
          })}
        </div>
          )
        })()}
        </>
      )}
    </div>
  )
}
