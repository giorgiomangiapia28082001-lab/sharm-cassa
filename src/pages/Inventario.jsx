import { useEffect, useMemo, useState } from 'react'
import ModuloInRiga from '../lib/ModuloInRiga'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/Toast'
import { esegui, avvisaSeOffline } from '../lib/operazioni'
import { useTassi, tassiSicuri } from '../lib/tassi'
import { oggiLocale } from '../lib/date'

// ============================================================================
// Inventario del materiale in giacenza (migrazione 35).
//
// Ogni articolo ha i suoi conteggi: la giacenza attuale è l'ultimo
// conteggio. "Fai l'inventario" mostra tutti gli articoli con una casella
// per la quantità trovata e salva i conteggi tutti insieme.
// L'inventario non tocca la cassa.
// ============================================================================

const UNITA = ['pz', 'kg', 'g', 'l', 'cl', 'conf', 'cartoni', 'bottiglie', 'lattine', 'sacchi']
const CATEGORIE_SUGGERITE = ['Materie prime', 'Bevande', 'Alcolici', 'Surgelati', 'Pulizia', 'Monouso', 'Chioschetto', 'Altro']
const SIMBOLI = { EUR: '€', EGP: 'LE', USD: '$' }

const ARTICOLO_VUOTO = {
  nome: '', categoria: '', unita: 'pz', scorta_minima: '', prezzo_unitario: '', valuta: 'EGP', note: '', quantita_iniziale: '',
}

const numero = (v) => Number(v).toLocaleString('it-IT', { maximumFractionDigits: 3 })
const giorno = (d) => new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })

