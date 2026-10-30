import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/Toast'
import { esegui, avvisaSeOffline } from '../lib/operazioni'
import { controllaPrezzoPersona, controllaDataSerata, controllaSerata, totaleSerataEur } from '../lib/anomalie'
import ConfermaAnomalia from '../lib/ConfermaAnomalia'
import ModuloInRiga from '../lib/ModuloInRiga'
import { usePeriodoScelto, SceltaPeriodo, AvvisoArchivio, filtraPeriodo } from '../lib/periodi'

import { giornataServizio, useDataServizioAggiornata } from '../lib/date'
import { conFondoIeri, caricaFondoPrima } from '../lib/calcoli'

// Prima delle 5 del mattino si registra ancora la serata di ieri
const oggi = giornataServizio

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

// Voci confrontate con le serate precedenti per trovare gli importi insoliti
const CAMPI_INCASSI = [
  ['eur_contanti', 'Contanti €'],
  ['fondo_cassa', 'Fondo cassa €'],
  ['bonifici', 'Bonifici €'],
  ['egp_pos', 'POS (carta) LE'],
  ['egp_contanti', 'Contanti LE'],
  ['usd_contanti', 'Dollari $'],
  ['delivery_eur', 'Delivery €'],
  ['delivery_egp', 'Delivery LE'],
]

