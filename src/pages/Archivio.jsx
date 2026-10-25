import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/Toast'
import { esegui } from '../lib/operazioni'
import { useTassi, tassiSicuri } from '../lib/tassi'
import { usePeriodoScelto, etichettaPeriodo, giornoPeriodo } from '../lib/periodi'
import { totaliIncassi, totaliChioschetto } from '../lib/calcoli'

// ============================================================================
// Archivio periodi: ogni periodo di cassa è una "cartella" con il riepilogo
// di tutto quello che è successo (entrate, uscite, movimenti di cassa,
// acconti) e i collegamenti alle pagine per controllarlo voce per voce e
// correggerlo.
// ============================================================================

const euro = (v) => `€ ${Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const lire = (v) => `${Math.round(Number(v || 0)).toLocaleString('it-IT')} LE`
const dollari = (v) => `$ ${Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const giorno = giornoPeriodo

const TIPI_MOVIMENTO = {
  cambio_valuta: 'Cambi valuta',
  prelievo_pos: 'Scarichi POS → contanti',
  versamento: 'Versamenti in cassa',
  incasso_b2b: 'Incassi Sadiki',
  rettifica: 'Rettifiche cassa (conteggio reale)',
}

function Riga({ etichetta, valore, colore }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--linea)', fontSize: 13.5 }}>
      <span style={{ color: 'var(--inchiostro-soft)' }}>{etichetta}</span>
      <strong style={{ color: colore, whiteSpace: 'nowrap' }}>{valore}</strong>
    </div>
  )
}

function Sezione({ titolo, children, azione }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, margin: 0, fontFamily: 'var(--font-body)', fontWeight: 700, color: 'var(--notte)' }}>{titolo}</h3>
        {azione}
      </div>
      {children}
    </div>
  )
}

