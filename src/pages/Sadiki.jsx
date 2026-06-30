import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { oggiLocale, primoGiornoMeseLocale } from '../lib/date'

const oggi = oggiLocale
const inizioMese = primoGiornoMeseLocale

const fmt = (n) => Number(n || 0).toFixed(2)
const fmtKg = (n) => Number(n || 0).toFixed(3).replace('.', ',')

export default function Sadiki() {
  const { profile, isMaster } = useAuth()
  const puoInserire = isMaster || profile?.ruolo === 'operatore'

  const [clienti, setClienti] = useState([])
  const [clienteId, setClienteId] = useState(null)

  const [produzioni, setProduzioni] = useState([])
  const [pagamenti, setPagamenti] = useState([])
  const [loading, setLoading] = useState(true)

  // filtro date
  const [dataInizio, setDataInizio] = useState(inizioMese())
  const [dataFine, setDataFine] = useState(oggi())

  // form nuova produzione
  const [mostraFormProd, setMostraFormProd] = useState(false)
  const [salvandoProd, setSalvandoProd] = useState(false)
  const VUOTO_PROD = { data: oggi(), prodotto: '', kg: '', prezzo_kg_eur: '', note: '', foto: null }
  const [formProd, setFormProd] = useState(VUOTO_PROD)
  const [editandoProdId, setEditandoProdId] = useState(null)
  const fileRef = useRef(null)

  // form nuovo pagamento
  const [mostraFormPag, setMostraFormPag] = useState(false)
  const [salvandoPag, setSalvandoPag] = useState(false)
  const VUOTO_PAG = { data_pagamento: oggi(), importo_eur: '', data_da: dataInizio, data_a: oggi(), note: '' }
  const [formPag, setFormPag] = useState(VUOTO_PAG)

  // ──────────────────────────────────────────────
  // Caricamento dati
  // ──────────────────────────────────────────────
  async function caricaClienti() {
    const { data } = await supabase.from('clienti_b2b').select('*').eq('attivo', true).order('nome')
    setClienti(data || [])
    if (!clienteId && data && data.length > 0) setClienteId(data[0].id)
  }

  async function carica() {
    if (!clienteId) return
    setLoading(true)
    const [{ data: prod }, { data: pag }] = await Promise.all([
      supabase.from('produzioni_b2b')
        .select('*')
        .eq('cliente_id', clienteId)
        .gte('data', dataInizio)
        .lte('data', dataFine)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('pagamenti_b2b')
        .select('*')
        .eq('cliente_id', clienteId)
        .gte('data_pagamento', dataInizio)
        .lte('data_pagamento', dataFine)
        .order('data_pagamento', { ascending: false }),
    ])
    setProduzioni(prod || [])
    setPagamenti(pag || [])
    setLoading(false)
  }

  useEffect(() => { caricaClienti() }, [])
  useEffect(() => { carica() }, [clienteId, dataInizio, dataFine])

  // ──────────────────────────────────────────────
  // Totali
  // ──────────────────────────────────────────────
  const totaleDebito = produzioni.reduce((acc, p) => acc + Number(p.kg) * Number(p.prezzo_kg_eur), 0)
  const totalePagato = pagamenti.reduce((acc, p) => acc + Number(p.importo_eur), 0)
  const saldoAperto = totaleDebito - totalePagato

  // ──────────────────────────────────────────────
  // Produzione — CRUD
  // ──────────────────────────────────────────────
  async function salvaProduzione(e) {
    e.preventDefault()
    setSalvandoProd(true)

    let foto_url = editandoProdId
      ? produzioni.find((p) => p.id === editandoProdId)?.foto_url || null
      : null

    // Upload foto se presente
    if (formProd.foto) {
      const ext = formProd.foto.name.split('.').pop()
      const path = `b2b/${clienteId}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('foto').upload(path, formProd.foto)
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('foto').getPublicUrl(path)
        foto_url = urlData.publicUrl
      }
    }

    const payload = {
      cliente_id: clienteId,
      data: formProd.data,
      prodotto: formProd.prodotto,
      kg: Number(formProd.kg),
      prezzo_kg_eur: Number(formProd.prezzo_kg_eur),
      note: formProd.note || null,
      foto_url,
      inserito_da: profile.id,
    }

    let error
    if (editandoProdId) {
      const res = await supabase.from('produzioni_b2b').update(payload).eq('id', editandoProdId)
      error = res.error
    } else {
      const res = await supabase.from('produzioni_b2b').insert(payload)
      error = res.error
    }

    setSalvandoProd(false)
    if (!error) {
      setFormProd(VUOTO_PROD)
      setEditandoProdId(null)
      setMostraFormProd(false)
      carica()
    } else {
      alert('Errore: ' + error.message)
    }
  }

  function apriModificaProd(p) {
    setFormProd({
      data: p.data,
      prodotto: p.prodotto,
      kg: p.kg,
      prezzo_kg_eur: p.prezzo_kg_eur,
      note: p.note || '',
      foto: null,
    })
    setEditandoProdId(p.id)
    setMostraFormProd(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function eliminaProduzione(id) {
    if (!confirm('Eliminare questa produzione?')) return
    const { error } = await supabase.from('produzioni_b2b').delete().eq('id', id)
    if (!error) carica()
    else alert('Errore: ' + error.message)
  }

  // ──────────────────────────────────────────────
  // Pagamento — CRUD
  // ──────────────────────────────────────────────
  async function salvaPagamento(e) {
    e.preventDefault()
    setSalvandoPag(true)

    const payload = {
      cliente_id: clienteId,
      data_pagamento: formPag.data_pagamento,
      importo_eur: Number(formPag.importo_eur),
      data_da: formPag.data_da || null,
      data_a: formPag.data_a || null,
      note: formPag.note || null,
      inserito_da: profile.id,
    }

    const { error } = await supabase.from('pagamenti_b2b').insert(payload)
    setSalvandoPag(false)
    if (!error) {
      setFormPag({ ...VUOTO_PAG, data_da: dataInizio, data_a: oggi() })
      setMostraFormPag(false)
      carica()
    } else {
      alert('Errore: ' + error.message)
    }
  }

  async function eliminaPagamento(id) {
    if (!confirm('Eliminare questo pagamento? Verrà rimosso anche dalla Cassa.')) return
    const { error } = await supabase.from('pagamenti_b2b').delete().eq('id', id)
    if (!error) carica()
    else alert('Errore: ' + error.message)
  }

  // ──────────────────────────────────────────────
  // Raggruppamento produzioni per data
  // ──────────────────────────────────────────────
  const prodPerData = produzioni.reduce((acc, p) => {
    if (!acc[p.data]) acc[p.data] = []
    acc[p.data].push(p)
    return acc
  }, {})
  const dateOrdinate = Object.keys(prodPerData).sort((a, b) => b.localeCompare(a))

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Sadiki</h1>
          <p className="page-subtitle">Vendita prodotti al kg — produzioni giornaliere e pagamenti ricevuti.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {puoInserire && (
            <>
              <button className="btn btn-primary" onClick={() => { setMostraFormProd((v) => !v); setEditandoProdId(null); setFormProd(VUOTO_PROD) }}>
                {mostraFormProd && !editandoProdId ? '✕ Chiudi' : '+ Nuova produzione'}
              </button>
              <button className="btn btn-accent" onClick={() => setMostraFormPag((v) => !v)}>
                {mostraFormPag ? '✕ Chiudi' : '€ Registra pagamento'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Selezione cliente (se più di uno) ── */}
      {clienti.length > 1 && (
        <div style={{ marginBottom: 20, display: 'flex', gap: 8 }}>
          {clienti.map((c) => (
            <button
              key={c.id}
              className={`btn ${clienteId === c.id ? 'btn-accent' : 'btn-ghost'}`}
              onClick={() => setClienteId(c.id)}
            >
              {c.nome}
            </button>
          ))}
        </div>
      )}

      {/* ── Filtro date ── */}
      <div className="card" style={{ marginBottom: 24, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0 }}>
          <label>Dal</label>
          <input type="date" value={dataInizio} onChange={(e) => setDataInizio(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Al</label>
          <input type="date" value={dataFine} onChange={(e) => setDataFine(e.target.value)} />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setDataInizio(inizioMese()); setDataFine(oggi()) }}>
          Mese corrente
        </button>
      </div>

      {/* ── Riepilogo saldo ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 28 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Totale consegnato</div>
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--notte)' }}>€ {fmt(totaleDebito)}</div>
          <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)', marginTop: 2 }}>{produzioni.length} produzioni · {fmtKg(produzioni.reduce((a, p) => a + Number(p.kg), 0))} kg tot.</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Già pagato</div>
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--smeraldo)' }}>€ {fmt(totalePagato)}</div>
          <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)', marginTop: 2 }}>{pagamenti.length} pagamento/i ricevuto/i</div>
        </div>
        <div className="card" style={{ textAlign: 'center', background: saldoAperto > 0.01 ? 'rgba(217,104,79,0.08)' : 'rgba(47,158,104,0.08)' }}>
          <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Saldo aperto</div>
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-display)', color: saldoAperto > 0.01 ? 'var(--corallo)' : 'var(--smeraldo)' }}>
            € {fmt(Math.abs(saldoAperto))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)', marginTop: 2 }}>
            {saldoAperto > 0.01 ? 'Da incassare' : saldoAperto < -0.01 ? 'Pagato in eccesso' : 'Tutto pagato ✓'}
          </div>
        </div>
      </div>

      {/* ── Form nuova produzione ── */}
      {mostraFormProd && puoInserire && (
        <form onSubmit={salvaProduzione} className="card" style={{ marginBottom: 28 }}>
          <h3 style={{ marginBottom: 16, fontSize: 15, color: 'var(--notte)' }}>
            {editandoProdId ? 'Modifica produzione' : 'Nuova produzione'}
          </h3>
          <div className="form-grid">
            <div className="field">
              <label>Data</label>
              <input type="date" value={formProd.data} onChange={(e) => setFormProd((f) => ({ ...f, data: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Prodotto</label>
              <input type="text" value={formProd.prodotto} onChange={(e) => setFormProd((f) => ({ ...f, prodotto: e.target.value }))} placeholder="es. Pane, Pizzette Margherita…" required />
            </div>
            <div className="field">
              <label>Kg consegnati</label>
              <input type="number" step="0.001" min="0.001" value={formProd.kg} onChange={(e) => setFormProd((f) => ({ ...f, kg: e.target.value }))} placeholder="0.000" required />
            </div>
            <div className="field">
              <label>Prezzo al kg (€)</label>
              <input type="number" step="0.01" min="0" value={formProd.prezzo_kg_eur} onChange={(e) => setFormProd((f) => ({ ...f, prezzo_kg_eur: e.target.value }))} placeholder="0.00" required />
            </div>
            <div className="field">
              <label>Note</label>
              <input type="text" value={formProd.note} onChange={(e) => setFormProd((f) => ({ ...f, note: e.target.value }))} placeholder="opzionale" />
            </div>
            <div className="field">
              <label>Foto (opzionale)</label>
              <input type="file" accept="image/*" ref={fileRef} onChange={(e) => setFormProd((f) => ({ ...f, foto: e.target.files[0] || null }))} />
            </div>
          </div>

          {formProd.kg && formProd.prezzo_kg_eur && (
            <div style={{ margin: '14px 0', padding: '10px 14px', background: 'var(--sabbia-chiara)', borderRadius: 8, fontSize: 14 }}>
              Totale questa voce: <strong>€ {fmt(Number(formProd.kg) * Number(formProd.prezzo_kg_eur))}</strong>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button type="submit" className="btn btn-accent" disabled={salvandoProd}>
              {salvandoProd ? 'Salvataggio…' : editandoProdId ? 'Salva modifiche' : 'Aggiungi produzione'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setMostraFormProd(false); setEditandoProdId(null); setFormProd(VUOTO_PROD) }}>
              Annulla
            </button>
          </div>
        </form>
      )}

      {/* ── Form nuovo pagamento ── */}
      {mostraFormPag && puoInserire && (
        <form onSubmit={salvaPagamento} className="card" style={{ marginBottom: 28, borderLeft: '3px solid var(--smeraldo)' }}>
          <h3 style={{ marginBottom: 16, fontSize: 15, color: 'var(--smeraldo)' }}>Registra pagamento ricevuto</h3>
          <p style={{ fontSize: 13, color: 'var(--inchiostro-soft)', marginBottom: 14, marginTop: 0 }}>
            I soldi entreranno automaticamente nella Cassa (EUR contanti).
          </p>
          <div className="form-grid">
            <div className="field">
              <label>Data ricezione</label>
              <input type="date" value={formPag.data_pagamento} onChange={(e) => setFormPag((f) => ({ ...f, data_pagamento: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Importo ricevuto (€)</label>
              <input type="number" step="0.01" min="0.01" value={formPag.importo_eur} onChange={(e) => setFormPag((f) => ({ ...f, importo_eur: e.target.value }))} placeholder="0.00" required />
            </div>
            <div className="field">
              <label>Periodo coperto — dal</label>
              <input type="date" value={formPag.data_da} onChange={(e) => setFormPag((f) => ({ ...f, data_da: e.target.value }))} />
            </div>
            <div className="field">
              <label>Periodo coperto — al</label>
              <input type="date" value={formPag.data_a} onChange={(e) => setFormPag((f) => ({ ...f, data_a: e.target.value }))} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Note</label>
              <input type="text" value={formPag.note} onChange={(e) => setFormPag((f) => ({ ...f, note: e.target.value }))} placeholder="opzionale" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button type="submit" className="btn btn-accent" disabled={salvandoPag}>
              {salvandoPag ? 'Registrazione…' : '€ Registra pagamento'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setMostraFormPag(false)}>Annulla</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="page-subtitle">Caricamento…</p>
      ) : produzioni.length === 0 && pagamenti.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-title">Nessuna produzione nel periodo</div>
          <p>{puoInserire ? 'Usa il pulsante in alto per registrare la prima produzione.' : 'Nessun dato inserito per questo periodo.'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 24, alignItems: 'start' }}>

          {/* ── Colonna sinistra: produzioni per data ── */}
          <div>
            <h2 style={{ fontSize: 16, marginBottom: 16, color: 'var(--notte)' }}>Produzioni</h2>
            {dateOrdinate.length === 0 ? (
              <div className="card" style={{ color: 'var(--inchiostro-soft)', fontSize: 14 }}>Nessuna produzione nel periodo.</div>
            ) : (
              dateOrdinate.map((data) => {
                const righe = prodPerData[data]
                const totGiorno = righe.reduce((a, p) => a + Number(p.kg) * Number(p.prezzo_kg_eur), 0)
                const kgGiorno = righe.reduce((a, p) => a + Number(p.kg), 0)
                return (
                  <div key={data} style={{ marginBottom: 18 }}>
                    {/* intestazione giorno */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--notte)' }}>
                        {new Date(data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--inchiostro-soft)' }}>
                        {fmtKg(kgGiorno)} kg · <strong>€ {fmt(totGiorno)}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {righe.map((p) => (
                        <div key={p.id} className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px' }}>
                          {p.foto_url && (
                            <a href={p.foto_url} target="_blank" rel="noreferrer">
                              <img src={p.foto_url} alt="foto" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                            </a>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{p.prodotto}</div>
                            <div style={{ fontSize: 13, color: 'var(--inchiostro-soft)', marginTop: 2 }}>
                              {fmtKg(p.kg)} kg × € {fmt(p.prezzo_kg_eur)}/kg
                            </div>
                            {p.note && <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)', marginTop: 3 }}>{p.note}</div>}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--notte)' }}>€ {fmt(Number(p.kg) * Number(p.prezzo_kg_eur))}</div>
                            {isMaster && (
                              <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => apriModificaProd(p)}>Modifica</button>
                                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--corallo)' }} onClick={() => eliminaProduzione(p.id)}>Elimina</button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* ── Colonna destra: pagamenti ricevuti ── */}
          <div>
            <h2 style={{ fontSize: 16, marginBottom: 16, color: 'var(--notte)' }}>Pagamenti ricevuti</h2>
            {pagamenti.length === 0 ? (
              <div className="card" style={{ color: 'var(--inchiostro-soft)', fontSize: 14 }}>Nessun pagamento nel periodo.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pagamenti.map((p) => (
                  <div key={p.id} className="card" style={{ borderLeft: '3px solid var(--smeraldo)', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--smeraldo)' }}>€ {fmt(p.importo_eur)}</div>
                        <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)', marginTop: 3 }}>
                          {new Date(p.data_pagamento + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                        {(p.data_da || p.data_a) && (
                          <div style={{ fontSize: 11, color: 'var(--inchiostro-soft)', marginTop: 2 }}>
                            Copre: {p.data_da ? new Date(p.data_da + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '?'}
                            {' → '}
                            {p.data_a ? new Date(p.data_a + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '?'}
                          </div>
                        )}
                        {p.note && <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)', marginTop: 3 }}>{p.note}</div>}
                      </div>
                      {isMaster && (
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--corallo)', marginLeft: 8 }} onClick={() => eliminaPagamento(p.id)}>
                          Elimina
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