export default function Inventario() {
  const { profile, isMaster, puoInserire } = useAuth()
  const toast = useToast()
  const { tassi } = useTassi()
  const [articoli, setArticoli] = useState([])
  const [conteggi, setConteggi] = useState([])
  const [loading, setLoading] = useState(true)
  const [mancaDatabase, setMancaDatabase] = useState(false)

  const [cerca, setCerca] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [soloSottoScorta, setSoloSottoScorta] = useState(false)

  const [mostraForm, setMostraForm] = useState(false)
  const [form, setForm] = useState(ARTICOLO_VUOTO)
  const [editandoId, setEditandoId] = useState(null)
  const [salvando, setSalvando] = useState(false)

  // Modalità "fai l'inventario": quantità scritte per ogni articolo
  const [inConteggio, setInConteggio] = useState(false)
  const [dataConteggio, setDataConteggio] = useState(oggiLocale())
  const [quantita, setQuantita] = useState({})

  const [storicoAperto, setStoricoAperto] = useState(null)

  async function carica() {
    setLoading(true)
    const [art, cont] = await Promise.all([
      esegui(supabase.from('inventario_articoli').select('*').eq('attivo', true).order('categoria').order('nome'), toast, 'il caricamento degli articoli', { silenzioso: true }),
      esegui(supabase.from('inventario_conteggi').select('*, profiles:inserito_da(nome)').order('data', { ascending: false }).order('created_at', { ascending: false }), toast, 'il caricamento dei conteggi', { silenzioso: true }),
    ])
    // Tabelle non ancora create (migrazione 35 non eseguita)
    const assente = [art.error, cont.error].some((e) => e && /does not exist|Could not find the table|42P01|PGRST205/i.test(`${e.code} ${e.message}`))
    setMancaDatabase(assente)
    if (!assente && (art.error || cont.error)) toast.error('Errore durante il caricamento dell\'inventario. Riprova tra poco.')
    setArticoli(art.data || [])
    setConteggi(cont.data || [])
    setLoading(false)
  }

  useEffect(() => {
    avvisaSeOffline(toast)
    carica()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Ultimo conteggio e storico per articolo
  const perArticolo = useMemo(() => {
    const mappa = {}
    conteggi.forEach((c) => {
      if (!mappa[c.articolo_id]) mappa[c.articolo_id] = []
      mappa[c.articolo_id].push(c) // già ordinati dal più recente
    })
    return mappa
  }, [conteggi])

  const { eurUsd, eurEgp } = tassiSicuri(tassi)
  const inEur = (v, valuta) => (valuta === 'EGP' ? v / eurEgp : valuta === 'USD' ? v / eurUsd : v)

  const righe = articoli.map((a) => {
    const storico = perArticolo[a.id] || []
    const ultimo = storico[0] || null
    const giacenza = ultimo ? Number(ultimo.quantita) : null
    const sottoScorta = giacenza !== null && Number(a.scorta_minima) > 0 && giacenza <= Number(a.scorta_minima)
    const valore = giacenza !== null && a.prezzo_unitario ? giacenza * Number(a.prezzo_unitario) : null
    return { a, storico, ultimo, giacenza, sottoScorta, valore }
  })

  const categorie = [...new Set(articoli.map((a) => a.categoria || 'Senza categoria'))].sort()
  const filtrate = righe
    .filter(({ a }) => !filtroCategoria || (a.categoria || 'Senza categoria') === filtroCategoria)
    .filter(({ a }) => !cerca || a.nome.toLowerCase().includes(cerca.toLowerCase()))
    .filter(({ sottoScorta }) => !soloSottoScorta || sottoScorta)
  const gruppi = {}
  filtrate.forEach((r) => {
    const cat = r.a.categoria || 'Senza categoria'
    if (!gruppi[cat]) gruppi[cat] = []
    gruppi[cat].push(r)
  })

  const nSottoScorta = righe.filter((r) => r.sottoScorta).length
  const valoreTotaleEur = righe.reduce((t, r) => t + (r.valore ? inEur(r.valore, r.a.valuta) : 0), 0)
  const ultimaData = conteggi[0]?.data

  // ── Articoli ──
  function apriNuovo() {
    setForm(ARTICOLO_VUOTO)
    setEditandoId(null)
    setMostraForm(true)
    setInConteggio(false)
  }

  function apriModifica(a) {
    setForm({
      nome: a.nome, categoria: a.categoria || '', unita: a.unita, scorta_minima: a.scorta_minima || '',
      prezzo_unitario: a.prezzo_unitario ?? '', valuta: a.valuta, note: a.note || '', quantita_iniziale: '',
    })
    setEditandoId(a.id)
    setMostraForm(false)
    setInConteggio(false)
  }

  async function salvaArticolo(e) {
    e.preventDefault()
    setSalvando(true)
    const payload = {
      nome: form.nome.trim(),
      categoria: form.categoria.trim() || null,
      unita: form.unita,
      scorta_minima: Number(form.scorta_minima) || 0,
      prezzo_unitario: form.prezzo_unitario === '' ? null : Number(form.prezzo_unitario),
      valuta: form.valuta,
      note: form.note.trim() || null,
    }
    if (editandoId) {
      const { error } = await esegui(supabase.from('inventario_articoli').update(payload).eq('id', editandoId), toast, 'il salvataggio dell\'articolo')
      setSalvando(false)
      if (error) return
      toast.success('Articolo modificato.')
    } else {
      const { data, error } = await esegui(
        supabase.from('inventario_articoli').insert({ ...payload, inserito_da: profile.id }).select().single(),
        toast, 'il salvataggio dell\'articolo'
      )
      if (!error && form.quantita_iniziale !== '') {
        await esegui(
          supabase.from('inventario_conteggi').insert({ articolo_id: data.id, quantita: Number(form.quantita_iniziale), data: oggiLocale(), inserito_da: profile.id }),
          toast, 'il salvataggio della quantità iniziale'
        )
      }
      setSalvando(false)
      if (error) return
      toast.success('Articolo aggiunto.')
    }
    setMostraForm(false)
    setEditandoId(null)
    carica()
  }

  async function togliArticolo(a) {
    if (!confirm(`Togliere "${a.nome}" dall'inventario?\n\nNon comparirà più nell'elenco, ma i suoi conteggi passati restano salvati.`)) return
    const { error } = await esegui(supabase.from('inventario_articoli').update({ attivo: false }).eq('id', a.id), toast, 'la rimozione dell\'articolo')
    if (!error) {
      toast.success('Articolo tolto dall\'inventario.')
      carica()
    }
  }

  // ── Conteggi ──
  function iniziaInventario() {
    setQuantita({})
    setDataConteggio(oggiLocale())
    setInConteggio(true)
    setMostraForm(false)
  }

  async function salvaInventario() {
    const nuovi = Object.entries(quantita)
      .filter(([, v]) => v !== '' && v !== undefined && !Number.isNaN(Number(v)))
      .map(([articolo_id, v]) => ({ articolo_id, quantita: Number(v), data: dataConteggio, inserito_da: profile.id }))
    if (nuovi.length === 0) {
      toast.warning('Non hai scritto nessuna quantità.')
      return
    }
    if (nuovi.some((n) => n.quantita < 0)) {
      toast.warning('Le quantità non possono essere negative.')
      return
    }
    setSalvando(true)
    const { error } = await esegui(supabase.from('inventario_conteggi').insert(nuovi), toast, 'il salvataggio dell\'inventario')
    setSalvando(false)
    if (!error) {
      toast.success(nuovi.length === 1 ? '1 articolo contato.' : `${nuovi.length} articoli contati.`)
      setInConteggio(false)
      setQuantita({})
      carica()
    }
  }

  async function eliminaConteggio(c) {
    if (!confirm(`Eliminare il conteggio del ${giorno(c.data)} (${numero(c.quantita)})?`)) return
    const { error } = await esegui(supabase.from('inventario_conteggi').delete().eq('id', c.id), toast, 'l\'eliminazione del conteggio')
    if (!error) {
      toast.success('Conteggio eliminato.')
      carica()
    }
  }

  const contatiOra = Object.values(quantita).filter((v) => v !== '' && v !== undefined).length

  if (!loading && mancaDatabase) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">Inventario</h1></div>
        <div className="empty-state card">
          <div className="empty-state-title">L'inventario non è ancora attivo</div>
          <p>Manca la parte del database (migrazione 35). Va eseguita prima di usare questa sezione.</p>
        </div>
      </div>
    )
  }

  const moduloArticolo = (
    <form onSubmit={salvaArticolo} className={editandoId ? undefined : 'card'} style={editandoId ? undefined : { marginBottom: 22 }}>
      <h3 style={{ fontSize: 15, marginBottom: 14, fontFamily: 'var(--font-body)', fontWeight: 700 }}>
        {editandoId ? 'Modifica articolo' : 'Nuovo articolo'}
      </h3>
      <div className="form-grid">
        <div className="field" style={{ gridColumn: 'span 2' }}>
          <label>Nome</label>
          <input type="text" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="es. Olio di semi, Coca Cola 33cl…" required />
        </div>
        <div className="field">
          <label>Categoria</label>
          <input type="text" list="categorie-inventario" value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} placeholder="es. Bevande" />
          <datalist id="categorie-inventario">
            {[...new Set([...categorie.filter((c) => c !== 'Senza categoria'), ...CATEGORIE_SUGGERITE])].map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div className="field">
          <label>Unità di misura</label>
          <select value={form.unita} onChange={(e) => setForm((f) => ({ ...f, unita: e.target.value }))}>
            {UNITA.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Scorta minima (avviso sotto questa quantità)</label>
          <input type="number" step="any" min="0" inputMode="decimal" value={form.scorta_minima} onChange={(e) => setForm((f) => ({ ...f, scorta_minima: e.target.value }))} placeholder="0" />
        </div>
        <div className="field">
          <label>Prezzo per unità (facoltativo)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" step="any" min="0" inputMode="decimal" value={form.prezzo_unitario} onChange={(e) => setForm((f) => ({ ...f, prezzo_unitario: e.target.value }))} placeholder="0" style={{ flex: 1 }} />
            <select value={form.valuta} onChange={(e) => setForm((f) => ({ ...f, valuta: e.target.value }))} style={{ width: 78, flex: '0 0 auto' }}>
              <option value="EGP">LE</option>
              <option value="EUR">€</option>
              <option value="USD">$</option>
            </select>
          </div>
        </div>
        {!editandoId && (
          <div className="field">
            <label>Quantità che c'è adesso (facoltativo)</label>
            <input type="number" step="any" min="0" inputMode="decimal" value={form.quantita_iniziale} onChange={(e) => setForm((f) => ({ ...f, quantita_iniziale: e.target.value }))} placeholder="da contare" />
          </div>
        )}
        <div className="field" style={{ gridColumn: 'span 2' }}>
          <label>Note (facoltativo)</label>
          <input type="text" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="es. fornitore, dove si trova…" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-accent" disabled={salvando}>{salvando ? 'Salvataggio…' : editandoId ? 'Salva modifiche' : 'Aggiungi articolo'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => { setMostraForm(false); setEditandoId(null) }}>Annulla</button>
      </div>
    </form>
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventario</h1>
          <p className="page-subtitle">Quanto materiale c'è in magazzino. Conta gli articoli quando vuoi: la giacenza è l'ultimo conteggio.</p>
        </div>
        {puoInserire && !inConteggio && (
          <div className="azioni-pagina">
            <button className="btn btn-primary" onClick={iniziaInventario} disabled={articoli.length === 0}>📝 Fai l'inventario</button>
            <button className="btn btn-ghost" onClick={() => (mostraForm ? setMostraForm(false) : apriNuovo())}>
              {mostraForm ? 'Annulla' : '+ Nuovo articolo'}
            </button>
          </div>
        )}
      </div>

      {/* ── NUOVO / MODIFICA ARTICOLO ── */}
      {mostraForm && !editandoId && moduloArticolo}

      {/* ── MODALITÀ INVENTARIO ── */}
      {inConteggio && (
        <div className="card" style={{ marginBottom: 22, borderLeft: '4px solid var(--notte)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <h3 style={{ fontSize: 16, fontFamily: 'var(--font-body)', fontWeight: 700 }}>📝 Inventario in corso</h3>
              <p style={{ fontSize: 13, color: 'var(--inchiostro-soft)', margin: '4px 0 0' }}>
                Scrivi quanto trovi di ogni articolo. Quelli lasciati vuoti non cambiano.
              </p>
            </div>
            <div className="field" style={{ minWidth: 160 }}>
              <label>Data dell'inventario</label>
              <input type="date" value={dataConteggio} onChange={(e) => setDataConteggio(e.target.value)} />
            </div>
          </div>

          {Object.entries(
            articoli.reduce((g, a) => { const c = a.categoria || 'Senza categoria'; (g[c] = g[c] || []).push(a); return g }, {})
          ).map(([cat, lista]) => (
            <div key={cat} style={{ marginBottom: 14 }}>
              <div className="inventario-categoria">{cat}</div>
              {lista.map((a) => {
                const ultimo = perArticolo[a.id]?.[0]
                return (
                  <label key={a.id} className="inventario-riga-conta">
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block' }}>{a.nome}</strong>
                      <span style={{ fontSize: 12.5, color: 'var(--inchiostro-soft)' }}>
                        {ultimo ? `ultima volta: ${numero(ultimo.quantita)} ${a.unita} (${giorno(ultimo.data)})` : 'mai contato'}
                      </span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <input
                        type="number" step="any" min="0" inputMode="decimal"
                        value={quantita[a.id] ?? ''}
                        onChange={(e) => setQuantita((q) => ({ ...q, [a.id]: e.target.value }))}
                        placeholder={ultimo ? numero(ultimo.quantita) : '—'}
                        className="inventario-input"
                      />
                      <span style={{ fontSize: 13, color: 'var(--inchiostro-soft)', width: 54 }}>{a.unita}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          ))}

          <div className="inventario-barra-salva">
            <span style={{ fontSize: 13.5 }}><strong>{contatiOra}</strong> di {articoli.length} contati</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => { if (contatiOra === 0 || confirm('Uscire senza salvare le quantità scritte?')) setInConteggio(false) }}>Annulla</button>
              <button className="btn btn-accent" onClick={salvaInventario} disabled={salvando || contatiOra === 0}>{salvando ? 'Salvataggio…' : 'Salva inventario'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── RIEPILOGO ── */}
      {!inConteggio && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Articoli</div>
              <div className="stat-value">{articoli.length}</div>
            </div>
            <div className="stat-card" style={{ cursor: nSottoScorta ? 'pointer' : 'default' }} onClick={() => nSottoScorta && setSoloSottoScorta((v) => !v)}>
              <div className="stat-label">Sotto scorta</div>
              <div className={`stat-value ${nSottoScorta ? 'negativo' : ''}`}>{nSottoScorta}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Valore stimato (≈ EUR)</div>
              <div className="stat-value">€ {valoreTotaleEur.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Ultimo conteggio</div>
              <div className="stat-value" style={{ fontSize: 18 }}>{ultimaData ? giorno(ultimaData) : '—'}</div>
            </div>
          </div>

          {articoli.length > 0 && (
            <div className="azioni-pagina" style={{ marginBottom: 16 }}>
              <input type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca articolo…" style={{ padding: '9px 12px', borderRadius: 6, border: '1px solid var(--linea)', flex: '1 1 180px' }} />
              <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={{ padding: '9px 12px', borderRadius: 6, border: '1px solid var(--linea)', background: '#fff' }}>
                <option value="">Tutte le categorie</option>
                {categorie.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {nSottoScorta > 0 && (
                <button className={`btn ${soloSottoScorta ? 'btn-accent' : 'btn-ghost'} btn-sm`} onClick={() => setSoloSottoScorta((v) => !v)}>
                  {soloSottoScorta ? '✕ Tutti gli articoli' : `⚠ Solo sotto scorta (${nSottoScorta})`}
                </button>
              )}
            </div>
          )}

          {loading ? (
            <p className="page-subtitle">Caricamento…</p>
          ) : articoli.length === 0 ? (
            <div className="empty-state card">
              <div className="empty-state-title">Nessun articolo in inventario</div>
              <p>{puoInserire ? 'Aggiungi gli articoli che tieni in magazzino con "+ Nuovo articolo", poi usa "Fai l\'inventario" per contarli.' : 'Non ci sono ancora articoli.'}</p>
            </div>
          ) : filtrate.length === 0 ? (
            <div className="empty-state card">
              <div className="empty-state-title">Nessun articolo trovato</div>
              <p>Nessun articolo corrisponde alla ricerca.</p>
            </div>
          ) : (
            Object.entries(gruppi).map(([cat, lista]) => (
              <div key={cat} style={{ marginBottom: 18 }}>
                <div className="inventario-categoria">{cat} · {lista.length}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
                  {lista.map(({ a, storico, ultimo, giacenza, sottoScorta, valore }) => (
                    <div key={a.id} className="card" style={{ padding: '12px 14px', borderLeft: sottoScorta ? '4px solid var(--corallo)' : undefined }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{a.nome}</div>
                          <div style={{ fontSize: 12.5, color: 'var(--inchiostro-soft)', marginTop: 2 }}>
                            {ultimo ? `contato il ${giorno(ultimo.data)}` : 'mai contato'}
                            {Number(a.scorta_minima) > 0 && ` · scorta minima ${numero(a.scorta_minima)} ${a.unita}`}
                          </div>
                          {a.note && <div style={{ fontSize: 12.5, marginTop: 2 }}>{a.note}</div>}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-display)', color: sottoScorta ? 'var(--corallo)' : 'var(--notte)' }}>
                            {giacenza === null ? '—' : numero(giacenza)} <span style={{ fontSize: 13, fontWeight: 600 }}>{a.unita}</span>
                          </div>
                          {sottoScorta && <div style={{ fontSize: 12, color: 'var(--corallo)', fontWeight: 700 }}>⚠ sotto scorta</div>}
                          {valore !== null && <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)' }}>{SIMBOLI[a.valuta]} {numero(Math.round(valore))}</div>}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--linea)' }}>
                        <button className="btn btn-ghost btn-sm" style={{ flex: '1 1 auto' }} onClick={() => setStoricoAperto(storicoAperto === a.id ? null : a.id)}>
                          {storicoAperto === a.id ? '▲ Chiudi storico' : `▼ Storico (${storico.length})`}
                        </button>
                        {isMaster && <button className="btn btn-ghost btn-sm" style={{ flex: '1 1 auto' }} onClick={() => apriModifica(a)}>Modifica</button>}
                        {isMaster && <button className="btn btn-ghost btn-sm" style={{ flex: '1 1 auto', color: 'var(--corallo)' }} onClick={() => togliArticolo(a)}>Togli</button>}
                      </div>

                      {editandoId === a.id && <ModuloInRiga>{moduloArticolo}</ModuloInRiga>}

                      {storicoAperto === a.id && (
                        <div style={{ marginTop: 10 }}>
                          {storico.length === 0 ? (
                            <p style={{ fontSize: 13, color: 'var(--inchiostro-soft)', margin: 0 }}>Nessun conteggio ancora.</p>
                          ) : storico.map((c, i) => {
                            const prima = storico[i + 1]
                            const diff = prima ? Number(c.quantita) - Number(prima.quantita) : null
                            return (
                              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--linea)' }}>
                                <span style={{ color: 'var(--inchiostro-soft)', minWidth: 0 }}>
                                  {giorno(c.data)}{c.profiles?.nome ? ` · ${c.profiles.nome}` : ''}
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                  <strong>{numero(c.quantita)} {a.unita}</strong>
                                  {diff !== null && diff !== 0 && (
                                    <span style={{ fontSize: 12, color: diff < 0 ? 'var(--corallo)' : 'var(--smeraldo)' }}>{diff > 0 ? '+' : ''}{numero(diff)}</span>
                                  )}
                                  {isMaster && (
                                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--corallo)', padding: '4px 10px' }} onClick={() => eliminaConteggio(c)} aria-label="Elimina conteggio">✕</button>
                                  )}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  )
}
