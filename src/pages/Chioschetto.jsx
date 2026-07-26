import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/Toast'
import { esegui, avvisaSeOffline } from '../lib/operazioni'
import { oggiLocale, confrontaStringhe } from '../lib/date'

const oggi = oggiLocale

const VUOTO = {
  data: oggi(),
  eur_contanti: '',
  bonifici: '',
  egp_pos: '',
  egp_contanti: '',
  usd_contanti: '',
  note: '',
}

export default function Chioschetto() {
  const { profile, isMaster, isViewer } = useAuth()
  const toast = useToast()
  const [righe, setRighe] = useState([])
  const [form, setForm] = useState(VUOTO)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [mostraForm, setMostraForm] = useState(!isViewer)
  const [editandoId, setEditandoId] = useState(null)
  const [tassi, setTassi] = useState({ eur_usd: 1.08, eur_egp: 60 })

  async function carica() {
    setLoading(true)
    const [{ data, error }, { data: t, error: errT }] = await Promise.all([
      esegui(
        supabase.from('incassi_chioschetto').select('*, profiles:inserito_da(nome)').order('data', { ascending: false }).limit(60),
        toast,
        'il caricamento dello storico chioschetto'
      ),
      esegui(
        supabase.from('tassi_cambio').select('*').order('created_at', { ascending: false }).limit(1),
        toast,
        'il caricamento dei tassi di cambio'
      ),
    ])
    if (!error) setRighe(data || [])
    if (!errT && t && t.length) setTassi(t[0])
    setLoading(false)
  }

  useEffect(() => {
    avvisaSeOffline(toast)
    carica()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      bonifici: r.bonifici || '',
      egp_pos: r.egp_pos || '',
      egp_contanti: r.egp_contanti || '',
      usd_contanti: r.usd_contanti || '',
      note: r.note || '',
    })
    setEditandoId(r.id)
    setMostraForm(true)
  }

  function costruisciPayload() {
    return {
      data: form.data,
      eur_contanti: Number(form.eur_contanti) || 0,
      bonifici: Number(form.bonifici) || 0,
      egp_pos: Number(form.egp_pos) || 0,
      egp_contanti: Number(form.egp_contanti) || 0,
      usd_contanti: Number(form.usd_contanti) || 0,
      note: form.note || null,
    }
  }

  async function salva(e) {
    e.preventDefault()
    setSalvando(true)
    const payload = costruisciPayload()

    const risultato = editandoId
      ? await esegui(supabase.from('incassi_chioschetto').update(payload).eq('id', editandoId), toast, 'il salvataggio delle modifiche')
      : await esegui(supabase.from('incassi_chioschetto').insert({ ...payload, inserito_da: profile.id }), toast, 'il salvataggio dell\'incasso')

    setSalvando(false)
    if (!risultato.error) {
      toast.success(editandoId ? 'Modifiche salvate.' : 'Incasso salvato.')
      annullaForm()
      carica()
    }
  }

  async function eliminaRiga(id) {
    if (!confirm('Eliminare questo incasso del chioschetto? L\'operazione non è reversibile.')) return
    const { error } = await esegui(supabase.from('incassi_chioschetto').delete().eq('id', id), toast, 'l\'eliminazione dell\'incasso')
    if (!error) {
      toast.success('Incasso eliminato.')
      carica()
    }
  }

  const puoInserire = isMaster || profile?.ruolo === 'operatore'

  const righeOrdinate = useMemo(() => {
    return [...righe].sort((a, b) => confrontaStringhe(b.created_at, a.created_at))
  }, [righe])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Chioschetto</h1>
          <p className="page-subtitle">Registra le entrate giornaliere del chioschetto, divise per valuta. Contabilità separata; i contanti confluiscono nella cassa.</p>
        </div>
        {puoInserire && (
          <button className="btn btn-primary" onClick={() => { if (mostraForm) { annullaForm() } setMostraForm((v) => !v) }}>
            {mostraForm ? 'Nascondi modulo' : '+ Nuova entrata'}
          </button>
        )}
      </div>

      {puoInserire && mostraForm && (
        <form onSubmit={salva} className="card" style={{ marginBottom: 28 }}>
          {editandoId && (
            <div style={{ marginBottom: 16, padding: '8px 14px', background: 'var(--sabbia-chiara)', borderRadius: 8, fontSize: 13.5, color: 'var(--notte)' }}>
              Stai modificando un'entrata esistente (solo Master).
            </div>
          )}
          <div className="form-grid">
            <div className="field">
              <label>Data</label>
              <input type="date" value={form.data} onChange={(e) => update('data', e.target.value)} required />
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

          <div className="field" style={{ marginTop: 16 }}>
            <label>Note (opzionale)</label>
            <textarea rows="2" value={form.note} onChange={(e) => update('note', e.target.value)} placeholder="Eventuali annotazioni sulla giornata…" />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button type="submit" className="btn btn-accent" disabled={salvando}>
              {salvando ? 'Salvataggio…' : editandoId ? 'Salva modifiche' : 'Salva entrata'}
            </button>
            {editandoId && (
              <button type="button" className="btn btn-ghost" onClick={annullaForm}>
                Annulla modifica
              </button>
            )}
          </div>
        </form>
      )}

      <h3 style={{ fontSize: 16, marginBottom: 14, color: 'var(--notte)' }}>Storico</h3>

      {loading ? (
        <p className="page-subtitle">Caricamento…</p>
      ) : righe.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-title">Nessuna entrata registrata</div>
          <p>Quando inserisci la prima entrata del chioschetto, apparirà qui.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {righeOrdinate.map((r) => {
            const eurUsdRate = Number(tassi.eur_usd) || 1
            const eurEgpRate = Number(tassi.eur_egp) || 1

            const totEUR = Number(r.eur_contanti) + Number(r.bonifici)
            const totEGP = Number(r.egp_pos) + Number(r.egp_contanti)
            const totUSD = Number(r.usd_contanti)

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
                  <div><span style={{ color: 'var(--inchiostro-soft)' }}>POS</span><br /><strong>{Number(r.egp_pos).toFixed(0)} LE</strong></div>
                  <div><span style={{ color: 'var(--inchiostro-soft)' }}>Contanti LE</span><br /><strong>{Number(r.egp_contanti).toFixed(0)} LE</strong></div>
                  <div><span style={{ color: 'var(--inchiostro-soft)' }}>Contanti $</span><br /><strong>$ {Number(r.usd_contanti).toFixed(2)}</strong></div>
                  <div><span style={{ color: 'var(--inchiostro-soft)' }}>Inserito da</span><br /><span style={{ color: 'var(--inchiostro-soft)' }}>{r.profiles?.nome || '—'}</span></div>
                </div>

                {r.note && (
                  <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)', marginTop: 8 }}>{r.note}</div>
                )}

                {/* Azioni Master */}
                {isMaster && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--linea)' }}>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => apriModificaRiga(r)}>Modifica</button>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1, color: 'var(--corallo)' }} onClick={() => eliminaRiga(r.id)}>Elimina</button>
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
