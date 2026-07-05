import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { oggiLocale, primoGiornoMeseLocale } from '../lib/date'

const oggi = oggiLocale
const inizioMese = primoGiornoMeseLocale
const primoGiornoMese = primoGiornoMeseLocale

export default function Riepilogo() {
  const { isMaster } = useAuth()
  const [loading, setLoading] = useState(true)
  const [incassi, setIncassi] = useState([])
  const [uscite, setUscite] = useState([])
  const [tassi, setTassi] = useState({ eur_usd: 1.08, eur_egp: 60 })
  const [dataInizio, setDataInizio] = useState(inizioMese())
  const [dataFine, setDataFine] = useState(oggi())
  const [speseFisseNonPagate, setSpeseFisseNonPagate] = useState([])
  const [targetData, setTargetData] = useState(null)
  const [movimentiCambio, setMovimentiCambio] = useState([])

  async function caricaSpeseFisse() {
    const mese = primoGiornoMese()
    const [{ data: voci }, { data: pagamenti }] = await Promise.all([
      supabase.from('spese_fisse').select('*').eq('attiva', true),
      supabase.from('pagamenti_spese_fisse').select('spesa_fissa_id').eq('mese', mese),
    ])
    const pagateIds = new Set((pagamenti || []).map((p) => p.spesa_fissa_id))
    setSpeseFisseNonPagate((voci || []).filter((v) => !pagateIds.has(v.id)))
  }

  async function caricaTarget(eurUsdRate, eurEgpRate) {
    // 1. Spese fisse mensili (tutte le voci attive)
    const { data: speseFisse } = await supabase.from('spese_fisse').select('*').eq('attiva', true)

    // 2. Stipendi dipendenti attivi
    const { data: dipendenti } = await supabase.from('dipendenti').select('stipendio_eur, stipendio_egp').eq('attivo', true)

    // 3. Media uscite variabili ultimi 3 mesi (escludendo stipendi/acconti che sono già contati)
    const treM = new Date()
    treM.setMonth(treM.getMonth() - 3)
    const dataTreM = treM.toISOString().slice(0, 10)
    const { data: usciteStorico } = await supabase
      .from('uscite')
      .select('importo, valuta, categorie_uscite(nome)')
      .gte('data', dataTreM)

    // Calcola totale spese fisse in EUR
    const speseFisseEur = (speseFisse || []).reduce((acc, v) => {
      if (v.valuta === 'EUR') return acc + Number(v.importo)
      if (v.valuta === 'USD') return acc + Number(v.importo) / eurUsdRate
      if (v.valuta === 'EGP') return acc + Number(v.importo) / eurEgpRate
      return acc
    }, 0)

    // Calcola stipendi mensili totali in EUR
    const stipendiEur = (dipendenti || []).reduce((acc, d) => {
      return acc + Number(d.stipendio_eur) + Number(d.stipendio_egp) / eurEgpRate
    }, 0)

    // Media uscite variabili (escludi categorie Dipendenti per non contarli due volte)
    const usciteVariabiliEur = (usciteStorico || [])
      .filter((u) => u.categorie_uscite?.nome !== 'Dipendenti')
      .reduce((acc, u) => {
        if (u.valuta === 'EUR') return acc + Number(u.importo)
        if (u.valuta === 'USD') return acc + Number(u.importo) / eurUsdRate
        if (u.valuta === 'EGP') return acc + Number(u.importo) / eurEgpRate
        return acc
      }, 0)
    const mediaUsciteVariabiliMensili = usciteVariabiliEur / 3

    // Giorni del mese corrente
    const now = new Date()
    const giorniMese = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

    const totaleMensile = speseFisseEur + stipendiEur + mediaUsciteVariabiliMensili
    const targetGiornaliero = totaleMensile / giorniMese

    setTargetData({
      speseFisseEur,
      stipendiEur,
      mediaUsciteVariabiliMensili,
      totaleMensile,
      targetGiornaliero,
      giorniMese,
      nDipendenti: (dipendenti || []).length,
      nSpeseFisse: (speseFisse || []).length,
    })
  }

  async function carica() {
    setLoading(true)
    const [{ data: inc }, { data: usc }, { data: t }, { data: mov }] = await Promise.all([
      supabase.from('incassi').select('*').gte('data', dataInizio).lte('data', dataFine).order('data'),
      supabase.from('uscite').select('*').gte('data', dataInizio).lte('data', dataFine),
      supabase.from('tassi_cambio').select('*').order('created_at', { ascending: false }).limit(1),
      supabase.from('movimenti_cassa').select('*').eq('tipo', 'cambio_valuta').gte('data', dataInizio).lte('data', dataFine).order('data'),
    ])
    setIncassi(inc || [])
    setUscite(usc || [])
    setMovimentiCambio(mov || [])
    const t0 = t && t.length ? t[0] : { eur_usd: 1.08, eur_egp: 60 }
    if (t && t.length) setTassi(t0)
    setLoading(false)
    if (true) await caricaTarget(Number(t0.eur_usd) || 1.08, Number(t0.eur_egp) || 60)
  }

  useEffect(() => { carica(); caricaSpeseFisse() }, [dataInizio, dataFine])

  // Totali per valuta — incassi di sala
  // Formula fondo cassa: i contanti inseriti includono il fondo del giorno prima.
  // Incasso reale = eur_contanti + bonifici - fondo_cassa_ieri + fondo_cassa_oggi
  // Cioè: per ogni giorno, sommiamo (eur_contanti + bonifici + fondo_cassa)
  // e sottraiamo il fondo_cassa del giorno PRECEDENTE (che era già incluso nei contanti).
  // Ordiniamo per data per trovare il giorno precedente.
  const incassiOrdinati = [...incassi].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const totIncassiEur = incassiOrdinati.reduce((acc, r, i) => {
    const fondoIeri = i > 0 ? Number(incassiOrdinati[i - 1].fondo_cassa) : 0
    const incassoReale = Number(r.eur_contanti) + Number(r.bonifici) - fondoIeri + Number(r.fondo_cassa)
    return acc + incassoReale
  }, 0)
  const totIncassiUsd = incassi.reduce((a, r) => a + Number(r.usd_contanti), 0)
  const totIncassiEgp = incassi.reduce((a, r) => a + Number(r.egp_pos) + Number(r.egp_contanti), 0)

  // Totali delivery (campi dentro incassi)
  const totDeliveryEur = incassi.reduce((a, r) => a + Number(r.delivery_eur || 0), 0)
  const totDeliveryEgp = incassi.reduce((a, r) => a + Number(r.delivery_egp || 0), 0)

  // Totali per valuta — uscite
  const totUsciteEur = uscite.filter((u) => u.valuta === 'EUR').reduce((a, u) => a + Number(u.importo), 0)
  const totUsciteUsd = uscite.filter((u) => u.valuta === 'USD').reduce((a, u) => a + Number(u.importo), 0)
  const totUsciteEgp = uscite.filter((u) => u.valuta === 'EGP').reduce((a, u) => a + Number(u.importo), 0)

  // Conversione in EUR per il totale complessivo
  const eurUsdRate = Number(tassi.eur_usd) || 1
  const eurEgpRate = Number(tassi.eur_egp) || 1

  const incassiInEur = totIncassiEur + totDeliveryEur + (totIncassiUsd / eurUsdRate) + ((totIncassiEgp + totDeliveryEgp) / eurEgpRate)
  const usciteInEur = totUsciteEur + (totUsciteUsd / eurUsdRate) + (totUsciteEgp / eurEgpRate)
  const nettoInEur = incassiInEur - usciteInEur

  // Serie giornaliera per il grafico
  const giorniMap = {}
  incassiOrdinati.forEach((r, i) => {
    const giorno = r.data
    const fondoIeri = i > 0 ? Number(incassiOrdinati[i - 1].fondo_cassa) : 0
    const incassoEurReale = Number(r.eur_contanti) + Number(r.bonifici) - fondoIeri + Number(r.fondo_cassa)
    const valoreEur = incassoEurReale + Number(r.delivery_eur || 0)
      + Number(r.usd_contanti) / eurUsdRate
      + (Number(r.egp_pos) + Number(r.egp_contanti) + Number(r.delivery_egp || 0)) / eurEgpRate
    giorniMap[giorno] = giorniMap[giorno] || { data: giorno, incassi: 0, uscite: 0 }
    giorniMap[giorno].incassi += valoreEur
  })
  uscite.forEach((u) => {
    const giorno = u.data
    let valoreEur = Number(u.importo)
    if (u.valuta === 'USD') valoreEur = valoreEur / eurUsdRate
    if (u.valuta === 'EGP') valoreEur = valoreEur / eurEgpRate
    giorniMap[giorno] = giorniMap[giorno] || { data: giorno, incassi: 0, uscite: 0 }
    giorniMap[giorno].uscite += valoreEur
  })
  const serieGiornaliera = Object.values(giorniMap)
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((g) => ({
      ...g,
      giornoLabel: new Date(g.data).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
      netto: g.incassi - g.uscite,
    }))

  return (
    <div>
      {speseFisseNonPagate.length > 0 && (
        <div className="card" style={{ marginBottom: 22, borderColor: 'rgba(217,104,79,0.4)', background: 'rgba(217,104,79,0.06)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 20 }}>⏲</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, color: 'var(--corallo)', fontSize: 14.5 }}>
              {speseFisseNonPagate.length === 1 ? '1 spesa fissa da pagare questo mese' : `${speseFisseNonPagate.length} spese fisse da pagare questo mese`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--inchiostro-soft)', marginTop: 2 }}>
              {speseFisseNonPagate.map((v) => v.nome).join(' · ')}
            </div>
          </div>
          <Link to="/spese-fisse" className="btn btn-accent btn-sm">Vai a Spese fisse</Link>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Riepilogo cassa</h1>
          <p className="page-subtitle">Vista d'insieme su incassi, delivery, uscite e netto del periodo selezionato.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={dataInizio} onChange={(e) => setDataInizio(e.target.value)} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--linea)' }} />
          <span style={{ color: 'var(--inchiostro-soft)' }}>—</span>
          <input type="date" value={dataFine} onChange={(e) => setDataFine(e.target.value)} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--linea)' }} />
        </div>
      </div>

      {loading ? (
        <p className="page-subtitle">Caricamento…</p>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Incassi totali (≈ EUR)</div>
              <div className="stat-value positivo">€ {incassiInEur.toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">di cui Delivery (≈ EUR)</div>
              <div className="stat-value">€ {(totDeliveryEur + totDeliveryEgp / eurEgpRate).toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Uscite totali (≈ EUR)</div>
              <div className="stat-value negativo">€ {usciteInEur.toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Netto periodo</div>
              <div className={`stat-value ${nettoInEur >= 0 ? 'positivo' : 'negativo'}`}>€ {nettoInEur.toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Cambio in uso</div>
              <div style={{ fontSize: 13.5, color: 'var(--inchiostro-soft)', marginTop: 4, lineHeight: 1.6 }}>
                1€ = {eurUsdRate} $<br />
                1€ = {eurEgpRate} LE
              </div>
            </div>
          </div>

          {/* ── TARGET GIORNALIERO — solo Master ── */}
          {isMaster && targetData && (() => {
            const { speseFisseEur, stipendiEur, mediaUsciteVariabiliMensili, totaleMensile, targetGiornaliero, giorniMese, nDipendenti, nSpeseFisse } = targetData
            const incassoOggi = incassiInEur / Math.max(1, serieGiornaliera.length)
            const distanza = incassoOggi - targetGiornaliero
            const percentuale = targetGiornaliero > 0 ? Math.round((incassoOggi / targetGiornaliero) * 100) : 0
            return (
              <div className="card" style={{ marginBottom: 28, borderLeft: '4px solid var(--notte)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--notte)' }}>🎯 Target giornaliero</div>
                    <div style={{ fontSize: 13, color: 'var(--inchiostro-soft)', marginTop: 2 }}>
                      Quanto devi incassare ogni giorno per coprire tutte le spese del mese ({giorniMese} giorni)
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 32, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--notte)' }}>
                      € {targetGiornaliero.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)' }}>al giorno</div>
                  </div>
                </div>

                {/* Barra progresso */}
                {serieGiornaliera.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <span style={{ color: 'var(--inchiostro-soft)' }}>Media incasso giornaliero nel periodo</span>
                      <span style={{ fontWeight: 700, color: distanza >= 0 ? 'var(--smeraldo)' : 'var(--corallo)' }}>
                        € {incassoOggi.toFixed(2)} ({percentuale}%)
                      </span>
                    </div>
                    <div style={{ height: 10, borderRadius: 5, background: 'var(--sabbia-chiara)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(percentuale, 100)}%`,
                        borderRadius: 5,
                        background: percentuale >= 100 ? 'var(--smeraldo)' : percentuale >= 70 ? '#f5a623' : 'var(--corallo)',
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                    <div style={{ fontSize: 12, color: distanza >= 0 ? 'var(--smeraldo)' : 'var(--corallo)', marginTop: 5, fontWeight: 600 }}>
                      {distanza >= 0
                        ? `✓ Stai incassando € ${distanza.toFixed(2)}/giorno in più del necessario`
                        : `⚠ Mancano € ${Math.abs(distanza).toFixed(2)}/giorno per andare in pari`}
                    </div>
                  </div>
                )}

                {/* Dettaglio costi */}
                <div style={{ borderTop: '1px solid var(--linea)', paddingTop: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--inchiostro-soft)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Composizione costi mensili</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                    <div style={{ padding: '10px 12px', background: 'var(--sabbia-chiara)', borderRadius: 8 }}>
                      <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)' }}>Spese fisse ({nSpeseFisse} voci)</div>
                      <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>€ {speseFisseEur.toFixed(2)}</div>
                    </div>
                    <div style={{ padding: '10px 12px', background: 'var(--sabbia-chiara)', borderRadius: 8 }}>
                      <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)' }}>Stipendi ({nDipendenti} dip. attivi)</div>
                      <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>€ {stipendiEur.toFixed(2)}</div>
                    </div>
                    <div style={{ padding: '10px 12px', background: 'var(--sabbia-chiara)', borderRadius: 8 }}>
                      <div style={{ fontSize: 12, color: 'var(--inchiostro-soft)' }}>Spese variabili (media 3 mesi)</div>
                      <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>€ {mediaUsciteVariabiliMensili.toFixed(2)}</div>
                    </div>
                    <div style={{ padding: '10px 12px', background: 'var(--notte)', borderRadius: 8 }}>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Totale mensile stimato</div>
                      <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2, color: '#fff' }}>€ {totaleMensile.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          <div className="card" style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 15, marginBottom: 16, fontFamily: 'var(--font-body)', fontWeight: 700 }}>Andamento giornaliero (in EUR equivalente)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={serieGiornaliera}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--linea)" />
                <XAxis dataKey="giornoLabel" tick={{ fontSize: 12, fill: '#5B6670' }} />
                <YAxis tick={{ fontSize: 12, fill: '#5B6670' }} />
                <Tooltip formatter={(v) => `€ ${v.toFixed(2)}`} />
                <Line type="monotone" dataKey="incassi" stroke="#2F9E68" strokeWidth={2} dot={false} name="Incassi" />
                <Line type="monotone" dataKey="uscite" stroke="#D9684F" strokeWidth={2} dot={false} name="Uscite" />
                <Line type="monotone" dataKey="netto" stroke="#0E2A3D" strokeWidth={2} dot={false} name="Netto" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <h3 style={{ fontSize: 16, marginBottom: 14, color: 'var(--notte)' }}>Dettaglio per valuta</h3>
          <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Valuta</th>
                  <th>Entrate sala</th>
                  <th>Entrate delivery</th>
                  <th>Uscite</th>
                  <th>Netto</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className="tag">EUR</span></td>
                  <td>€ {totIncassiEur.toFixed(2)}</td>
                  <td>€ {totDeliveryEur.toFixed(2)}</td>
                  <td>€ {totUsciteEur.toFixed(2)}</td>
                  <td>€ {(totIncassiEur + totDeliveryEur - totUsciteEur).toFixed(2)}</td>
                </tr>
                <tr>
                  <td><span className="tag">EGP</span></td>
                  <td>{totIncassiEgp.toFixed(0)} LE</td>
                  <td>{totDeliveryEgp.toFixed(0)} LE</td>
                  <td>{totUsciteEgp.toFixed(0)} LE</td>
                  <td>{(totIncassiEgp + totDeliveryEgp - totUsciteEgp).toFixed(0)} LE</td>
                </tr>
                <tr>
                  <td><span className="tag">USD</span></td>
                  <td>$ {totIncassiUsd.toFixed(2)}</td>
                  <td>—</td>
                  <td>$ {totUsciteUsd.toFixed(2)}</td>
                  <td>$ {(totIncassiUsd - totUsciteUsd).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── CAMBI VALUTA del periodo ── */}
          {movimentiCambio.length > 0 && (() => {
            const SIMBOLI = { EUR: '€', EGP: 'LE', USD: '$' }
            // Totali per valuta: quanto è uscito e quanto è entrato dai cambi
            const cambiPerValuta = {}
            movimentiCambio.forEach((m) => {
              if (!cambiPerValuta[m.valuta_da]) cambiPerValuta[m.valuta_da] = { uscito: 0, entrato: 0 }
              if (!cambiPerValuta[m.valuta_a]) cambiPerValuta[m.valuta_a] = { uscito: 0, entrato: 0 }
              cambiPerValuta[m.valuta_da].uscito += Number(m.importo_da)
              cambiPerValuta[m.valuta_a].entrato += Number(m.importo_a)
            })
            return (
              <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--notte)' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>🔄 Cambi valuta nel periodo</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {movimentiCambio.map((m) => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span style={{ color: 'var(--inchiostro-soft)', minWidth: 70 }}>
                        {new Date(m.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                      </span>
                      <span style={{ color: 'var(--corallo)', fontWeight: 600 }}>
                        - {SIMBOLI[m.valuta_da]} {Number(m.importo_da).toFixed(2)} {m.valuta_da}
                      </span>
                      <span style={{ color: 'var(--inchiostro-soft)' }}>→</span>
                      <span style={{ color: 'var(--smeraldo)', fontWeight: 600 }}>
                        + {SIMBOLI[m.valuta_a]} {Number(m.importo_a).toFixed(2)} {m.valuta_a}
                      </span>
                      {m.note && <span style={{ color: 'var(--inchiostro-soft)', fontSize: 11 }}>· {m.note}</span>}
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid var(--linea)', paddingTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {Object.entries(cambiPerValuta).map(([valuta, v]) => (
                    <div key={valuta} style={{ fontSize: 13 }}>
                      <span className="tag" style={{ marginRight: 6 }}>{valuta}</span>
                      {v.entrato > 0 && <span style={{ color: 'var(--smeraldo)', marginRight: 6 }}>+{SIMBOLI[valuta]} {v.entrato.toFixed(2)}</span>}
                      {v.uscito > 0 && <span style={{ color: 'var(--corallo)' }}>-{SIMBOLI[valuta]} {v.uscito.toFixed(2)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