export default function Incassi() {
  const { profile, isMaster, isViewer, puoInserire} = useAuth()
  const toast = useToast()
  const per = usePeriodoScelto()
  const [righe, setRighe] = useState([])
  const [form, setForm] = useState(VUOTO)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [mostraForm, setMostraForm] = useState(!isViewer)
  const [editandoId, setEditandoId] = useState(null)
  const [tassi, setTassi] = useState({ eur_usd: 1.08, eur_egp: 60 })
  const [fondoPrima, setFondoPrima] = useState(0)
  // Messaggio di anomalia in attesa di conferma da parte dell'utente
  // (es. prezzo a persona fuori scala). null = nessuna anomalia in sospeso.
  const [anomalia, setAnomalia] = useState(null)

  useDataServizioAggiornata(form.data, (data) => update('data', data), !editandoId)

  async function carica() {
    setLoading(true)
    const [{ data, error }, { data: t, error: errT }, fondo] = await Promise.all([
      esegui(
        filtraPeriodo(supabase.from('incassi').select('*, profiles:inserito_da(nome)'), per.periodo).order('data', { ascending: false }),
        toast,
        'il caricamento dello storico incassi'
      ),
      esegui(
        supabase.from('tassi_cambio').select('*').order('created_at', { ascending: false }).limit(1),
        toast,
        'il caricamento dei tassi di cambio'
      ),
      caricaFondoPrima(supabase, per.periodo),
    ])
    if (!error) setRighe(data || [])
    setFondoPrima(fondo)
    if (!errT && t && t.length) setTassi(t[0])
    setLoading(false)
  }

  useEffect(() => {
    avvisaSeOffline(toast)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!per.caricato) return
    annullaForm()
    carica()
  }, [per.caricato, per.periodo?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function update(campo, valore) {
    setForm((f) => ({ ...f, [campo]: valore }))
  }

  function annullaForm() {
    setForm({ ...VUOTO, data: oggi() })
    setEditandoId(null)
  }

  function apriModificaRiga(r) {
    setForm({
      data: r.data,
      eur_contanti: r.eur_contanti || '',
      fondo_cassa: r.fondo_cassa || '',
      bonifici: r.bonifici || '',
      egp_pos: r.egp_pos || '',
      usd_contanti: r.usd_contanti || '',
      egp_contanti: r.egp_contanti || '',
      delivery_eur: r.delivery_eur || '',
      delivery_egp: r.delivery_egp || '',
      numero_persone: r.numero_persone || '',
      note: r.note || '',
    })
    setEditandoId(r.id)
  }

  function costruisciPayload() {
    return {
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
    }
  }

  async function salva(e, forzato = false) {
    e.preventDefault()

    const payload = costruisciPayload()

    // Controllo anomalia: prezzo medio a persona fuori scala (es. importi
    // in LE inseriti per errore nei campi in EUR). Se rilevata e non ancora
    // confermata dall'utente, mostriamo il dialogo e sospendiamo il salvataggio.
    if (!forzato) {
      const originale = editandoId ? righe.find((r) => r.id === editandoId) : null
      const cambiato = !originale || Number(originale.numero_persone || 0) !== payload.numero_persone ||
        CAMPI_INCASSI.some(([campo]) => Number(originale[campo] || 0) !== payload[campo])

      // Solo per una serata nuova: la data deve essere il giorno dopo
      // l'ultima serata registrata e non deve esserci già.
      setSalvando(true) // niente doppio tocco mentre si controlla la data
      const avvisi = [
        cambiato ? controllaPrezzoPersona(totaleSerataEur(payload, tassi), payload.numero_persone) : null,
        editandoId ? null : await controllaDataSerata(supabase, 'incassi', payload.data),
        ...(cambiato ? await controllaSerata(supabase, 'incassi', payload, CAMPI_INCASSI, tassi, editandoId) : []),
      ].filter(Boolean)
      if (avvisi.length) {
        setSalvando(false)
        setAnomalia({ messaggio: avvisi.join('\n\n'), e })
        return
      }
    }

    setSalvando(true)

    const risultato = editandoId
      ? await esegui(supabase.from('incassi').update(payload).eq('id', editandoId), toast, 'il salvataggio delle modifiche')
      : await esegui(supabase.from('incassi').insert({ ...payload, inserito_da: profile.id }), toast, 'il salvataggio dell\'incasso')

    setSalvando(false)
    setAnomalia(null)
    if (!risultato.error) {
      toast.success(editandoId ? 'Modifiche salvate.' : 'Incasso salvato.')
      annullaForm()
      carica()
    }
  }

  function confermaAnomaliaESalva() {
    if (anomalia?.e) salva(anomalia.e, true)
  }

  async function eliminaRiga(id) {
    if (!confirm('Eliminare questo incasso? L\'operazione non è reversibile.')) return
    const { error } = await esegui(supabase.from('incassi').delete().eq('id', id), toast, 'l\'eliminazione dell\'incasso')
    if (!error) {
      toast.success('Incasso eliminato.')
      carica()
    }
  }


  // Calcolo pesante (sort + fondo cassa giorno precedente) fatto una sola
  // volta per ogni cambio di dati, invece che ad ogni render della pagina.
  const righeConFondoIeri = useMemo(() => {
    return conFondoIeri(righe, fondoPrima).reverse()
  }, [righe, fondoPrima])

  const moduloIncasso = (
    <form onSubmit={salva} className={editandoId ? undefined : 'card'} style={editandoId ? undefined : { marginBottom: 28 }}>
      {editandoId && (
        <div style={{ marginBottom: 16, padding: '8px 14px', background: 'var(--sabbia-chiara)', borderRadius: 8, fontSize: 13.5, color: 'var(--notte)' }}>
          Stai modificando un incasso esistente (solo Master).
        </div>
      )}
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

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button type="submit" className="btn btn-accent" disabled={salvando}>
          {salvando ? 'Salvataggio…' : editandoId ? 'Salva modifiche' : 'Salva incasso'}
        </button>
        {editandoId && (
          <button type="button" className="btn btn-ghost" onClick={annullaForm}>
            Annulla modifica
          </button>
        )}
      </div>
    </form>
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Incassi serata</h1>
          <p className="page-subtitle">Registra l'incasso di sala e il delivery di ogni serata, diviso per valuta.</p>
        </div>
        <div className="azioni-pagina">
          <SceltaPeriodo periodi={per.periodi} periodo={per.periodo} onChange={per.scegli} />
          {puoInserire && !per.inArchivio && (
            <button className="btn btn-primary" onClick={() => { if (mostraForm) { annullaForm() } setMostraForm((v) => !v) }}>
              {mostraForm ? 'Nascondi modulo' : '+ Nuovo incasso'}
            </button>
          )}
        </div>
      </div>

      <AvvisoArchivio periodo={per.periodo} onTornaAlCorrente={() => per.scegli(null)} />

      {puoInserire && mostraForm && !per.inArchivio && !editandoId && moduloIncasso}

      <h3 style={{ fontSize: 16, marginBottom: 14, color: 'var(--notte)' }}>Incassi del periodo</h3>

      {loading ? (
        <p className="page-subtitle">Caricamento…</p>
      ) : righe.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-title">Nessun incasso in questo periodo</div>
          <p>{per.inArchivio ? 'In questo periodo non era stato registrato nessun incasso.' : 'Quando inserisci il primo incasso del periodo, apparirà qui.'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {righeConFondoIeri.map(({ r, fondoIeri }) => {
            const eurUsdRate = Number(tassi.eur_usd) || 1
            const eurEgpRate = Number(tassi.eur_egp) || 1

            // Totali per valuta
            const totEUR = Number(r.eur_contanti) + Number(r.bonifici) + Number(r.delivery_eur || 0) - fondoIeri + Number(r.fondo_cassa)
            const totEGP = Number(r.egp_pos) + Number(r.egp_contanti) + Number(r.delivery_egp || 0)
            const totUSD = Number(r.usd_contanti)

            // Totale tutto convertito in EUR
            const totaleEur = totEUR + (totEGP / eurEgpRate) + (totUSD / eurUsdRate)

            return (
              <div key={r.id} className="card" style={{ padding: '14px' }}>

                {/* Header: data a sinistra, totale EUR a destra */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {new Date(r.data).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: 'var(--smeraldo)', fontSize: 17 }}>
                      € {totaleEur.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--inchiostro-soft)' }}>totale convertito</div>
                  </div>
                </div>

                {/* Subtotali per valuta */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {totEUR !== 0 && (
                    <div style={{ flex: '1 1 120px', background: 'var(--sabbia-chiara)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 11, color: 'var(--inchiostro-soft)', marginBottom: 2 }}>Totale EUR</div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>€ {totEUR.toFixed(2)}</div>
                    </div>
                  )}
                  {totEGP > 0 && (
                    <div style={{ flex: '1 1 120px', background: 'var(--sabbia-chiara)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 11, color: 'var(--inchiostro-soft)', marginBottom: 2 }}>Totale LE</div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{totEGP.toFixed(0)} LE</div>
                      <div style={{ fontSize: 11, color: 'var(--inchiostro-soft)' }}>≈ € {(totEGP / eurEgpRate).toFixed(2)}</div>
                    </div>
                  )}
                  {totUSD > 0 && (
                    <div style={{ flex: '1 1 120px', background: 'var(--sabbia-chiara)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 11, color: 'var(--inchiostro-soft)', marginBottom: 2 }}>Totale USD</div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>$ {totUSD.toFixed(2)}</div>
                      <div style={{ fontSize: 11, color: 'var(--inchiostro-soft)' }}>≈ € {(totUSD / eurUsdRate).toFixed(2)}</div>
                    </div>
                  )}
                </div>

                {/* Dettaglio voci */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '6px 12px', fontSize: 12, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
                  <div><span style={{ color: 'var(--inchiostro-soft)' }}>Contanti €</span><br /><strong>€ {Number(r.eur_contanti).toFixed(2)}</strong></div>
                  <div><span style={{ color: 'var(--inchiostro-soft)' }}>Bonifici</span><br /><strong>€ {Number(r.bonifici).toFixed(2)}</strong></div>
                  <div><span style={{ color: 'var(--inchiostro-soft)' }}>Delivery €</span><br /><strong>€ {Number(r.delivery_eur || 0).toFixed(2)}</strong></div>
                  <div><span style={{ color: 'var(--inchiostro-soft)' }}>POS</span><br /><strong>{Number(r.egp_pos).toFixed(0)} LE</strong></div>
                  <div><span style={{ color: 'var(--inchiostro-soft)' }}>Contanti LE</span><br /><strong>{Number(r.egp_contanti).toFixed(0)} LE</strong></div>
                  <div><span style={{ color: 'var(--inchiostro-soft)' }}>Delivery LE</span><br /><strong>{Number(r.delivery_egp || 0).toFixed(0)} LE</strong></div>
                  <div><span style={{ color: 'var(--inchiostro-soft)' }}>Contanti $</span><br /><strong>$ {Number(r.usd_contanti).toFixed(2)}</strong></div>
                  {fondoIeri > 0 && <div><span style={{ color: 'var(--inchiostro-soft)' }}>- Fondo ieri</span><br /><strong style={{ color: 'var(--corallo)' }}>- € {fondoIeri.toFixed(2)}</strong></div>}
                  <div><span style={{ color: 'var(--inchiostro-soft)' }}>+ Fondo oggi</span><br /><strong>€ {Number(r.fondo_cassa).toFixed(2)}</strong></div>
                  <div><span style={{ color: 'var(--inchiostro-soft)' }}>Persone</span><br /><strong>{r.numero_persone || 0}</strong></div>
                  <div><span style={{ color: 'var(--inchiostro-soft)' }}>Inserito da</span><br /><span style={{ color: 'var(--inchiostro-soft)' }}>{r.profiles?.nome || '—'}</span></div>
                </div>

                {/* Azioni Master */}
                {isMaster && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--linea)' }}>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => apriModificaRiga(r)}>Modifica</button>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1, color: 'var(--corallo)' }} onClick={() => eliminaRiga(r.id)}>Elimina</button>
                  </div>
                )}
                {editandoId === r.id && <ModuloInRiga>{moduloIncasso}</ModuloInRiga>}
              </div>
            )
          })}
        </div>
      )}

      <ConfermaAnomalia
        messaggio={anomalia?.messaggio}
        onConferma={confermaAnomaliaESalva}
        onAnnulla={() => setAnomalia(null)}
      />
    </div>
  )
}
