import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const oggi = () => new Date().toISOString().slice(0, 10)

export default function Dipendenti() {
  const { profile, isMaster, isViewer } = useAuth()
  const [dipendenti, setDipendenti] = useState([])
  const [presenzeOggi, setPresenzeOggi] = useState({})
  const [accontiTotali, setAccontiTotali] = useState({})
  const [loading, setLoading] = useState(true)
  const [dataSelezionata, setDataSelezionata] = useState(oggi())
  const [dipendenteAperto, setDipendenteAperto] = useState(null)

  // form nuovo dipendente (solo master)
  const [mostraNuovo, setMostraNuovo] = useState(false)
  const [nuovo, setNuovo] = useState({ nome: '', ruolo_lavoro: '', data_inizio: '', stipendio_eur: '', stipendio_egp: '', foto: null })
  const [salvandoNuovo, setSalvandoNuovo] = useState(false)

  // form acconto
  const [accontoForm, setAccontoForm] = useState({ importo_eur: '', importo_egp: '', note: '' })
  const [salvandoAcconto, setSalvandoAcconto] = useState(false)

  // form modifica foto/contatti — disponibile anche all'operatore
  const [contattoForm, setContattoForm] = useState({ telefono: '', note_operatore: '', foto: null })
  const [editandoContatti, setEditandoContatti] = useState(null)
  const [salvandoContatti, setSalvandoContatti] = useState(false)

  const puoSegnare = isMaster || profile?.ruolo === 'operatore'

  async function carica() {
    setLoading(true)
    const { data: dip } = await supabase.from('dipendenti').select('*').eq('attivo', true).order('nome')
    setDipendenti(dip || [])

    const { data: pres } = await supabase.from('presenze').select('*').eq('data', dataSelezionata)
    const mapPres = {}
    ;(pres || []).forEach((p) => { mapPres[p.dipendente_id] = p })
    setPresenzeOggi(mapPres)

    const { data: acc } = await supabase.from('acconti').select('*')
    const mapAcc = {}
    ;(acc || []).forEach((a) => {
      if (!mapAcc[a.dipendente_id]) mapAcc[a.dipendente_id] = { eur: 0, egp: 0 }
      mapAcc[a.dipendente_id].eur += Number(a.importo_eur) || 0
      mapAcc[a.dipendente_id].egp += Number(a.importo_egp) || 0
    })
    setAccontiTotali(mapAcc)

    setLoading(false)
  }

  useEffect(() => { carica() }, [dataSelezionata])

  async function segnaPresenza(dipendenteId, stato) {
    if (!puoSegnare) return
    const esistente = presenzeOggi[dipendenteId]
    if (esistente) {
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

  async function salvaNuovoDipendente(e) {
    e.preventDefault()
    setSalvandoNuovo(true)

    let foto_url = null
    if (nuovo.foto) {
      const ext = nuovo.foto.name.split('.').pop()
      const path = `dipendenti/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadError } = await supabase.storage.from('foto').upload(path, nuovo.foto)
      if (!uploadError) {
        const { data } = supabase.storage.from('foto').getPublicUrl(path)
        foto_url = data.publicUrl
      }
    }

    const { error } = await supabase.from('dipendenti').insert({
      nome: nuovo.nome,
      ruolo_lavoro: nuovo.ruolo_lavoro || null,
      data_inizio: nuovo.data_inizio || null,
      stipendio_eur: Number(nuovo.stipendio_eur) || 0,
      stipendio_egp: Number(nuovo.stipendio_egp) || 0,
      foto_url,
    })
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
      inserito_da: profile.id,
    })
    setSalvandoAcconto(false)
    if (!error) {
      setAccontoForm({ importo_eur: '', importo_egp: '', note: '' })
      carica()
    } else {
      alert('Errore: ' + error.message)
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
          {isMaster && (
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
      ) : dipendenti.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-title">Nessun dipendente registrato</div>
          <p>{isMaster ? 'Aggiungi il primo dipendente con il pulsante sopra.' : 'Il Master non ha ancora aggiunto dipendenti.'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {dipendenti.map((d) => {
            const stato = presenzeOggi[d.id]?.stato
            const acconti = accontiTotali[d.id] || { eur: 0, egp: 0 }
            const residuoEur = Number(d.stipendio_eur) - acconti.eur
            const residuoEgp = Number(d.stipendio_egp) - acconti.egp
            const aperto = dipendenteAperto === d.id

            return (
              <div key={d.id} className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {d.foto_url ? (
                    <img src={d.foto_url} alt={d.nome} className="photo-thumb" />
                  ) : (
                    <div className="photo-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--sabbia-chiara)', color: 'var(--notte)', fontWeight: 700 }}>
                      {d.nome.charAt(0)}
                    </div>
                  )}

                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15.5 }}>{d.nome}</div>
                    <div style={{ fontSize: 13, color: 'var(--inchiostro-soft)' }}>{d.ruolo_lavoro || '—'}</div>
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className={`attendance-pill ${stato === 'presente' ? 'presente' : 'vuoto'}`}
                      onClick={() => segnaPresenza(d.id, 'presente')}
                      disabled={!puoSegnare}
                      title="Presente"
                    >P</button>
                    <button
                      className={`attendance-pill ${stato === 'parziale' ? 'parziale' : 'vuoto'}`}
                      onClick={() => segnaPresenza(d.id, 'parziale')}
                      disabled={!puoSegnare}
                      title="Parziale"
                    >½</button>
                    <button
                      className={`attendance-pill ${stato === 'assente' ? 'assente' : 'vuoto'}`}
                      onClick={() => segnaPresenza(d.id, 'assente')}
                      disabled={!puoSegnare}
                      title="Assente"
                    >A</button>
                  </div>

                  <button className="btn btn-ghost btn-sm" onClick={() => setDipendenteAperto(aperto ? null : d.id)}>
                    {aperto ? 'Chiudi' : 'Dettagli'}
                  </button>
                </div>

                {aperto && (
                  <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--linea)' }}>
                    <div className="stats-grid" style={{ marginBottom: 18 }}>
                      <div className="stat-card">
                        <div className="stat-label">Stipendio €</div>
                        <div className="stat-value">€ {Number(d.stipendio_eur).toFixed(2)}</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-label">Stipendio LE</div>
                        <div className="stat-value">{Number(d.stipendio_egp).toFixed(0)} LE</div>
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

                    {puoSegnare && (
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
      )}
    </div>
  )
}