export default function Archivio() {
  const toast = useToast()
  const { tassi } = useTassi()
  const per = usePeriodoScelto()
  const [params, setParams] = useSearchParams()
  const [dati, setDati] = useState(null)
  const [loading, setLoading] = useState(false)
  // Sul telefono la cartella aperta sta sotto l'elenco: dopo un tocco su una
  // cartella, appena il riepilogo è pronto ci portiamo lì.
  const scorriAllaCartella = useRef(false)

  // In Archivio, se nessuno ha scelto un periodo, si apre l'ultimo chiuso.
  const chiusi = per.periodi.filter((p) => p.data_chiusura)
  const scelto = params.get('periodo') ? per.periodo : (chiusi[0] || per.aperto)

  async function carica(p) {
    setLoading(true)
    const filtro = (q) => q.eq('periodo_cassa_id', p.id)
    const [inc, chio, usc, mov, acc, saldo] = await Promise.all([
      esegui(filtro(supabase.from('incassi').select('*')), toast, 'il caricamento degli incassi'),
      esegui(filtro(supabase.from('incassi_chioschetto').select('*')), toast, 'il caricamento del chioschetto'),
      esegui(filtro(supabase.from('uscite').select('*, categorie_uscite(nome)')), toast, 'il caricamento delle uscite'),
      esegui(filtro(supabase.from('movimenti_cassa').select('*')).order('data'), toast, 'il caricamento dei movimenti'),
      esegui(filtro(supabase.from('acconti').select('*')), toast, 'il caricamento degli acconti'),
      // Saldo ricalcolato dalle voci (migrazione 32). Se la funzione non c'è
      // ancora sul database, si usa la fotografia salvata alla chiusura.
      esegui(supabase.rpc('saldo_periodo_cassa', { p_periodo_id: p.id }).maybeSingle(), toast, 'il calcolo del saldo', { silenzioso: true }),
    ])
    setDati({
      incassi: inc.data || [],
      chioschetto: chio.data || [],
      uscite: usc.data || [],
      movimenti: mov.data || [],
      acconti: acc.data || [],
      saldo: saldo.error ? null : saldo.data,
    })
    setLoading(false)
  }

  useEffect(() => {
    if (scelto) carica(scelto)
  }, [scelto?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading && dati && scorriAllaCartella.current) {
      scorriAllaCartella.current = false
      document.getElementById('cartella')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [loading, dati])

  const { eurUsd, eurEgp } = tassiSicuri(tassi)
  const inEur = (importo, valuta) =>
    valuta === 'EGP' ? Number(importo) / eurEgp : valuta === 'USD' ? Number(importo) / eurUsd : Number(importo)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Archivio periodi</h1>
          <p className="page-subtitle">
            Ogni periodo chiuso ha la sua cartella con il riepilogo completo. Da qui apri incassi, uscite e chioschetto del periodo per controllarli o correggerli.
          </p>
        </div>
      </div>

      {/* ── LE CARTELLE ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 24 }}>
        {per.periodi.map((p) => {
          const attivo = scelto?.id === p.id
          return (
            <button
              key={p.id}
              onClick={() => {
                // Sempre con l'id esplicito: senza, l'Archivio apre l'ultimo
                // periodo chiuso (anche quando si tocca quello in corso).
                setParams({ periodo: p.id }, { replace: true })
                scorriAllaCartella.current = true
              }}
              className="card"
              style={{
                textAlign: 'left', cursor: 'pointer', padding: '12px 14px', font: 'inherit', color: 'inherit',
                borderColor: attivo ? 'var(--notte)' : undefined,
                boxShadow: attivo ? '0 0 0 2px var(--notte) inset' : undefined,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{p.data_chiusura ? '📁' : '📂'} Periodo {p.numero}</div>
              <div style={{ fontSize: 12.5, color: 'var(--inchiostro-soft)', marginTop: 3 }}>
                {p.data_apertura ? giorno(p.data_apertura) : '?'} – {p.data_chiusura ? giorno(p.data_chiusura) : 'in corso'}
              </div>
              {p.note && <div style={{ fontSize: 12, marginTop: 4 }}>{p.note}</div>}
            </button>
          )
        })}
      </div>

      <div id="cartella" style={{ scrollMarginTop: 12 }}>
      {!per.caricato ? (
        <p className="page-subtitle">Caricamento…</p>
      ) : !scelto ? (
        <div className="empty-state card">
          <div className="empty-state-title">Nessun periodo ancora</div>
          <p>I periodi compaiono qui quando inizi a registrare incassi e uscite.</p>
        </div>
      ) : loading || !dati ? (
        <p className="page-subtitle">Caricamento della cartella…</p>
      ) : (
        <CartellaPeriodo periodo={scelto} dati={dati} inEur={inEur} />
      )}
      </div>
    </div>
  )
}

function CartellaPeriodo({ periodo, dati, inEur }) {
  const link = (pagina) => `/${pagina}?periodo=${periodo.id}`
  const inc = totaliIncassi(dati.incassi)
  const chio = totaliChioschetto(dati.chioschetto)

  // ── Uscite per valuta, categoria e metodo ──
  const uscitePer = (filtro) => {
    const t = { EUR: 0, EGP: 0, USD: 0, inEur: 0, voci: 0 }
    dati.uscite.filter(filtro).forEach((u) => {
      t[u.valuta] = (t[u.valuta] || 0) + Number(u.importo)
      t.inEur += inEur(u.importo, u.valuta)
      t.voci++
    })
    return t
  }
  const usciteTot = uscitePer(() => true)
  const categorie = [...new Set(dati.uscite.map((u) => u.categorie_uscite?.nome || 'Altro'))]
    .map((nome) => ({ nome, ...uscitePer((u) => (u.categorie_uscite?.nome || 'Altro') === nome) }))
    .sort((a, b) => b.inEur - a.inEur)
  const metodi = ['contanti', 'pos', 'bonifico']
    .map((m) => ({ m, ...uscitePer((u) => (u.metodo_pagamento || 'contanti') === m) }))
    .filter((x) => x.voci > 0)

  // ── Movimenti di cassa per tipo ──
  const movimentiPerTipo = {}
  dati.movimenti.forEach((m) => {
    if (!movimentiPerTipo[m.tipo]) movimentiPerTipo[m.tipo] = { n: 0, righe: [] }
    const t = movimentiPerTipo[m.tipo]
    t.n++
    t.righe.push(m)
  })

  // ── Acconti ──
  const accontiEur = dati.acconti.reduce((a, x) => a + Number(x.importo_eur || 0), 0)
  const accontiEgp = dati.acconti.reduce((a, x) => a + Number(x.importo_egp || 0), 0)

  // ── Totali in euro (al cambio di oggi) ──
  const entrateRistoranteEur = inc.eurSala + inc.deliveryEur
    + inEur(inc.egpContanti + inc.egpPos + inc.deliveryEgp, 'EGP') + inEur(inc.usd, 'USD')
  const entrateChioEur = chio.eur + inEur(chio.egpContanti + chio.egpPos, 'EGP') + inEur(chio.usd, 'USD')
  const entrateEur = entrateRistoranteEur + entrateChioEur
  const nettoEur = entrateEur - usciteTot.inEur

  // ── Saldo: ricalcolato dalle voci e confronto con la fotografia ──
  const foto = periodo.data_chiusura ? periodo : null
  const saldo = dati.saldo || foto
  const campiSaldo = [
    ['contanti_eur', 'Contanti €', euro],
    ['contanti_egp', 'Contanti LE', lire],
    ['contanti_usd', 'Contanti $', dollari],
    ['saldo_pos_egp', 'Saldo POS', lire],
  ]
  const cambiatoDopo = dati.saldo && foto && campiSaldo.some(([k]) => Math.abs(Number(dati.saldo[k]) - Number(foto[k] || 0)) > 0.009)

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, background: 'var(--notte)', color: 'var(--avorio)', borderColor: 'var(--notte)' }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{periodo.data_chiusura ? '📁' : '📂'} {etichettaPeriodo(periodo)}</div>
        <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
          {periodo.data_chiusura ? 'Periodo chiuso' : 'Periodo in corso: i numeri cambiano man mano che registri.'}
          {periodo.note ? ` · ${periodo.note}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <Link className="btn btn-accent btn-sm" to={link('incassi')}>Incassi serata</Link>
          <Link className="btn btn-accent btn-sm" to={link('uscite')}>Uscite</Link>
          <Link className="btn btn-accent btn-sm" to={link('chioschetto')}>Chioschetto</Link>
          <Link className="btn btn-accent btn-sm" to={link('')}>Grafico e riepilogo</Link>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Entrate (≈ EUR)</div>
          <div className="stat-value positivo">{euro(entrateEur)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Uscite (≈ EUR)</div>
          <div className="stat-value negativo">{euro(usciteTot.inEur)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Netto (≈ EUR)</div>
          <div className={`stat-value ${nettoEur >= 0 ? 'positivo' : 'negativo'}`}>{euro(nettoEur)}</div>
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--inchiostro-soft)', margin: '-8px 0 18px' }}>
        I totali in euro usano il cambio impostato oggi; i dettagli qui sotto sono nelle valute originali.
      </p>

      {saldo && (
        <Sezione titolo={periodo.data_chiusura ? 'Cassa a fine periodo' : 'Cassa adesso'}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {campiSaldo.map(([k, etichetta, fmt]) => (
              <div key={k} className="stat-card" style={{ padding: '10px 12px' }}>
                <div className="stat-label">{etichetta}</div>
                <div className={`stat-value ${Number(saldo[k]) < 0 ? 'negativo' : ''}`} style={{ fontSize: 18 }}>{fmt(saldo[k])}</div>
                {cambiatoDopo && Math.abs(Number(saldo[k]) - Number(foto[k] || 0)) > 0.009 && (
                  <div style={{ fontSize: 11.5, color: 'var(--inchiostro-soft)', marginTop: 4 }}>alla chiusura: {fmt(foto[k])}</div>
                )}
              </div>
            ))}
          </div>
          {cambiatoDopo && (
            <p style={{ fontSize: 12.5, color: 'var(--corallo)', marginTop: 10, marginBottom: 0 }}>
              Alcune voci di questo periodo sono state corrette dopo la chiusura: il saldo qui sopra è quello aggiornato.
            </p>
          )}
        </Sezione>
      )}

      <Sezione titolo={`Entrate ristorante · ${inc.serate} serate`} azione={<Link className="btn btn-ghost btn-sm" to={link('incassi')}>Apri e correggi</Link>}>
        <Riga etichetta="Sala in euro (contanti + bonifici, al netto del fondo)" valore={euro(inc.eurSala)} />
        <Riga etichetta="Sala in lire, contanti" valore={lire(inc.egpContanti)} />
        <Riga etichetta="Sala in lire, POS" valore={lire(inc.egpPos)} />
        <Riga etichetta="Sala in dollari" valore={dollari(inc.usd)} />
        <Riga etichetta="Delivery" valore={`${euro(inc.deliveryEur)} · ${lire(inc.deliveryEgp)}`} />
        <Riga etichetta="Persone servite" valore={inc.persone.toLocaleString('it-IT')} />
        <Riga etichetta="Totale ristorante (≈ EUR)" valore={euro(entrateRistoranteEur)} colore="var(--smeraldo)" />
      </Sezione>

      <Sezione titolo={`Entrate chioschetto · ${chio.giorni} giorni`} azione={<Link className="btn btn-ghost btn-sm" to={link('chioschetto')}>Apri e correggi</Link>}>
        <Riga etichetta="Euro (contanti + bonifici)" valore={euro(chio.eur)} />
        <Riga etichetta="Lire, contanti" valore={lire(chio.egpContanti)} />
        <Riga etichetta="Lire, POS" valore={lire(chio.egpPos)} />
        <Riga etichetta="Dollari" valore={dollari(chio.usd)} />
        <Riga etichetta="Totale chioschetto (≈ EUR)" valore={euro(entrateChioEur)} colore="var(--smeraldo)" />
      </Sezione>

      <Sezione titolo={`Uscite · ${usciteTot.voci} voci`} azione={<Link className="btn btn-ghost btn-sm" to={link('uscite')}>Apri e correggi</Link>}>
        <Riga etichetta="In euro" valore={euro(usciteTot.EUR)} />
        <Riga etichetta="In lire" valore={lire(usciteTot.EGP)} />
        <Riga etichetta="In dollari" valore={dollari(usciteTot.USD)} />
        {metodi.length > 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--inchiostro-soft)', marginTop: 8 }}>
            Pagate {metodi.map((x) => `${x.m === 'pos' ? 'col POS' : x.m === 'bonifico' ? 'con bonifico' : 'in contanti'}: ${x.voci}`).join(' · ')}
          </div>
        )}
        {categorie.length > 0 && (
          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <table>
              <thead>
                <tr><th>Categoria</th><th>Voci</th><th>Euro</th><th>Lire</th><th>Dollari</th><th>≈ EUR</th></tr>
              </thead>
              <tbody>
                {categorie.map((c) => (
                  <tr key={c.nome}>
                    <td>{c.nome}</td>
                    <td>{c.voci}</td>
                    <td>{c.EUR ? euro(c.EUR) : '—'}</td>
                    <td>{c.EGP ? lire(c.EGP) : '—'}</td>
                    <td>{c.USD ? dollari(c.USD) : '—'}</td>
                    <td><strong>{euro(c.inEur)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sezione>

      <Sezione titolo={`Acconti dipendenti · ${dati.acconti.length}`}>
        <Riga etichetta="Totale acconti" valore={`${euro(accontiEur)} · ${lire(accontiEgp)}`} />
        <p style={{ fontSize: 12, color: 'var(--inchiostro-soft)', marginTop: 8, marginBottom: 0 }}>
          Gli acconti sono già compresi nelle uscite (ognuno crea la sua uscita).
        </p>
      </Sezione>

      <Sezione titolo={`Movimenti di cassa · ${dati.movimenti.length}`}>
        {dati.movimenti.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--inchiostro-soft)', margin: 0 }}>Nessun movimento in questo periodo.</p>
        ) : (
          Object.entries(movimentiPerTipo).map(([tipo, t]) => (
            <details key={tipo} style={{ padding: '6px 0', borderBottom: '1px solid var(--linea)' }}>
              <summary style={{ cursor: 'pointer', fontSize: 13.5 }}>
                <strong>{TIPI_MOVIMENTO[tipo] || tipo}</strong> · {t.n}
              </summary>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {t.righe.map((m) => (
                  <div key={m.id} style={{ fontSize: 12.5, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--inchiostro-soft)', minWidth: 80 }}>{giorno(m.data)}</span>
                    <span>{descriviMovimento(m)}</span>
                    {m.note && <span style={{ color: 'var(--inchiostro-soft)' }}>· {m.note}</span>}
                  </div>
                ))}
              </div>
            </details>
          ))
        )}
      </Sezione>
    </div>
  )
}

function descriviMovimento(m) {
  const fmt = (v, valuta) => (valuta === 'EUR' ? euro(v) : valuta === 'USD' ? dollari(v) : lire(v))
  if (m.tipo === 'cambio_valuta') return `${fmt(m.importo_da, m.valuta_da)} → ${fmt(m.importo_a, m.valuta_a)}`
  if (m.tipo === 'prelievo_pos') return `${lire(m.importo_pos)} dal POS ai contanti`
  if (m.tipo === 'rettifica') {
    const v = m.valuta_a ? Number(m.importo_a) : Number(m.importo_pos)
    return `${v > 0 ? '+' : '−'} ${m.valuta_a ? fmt(Math.abs(v), m.valuta_a) + ' contanti' : lire(Math.abs(v)) + ' sul POS'}`
  }
  if (m.tipo === 'versamento') {
    return Number(m.importo_pos) > 0 ? `${lire(m.importo_pos)} sul POS` : `+ ${fmt(m.importo_a, m.valuta_a)}`
  }
  return `+ ${fmt(m.importo_a, m.valuta_a)}`
}
