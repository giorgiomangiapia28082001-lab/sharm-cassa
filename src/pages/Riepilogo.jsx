import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { oggiLocale, primoGiornoMeseLocale } from '../lib/date'

const oggi = oggiLocale
const inizioMese = primoGiornoMeseLocale
const primoGiornoMese = primoGiornoMeseLocale

export default function Riepilogo() {
  const [loading, setLoading] = useState(true)
  const [incassi, setIncassi] = useState([])
  const [uscite, setUscite] = useState([])
  const [tassi, setTassi] = useState({ eur_usd: 1.08, eur_egp: 60 })
  const [dataInizio, setDataInizio] = useState(inizioMese())
  const [dataFine, setDataFine] = useState(oggi())
  const [speseFisseNonPagate, setSpeseFisseNonPagate] = useState([])

  async function caricaSpeseFisse() {
    const mese = primoGiornoMese()
    const [{ data: voci }, { data: pagamenti }] = await Promise.all([
      supabase.from('spese_fisse').select('*').eq('attiva', true),
      supabase.from('pagamenti_spese_fisse').select('spesa_fissa_id').eq('mese', mese),
    ])
    const pagateIds = new Set((pagamenti || []).map((p) => p.spesa_fissa_id))
    setSpeseFisseNonPagate((voci || []).filter((v) => !pagateIds.has(v.id)))
  }

  async function carica() {
    setLoading(true)
    const [{ data: inc }, { data: usc }, { data: t }] = await Promise.all([
      supabase.from('incassi').select('*').gte('data', dataInizio).lte('data', dataFine).order('data'),
      supabase.from('uscite').select('*').gte('data', dataInizio).lte('data', dataFine),
      supabase.from('tassi_cambio').select('*').order('created_at', { ascending: false }).limit(1),
    ])
    setIncassi(inc || [])
    setUscite(usc || [])
    if (t && t.length) setTassi(t[0])
    setLoading(false)
  }

  useEffect(() => { carica(); caricaSpeseFisse() }, [dataInizio, dataFine])

  // Totali per valuta — incassi di sala
  const totIncassiEur = incassi.reduce((a, r) => a + Number(r.eur_contanti) + Number(r.fondo_cassa) + Number(r.bonifici), 0)
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
  incassi.forEach((r) => {
    const giorno = r.data
    const valoreEur = Number(r.eur_contanti) + Number(r.fondo_cassa) + Number(r.bonifici) + Number(r.delivery_eur || 0)
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
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
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
        </>
      )}
    </div>
  )
}
