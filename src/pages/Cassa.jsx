import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { filtraPeriodo, etichettaPeriodo } from '../lib/periodi'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/Toast'
import { esegui, avvisaSeOffline } from '../lib/operazioni'
import { controllaCambioValuta } from '../lib/anomalie'
import ConfermaAnomalia from '../lib/ConfermaAnomalia'

import { oggiLocale } from '../lib/date'

const oggi = oggiLocale

const VALUTE = { EUR: '€', USD: '$', EGP: 'LE' }

export default function Cassa() {
  const { profile, isMaster } = useAuth()
  const toast = useToast()
  const [saldo, setSaldo] = useState(null)
  const [movimenti, setMovimenti] = useState([])
  const [loading, setLoading] = useState(true)
  const [salvandoCambio, setSalvandoCambio] = useState(false)
  const [salvandoPrelievo, setSalvandoPrelievo] = useState(false)
  const [tassi, setTassi] = useState({ eur_usd: 1.08, eur_egp: 60 })
  // Anomalia sul cambio valuta in attesa di conferma prima di salvare
  const [anomaliaCambio, setAnomaliaCambio] = useState(null)

  const [cambioForm, setCambioForm] = useState({ valuta_da: 'EUR', importo_da: '', valuta_a: 'EGP', importo_a: '', note: '' })
  const [prelievoForm, setPrelievoForm] = useState({ importo_pos: '', note: '' })
  const [versamentoForm, setVersamentoForm] = useState({ valuta: 'EUR', importo: '', note: '' })
  // Date scelte per la chiusura del periodo (vuote = chiudi tutto come prima)
  const [chiusuraDa, setChiusuraDa] = useState('')
  const [chiusuraA, setChiusuraA] = useState('')
  const [salvandoVersamento, setSalvandoVersamento] = useState(false)

  const [periodoAperto, setPeriodoAperto] = useState(null)
  const [storicoPeriodi, setStoricoPeriodi] = useState([])
  const [mostraConfermaChiusura, setMostraConfermaChiusura] = useState(false)
  const [noteChiusura, setNoteChiusura] = useState('')
  const [chiudendo, setChiudendo] = useState(false)
  const [riaprendo, setRiaprendo] = useState(false)
  const [editMovimento, setEditMovimento] = useState(null) // { id, tipo, importo_pos, importo_da, importo_a, valuta_da, valuta_a, note, data }

  async function carica() {
    setLoading(true)
    const [
      { data: s, error: errS },
      { data: pAperto, error: errP },
      { data: pStorico, error: errPs },
      { data: t, error: errT },
    ] = await Promise.all([
      // maybeSingle() invece di single(): se non c'è ancora nessuna riga
      // (es. cassa mai inizializzata) non deve far esplodere la pagina.
      esegui(supabase.from('saldo_cassa_attuale').select('*').maybeSingle(), toast, 'il caricamento del saldo cassa'),
      esegui(supabase.from('periodi_cassa').select('*').is('data_chiusura', null).maybeSingle(), toast, 'il caricamento del periodo aperto'),
      esegui(supabase.from('periodi_cassa').select('*, profiles:chiuso_da(nome)').not('data_chiusura', 'is', null).order('data_chiusura', { ascending: false }), toast, 'il caricamento dello storico periodi'),
      esegui(supabase.from('tassi_cambio').select('*').order('created_at', { ascending: false }).limit(1), toast, 'il caricamento dei tassi di cambio'),
    ])
    // Come il saldo, anche i movimenti mostrati sono solo quelli del periodo
    // in corso: quelli dei periodi chiusi si trovano in Archivio.
    const { data: m, error: errM } = await esegui(
      filtraPeriodo(supabase.from('movimenti_cassa').select('*, profiles:inserito_da(nome)'), pAperto)
        .order('data', { ascending: false }).order('created_at', { ascending: false }),
      toast, 'il caricamento dei movimenti'
    )
    if (!errS) setSaldo(s)
    if (!errM) setMovimenti(m || [])
    if (!errP) setPeriodoAperto(pAperto || null)
    if (!errPs) setStoricoPeriodi(pStorico || [])
    if (!errT && t && t.length) setTassi(t[0])
    setLoading(false)
  }

  useEffect(() => {
    avvisaSeOffline(toast)
    carica()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function salvaCambio(e, forzato = false) {
    e.preventDefault()

    // Controllo anomalia: il cambio implicito inserito è troppo lontano dal
    // tasso configurato in Impostazioni → probabile errore di battitura.
    if (!forzato) {
      const messaggioAnomalia = controllaCambioValuta(
        cambioForm.valuta_da, cambioForm.importo_da,
        cambioForm.valuta_a, cambioForm.importo_a,
        tassi
      )
      if (messaggioAnomalia) {
        setAnomaliaCambio({ messaggio: messaggioAnomalia, e })
        return
      }
    }

    setSalvandoCambio(true)
    const { error } = await esegui(
      supabase.from('movimenti_cassa').insert({
        tipo: 'cambio_valuta',
        data: oggi(),
        valuta_da: cambioForm.valuta_da,
        importo_da: Number(cambioForm.importo_da) || 0,
        valuta_a: cambioForm.valuta_a,
        importo_a: Number(cambioForm.importo_a) || 0,
        note: cambioForm.note || null,
        inserito_da: profile.id,
      }),
      toast, 'il salvataggio del cambio valuta'
    )
    setSalvandoCambio(false)
    setAnomaliaCambio(null)
    if (!error) {
      toast.success('Cambio valuta registrato.')
      setCambioForm({ valuta_da: 'EUR', importo_da: '', valuta_a: 'EGP', importo_a: '', note: '' })
      carica()
    }
  }

  function confermaAnomaliaCambioESalva() {
    if (anomaliaCambio?.e) salvaCambio(anomaliaCambio.e, true)
  }

  async function salvaPrelievo(e) {
    e.preventDefault()
    setSalvandoPrelievo(true)
    const { error } = await esegui(
      supabase.from('movimenti_cassa').insert({
        tipo: 'prelievo_pos',
        data: oggi(),
        importo_pos: Number(prelievoForm.importo_pos) || 0,
        note: prelievoForm.note || null,
        inserito_da: profile.id,
      }),
      toast, 'il salvataggio del prelievo POS'
    )
    setSalvandoPrelievo(false)
    if (!error) {
      toast.success('Prelievo registrato.')
      setPrelievoForm({ importo_pos: '', note: '' })
      carica()
    }
  }

  async function eliminaMovimento(m) {
    // Gli incassi Sadiki (sezione tolta a ottobre 2026) restano movimenti
    // normali: si eliminano da qui come gli altri.
    if (!confirm('Eliminare questo movimento? Il saldo verrà ricalcolato.')) return
    const { error } = await esegui(supabase.from('movimenti_cassa').delete().eq('id', m.id), toast, 'l\'eliminazione del movimento')
    if (!error) {
      toast.success('Movimento eliminato.')
      carica()
    }
  }

  async function salvaModificaMovimento(e) {
    e.preventDefault()
    const payload = {}
    if (editMovimento.tipo === 'prelievo_pos') {
      payload.importo_pos = Number(editMovimento.importo_pos)
      payload.note = editMovimento.note || null
      payload.data = editMovimento.data
    } else if (editMovimento.tipo === 'versamento') {
      payload.importo_a = Number(editMovimento.importo_a)
      payload.note = editMovimento.note || null
      payload.data = editMovimento.data
    } else if (editMovimento.tipo === 'cambio_valuta') {
      payload.importo_da = Number(editMovimento.importo_da)
      payload.importo_a = Number(editMovimento.importo_a)
      payload.note = editMovimento.note || null
      payload.data = editMovimento.data
    }
    const { error } = await esegui(supabase.from('movimenti_cassa').update(payload).eq('id', editMovimento.id), toast, 'il salvataggio delle modifiche')
    if (!error) { toast.success('Movimento modificato.'); setEditMovimento(null); carica() }
  }

  async function salvaVersamento(e) {
    e.preventDefault()
    setSalvandoVersamento(true)
    const isPOS = versamentoForm.valuta === 'EGP_POS'
    const { error } = await esegui(
      supabase.from('movimenti_cassa').insert({
        tipo: 'versamento',
        data: oggi(),
        valuta_a: isPOS ? 'EGP' : versamentoForm.valuta,
        importo_a: isPOS ? 0 : Number(versamentoForm.importo),
        importo_pos: isPOS ? Number(versamentoForm.importo) : 0,
        note: (versamentoForm.note || (isPOS ? 'Versamento saldo POS iniziale' : null)),
        inserito_da: profile.id,
      }),
      toast, 'il salvataggio del versamento'
    )
    setSalvandoVersamento(false)
    if (!error) {
      toast.success('Versamento registrato.')
      setVersamentoForm({ valuta: 'EUR', importo: '', note: '' })
      carica()
    }
  }

  async function chiudiPeriodo() {
    setChiudendo(true)
    const { error } = await esegui(
      supabase.rpc('chiudi_periodo_cassa', {
        p_note: noteChiusura || null,
        p_chiuso_da: profile.id,
        p_data_inizio: chiusuraDa || null,
        p_data_fine: chiusuraA || null,
      }),
      toast, 'la chiusura del periodo'
    )
    setChiudendo(false)
    if (!error) {
      toast.success('Periodo chiuso correttamente.')
      setMostraConfermaChiusura(false)
      setNoteChiusura('')
      setChiusuraDa('')
      setChiusuraA('')
      carica()
    }
  }

  async function annullaChiusura(id) {
    const quale = id ? 'questo periodo' : 'l\'ultima chiusura'
    if (!confirm(
      `Annullare ${quale}?\n\n` +
      'Il periodo tornerà aperto e modificabile, e tutto quello che hai registrato dopo la chiusura ' +
      'rientrerà in questo periodo. Non viene perso nessun dato.'
    )) return
    setRiaprendo(true)
    const { error } = await esegui(
      supabase.rpc('annulla_chiusura_cassa', { p_periodo_id: id || null }),
      toast, 'l\'annullamento della chiusura'
    )
    setRiaprendo(false)
    if (!error) {
      toast.success('Chiusura annullata: il periodo è di nuovo aperto e modificabile.')
      carica()
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
          <p className="page-subtitle">
            Saldo del periodo in corso{periodoAperto ? ` (${etichettaPeriodo(periodoAperto)})` : ''}, da confrontare con quanto ha in mano il direttore.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="btn btn-ghost" to="/archivio">📁 Archivio periodi</Link>
          {isMaster && (
            <button className="btn btn-primary" onClick={() => setMostraConfermaChiusura(true)}>
              🔒 Chiudi periodo
            </button>
          )}
        </div>
      </div>

      {isMaster && storicoPeriodi.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--ambra, #d99a2b)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Hai chiuso un periodo per sbaglio?</div>
              <div style={{ fontSize: 12.5, color: 'var(--inchiostro-soft)', marginTop: 3 }}>
                Puoi tornare indietro: il periodo torna aperto e modificabile, senza perdere niente.
              </div>
            </div>
            <button className="btn btn-ghost" disabled={riaprendo} onClick={() => annullaChiusura(null)}>
              {riaprendo ? 'Attendi…' : '↩ Annulla ultima chiusura'}
            </button>
          </div>
        </div>
      )}

      {mostraConfermaChiusura && saldo && (
        <div className="card" style={{ marginBottom: 24, borderLeft: '3px solid var(--corallo)' }}>
          <h3 style={{ fontSize: 15, marginBottom: 10, color: 'var(--corallo)' }}>Conferma chiusura periodo</h3>
          <p style={{ fontSize: 13, color: 'var(--inchiostro-soft)', marginBottom: 14 }}>
            Il periodo viene chiuso e messo in <strong>Archivio</strong> con il suo riepilogo, e da qui in poi cassa, incassi, uscite e movimenti ripartono da 0 in un periodo nuovo.
            Non si cancella niente: dall'Archivio puoi riaprire la cartella del periodo, controllarlo e correggere le voci.
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
          <div style={{ background: 'var(--sabbia-chiara)', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>Periodo da chiudere (facoltativo)</div>
            <p style={{ fontSize: 12.5, color: 'var(--inchiostro-soft)', marginTop: 0, marginBottom: 10 }}>
              Se lasci vuoto, viene chiuso tutto quello che c'è in cassa adesso. Se indichi le date, resta chiuso solo ciò che rientra in quei giorni: il resto passa al periodo nuovo.
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
            {(chiusuraDa || chiusuraA) && (
              <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)', marginTop: 8 }}>
                ⚠️ Il saldo qui sopra si riferisce a tutto il periodo aperto. Dopo la chiusura, la fotografia salvata conterrà solo i giorni scelti.
              </div>
            )}
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

        {/* ── Versamento in cassa ── */}
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 4, fontFamily: 'var(--font-body)', fontWeight: 700 }}>💰 Versamento in cassa</h3>
          <p style={{ fontSize: 13, color: 'var(--inchiostro-soft)', marginBottom: 16 }}>
            Aggiungi liquidità (fondo iniziale, soldi dei soci, ecc.) senza contarla come incasso.
          </p>
          <form onSubmit={salvaVersamento}>
            <div className="field">
              <label>Dove entra</label>
              <select value={versamentoForm.valuta} onChange={(e) => setVersamentoForm((f) => ({ ...f, valuta: e.target.value }))}>
                <option value="EUR">Contanti Euro (€)</option>
                <option value="EGP">Contanti Lire (LE)</option>
                <option value="EGP_POS">Saldo POS (LE)</option>
                <option value="USD">Contanti Dollari ($)</option>
              </select>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Importo</label>
              <input type="number" step="0.01" min="0.01" value={versamentoForm.importo} onChange={(e) => setVersamentoForm((f) => ({ ...f, importo: e.target.value }))} placeholder="0.00" required />
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Note (es. "Fondo cassa luglio", "Saldo POS iniziale")</label>
              <input type="text" value={versamentoForm.note} onChange={(e) => setVersamentoForm((f) => ({ ...f, note: e.target.value }))} placeholder="opzionale" />
            </div>
            <button type="submit" className="btn btn-accent btn-sm" style={{ marginTop: 14 }} disabled={salvandoVersamento}>
              {salvandoVersamento ? 'Salvataggio…' : 'Aggiungi versamento'}
            </button>
          </form>
        </div>

      </div>

      <h3 style={{ fontSize: 16, marginBottom: 14, color: 'var(--notte)' }}>Movimenti del periodo</h3>
      {movimenti.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-title">Nessun movimento in questo periodo</div>
          <p>Cambi valuta, prelievi POS e versamenti appariranno qui.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {movimenti.map((m) => {
            const tipoLabel = m.tipo === 'cambio_valuta' ? 'Cambio valuta' :
              m.tipo === 'incasso_b2b' ? 'Incasso Sadiki' :
              m.tipo === 'versamento' ? '💰 Versamento' : 'Prelievo POS'

            const dettaglio = m.tipo === 'cambio_valuta'
              ? `${VALUTE[m.valuta_da]} ${Number(m.importo_da).toFixed(2)} → ${VALUTE[m.valuta_a]} ${Number(m.importo_a).toFixed(2)}`
              : m.tipo === 'incasso_b2b'
              ? `+ ${VALUTE[m.valuta_a]} ${Number(m.importo_a).toFixed(2)}`
              : m.tipo === 'versamento'
              ? `+ ${m.importo_pos > 0 ? `${Number(m.importo_pos).toFixed(0)} LE (POS)` : `${VALUTE[m.valuta_a]} ${Number(m.importo_a).toFixed(2)}`}`
              : `${Number(m.importo_pos).toFixed(2)} LE da POS a contanti`

            return (
              <React.Fragment key={m.id}>
                <div className="card" style={{ padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                    <div>
                      <span className="tag" style={{ marginBottom: 6, display: 'inline-block' }}>{tipoLabel}</span>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{dettaglio}</div>
                      {m.note && <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)', marginTop: 3 }}>{m.note}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--inchiostro-soft)' }}>
                        {new Date(m.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)', marginTop: 2 }}>
                        {m.profiles?.nome || '—'}
                      </div>
                    </div>
                  </div>

                  {isMaster && (
                    <div style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: '1px solid var(--linea)' }}>
                      {m.tipo !== 'incasso_b2b' && (
                        <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setEditMovimento({
                          id: m.id, tipo: m.tipo, data: m.data,
                          importo_pos: m.importo_pos || '', importo_da: m.importo_da || '',
                          importo_a: m.importo_a || '', valuta_da: m.valuta_da || '',
                          valuta_a: m.valuta_a || '', note: m.note || '',
                        })}>Modifica</button>
                      )}
                      <button className="btn btn-ghost btn-sm" style={{ flex: 1, color: 'var(--corallo)' }} onClick={() => eliminaMovimento(m)}>Elimina</button>
                    </div>
                  )}
                </div>

                {isMaster && editMovimento?.id === m.id && (
                  <div className="card" style={{ borderLeft: '3px solid var(--smeraldo)', padding: '14px' }}>
                    <form onSubmit={salvaModificaMovimento}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Data</label>
                          <input type="date" value={editMovimento.data} onChange={(e) => setEditMovimento((f) => ({ ...f, data: e.target.value }))} required />
                        </div>
                        {editMovimento.tipo === 'prelievo_pos' && (
                          <div className="field" style={{ margin: 0 }}>
                            <label>Importo LE</label>
                            <input type="number" step="0.01" value={editMovimento.importo_pos} onChange={(e) => setEditMovimento((f) => ({ ...f, importo_pos: e.target.value }))} required />
                          </div>
                        )}
                        {editMovimento.tipo === 'versamento' && (
                          <div className="field" style={{ margin: 0 }}>
                            <label>Importo ({editMovimento.valuta_a})</label>
                            <input type="number" step="0.01" value={editMovimento.importo_a} onChange={(e) => setEditMovimento((f) => ({ ...f, importo_a: e.target.value }))} required />
                          </div>
                        )}
                        {editMovimento.tipo === 'cambio_valuta' && (
                          <>
                            <div className="field" style={{ margin: 0 }}>
                              <label>Da ({editMovimento.valuta_da})</label>
                              <input type="number" step="0.01" value={editMovimento.importo_da} onChange={(e) => setEditMovimento((f) => ({ ...f, importo_da: e.target.value }))} required />
                            </div>
                            <div className="field" style={{ margin: 0 }}>
                              <label>A ({editMovimento.valuta_a})</label>
                              <input type="number" step="0.01" value={editMovimento.importo_a} onChange={(e) => setEditMovimento((f) => ({ ...f, importo_a: e.target.value }))} required />
                            </div>
                          </>
                        )}
                        <div className="field" style={{ margin: 0 }}>
                          <label>Note</label>
                          <input type="text" value={editMovimento.note} onChange={(e) => setEditMovimento((f) => ({ ...f, note: e.target.value }))} placeholder="opzionale" />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="submit" className="btn btn-accent btn-sm" style={{ flex: 1 }}>Salva</button>
                          <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setEditMovimento(null)}>Annulla</button>
                        </div>
                      </div>
                    </form>
                  </div>
                )}
              </React.Fragment>
            )
          })}
        </div>
      )}

      <ConfermaAnomalia
        messaggio={anomaliaCambio?.messaggio}
        onConferma={confermaAnomaliaCambioESalva}
        onAnnulla={() => setAnomaliaCambio(null)}
      />
    </div>
  )
}
