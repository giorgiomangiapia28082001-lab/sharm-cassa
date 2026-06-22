import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const oggi = () => new Date().toISOString().slice(0, 10)
const inizioMese = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }

export default function Riepilogo() {
  const [loading, setLoading] = useState(true)
  const [incassi, setIncassi] = useState([])
  const [uscite, setUscite] = useState([])
  const [tassi, setTassi] = useState({ eur_usd: 1.08, eur_egp: 60, eur_gbp: 0.85 })
  const [dataInizio, setDataInizio] = useState(inizioMese())
  const [dataFine, setDataFine] = useState(oggi())

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

  useEffect(() => { carica() }, [dataInizio, dataFine])

  // Totali per valuta — incassi
  const totIncassiEur = incassi.reduce((a, r) => a + Number(r.eur_contanti) + Number(r.fondo_cassa) + Number(r.bonifici) + Number(r.delivery), 0)
  const totIncassiGbp = incassi.reduce((a, r) => a + Number(r.gbp_pos) + Number(r.gbp_contanti), 0)
  const totIncassiUsd = incassi.reduce((a, r) => a + Number(r.usd_contanti), 0)
  const totIncassiEgp = incassi.reduce((a, r) => a + Number(r.egp_contanti), 0)

  // Totali per valuta — uscite
  const totUsciteEur = uscite.filter((u) => u.valuta === 'EUR').reduce((a, u) => a + Number(u.importo), 0)
  const totUsciteGbp = uscite.filter((u) => u.valuta === 'GBP').reduce((a, u) => a + Number(u.importo), 0)
  const totUsciteUsd = uscite.filter((u) => u.valuta === 'USD').reduce((a, u) => a + Number(u.importo), 0)
  const totUsciteEgp = uscite.filter((u) => u.valuta === 'EGP').reduce((a, u) => a + Number(u.importo), 0)

  // Conversione in EUR per il totale complessivo
  const eurUsdRate = Number(tassi.eur_usd) || 1
  const eurEgpRate = Number(tassi.eur_egp) || 1
  const eurGbpRate = Number(tassi.eur_gbp) || 1

  const incassiInEur = totIncassiEur + (totIncassiUsd / eurUsdRate) + (totIncassiEgp / eurEgpRate) + (totIncassiGbp / eurGbpRate)
  const usciteInEur = totUsciteEur + (totUsciteUsd / eurUsdRate) + (totUsciteEgp / eurEgpRate) + (totUsciteGbp / eurGbpRate)
  const nettoInEur = incassiInEur - usciteInEur

  // Serie giornaliera per il grafico
  const giorniMap = {}
  incassi.forEach((r) => {
    const giorno = r.data
    const valoreEur = Number(r.eur_contanti) + Number(r.fondo_cassa) + Number(r.bonifici) + Number(r.delivery)
      + Number(r.usd_contanti) / eurUsdRate + Number(r.egp_contanti) / eurEgpRate + (Number(r.gbp_pos) + Number(r.gbp_contanti)) / eurGbpRate
    giorniMap[giorno] = giorniMap[giorno] || { data: giorno, incassi: 0, uscite: 0 }
    giorniMap[giorno].incassi += valoreEur
  })
  uscite.forEach((u) => {
    const giorno = u.data
    let valoreEur = Number(u.importo)
    if (u.valuta === 'USD') valoreEur = valoreEur / eurUsdRate
    if (u.valuta === 'EGP') valoreEur = valoreEur / eurEgpRate
    if (u.valuta === 'GBP') valoreEur = valoreEur / eurGbpRate
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Riepilogo cassa</h1>
          <p className="page-subtitle">Vista d'insieme su incassi, uscite e netto del periodo selezionato.</p>
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
                1€ = {eurEgpRate} LE<br />
                1€ = {eurGbpRate} £
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
                  <th>Entrate</th>
                  <th>Uscite</th>
                  <th>Netto</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className="tag">EUR</span></td>
                  <td>€ {totIncassiEur.toFixed(2)}</td>
                  <td>€ {totUsciteEur.toFixed(2)}</td>
                  <td className={totIncassiEur - totUsciteEur >= 0 ? '' : ''}>€ {(totIncassiEur - totUsciteEur).toFixed(2)}</td>
                </tr>
                <tr>
                  <td><span className="tag">GBP</span></td>
                  <td>£ {totIncassiGbp.toFixed(2)}</td>
                  <td>£ {totUsciteGbp.toFixed(2)}</td>
                  <td>£ {(totIncassiGbp - totUsciteGbp).toFixed(2)}</td>
                </tr>
                <tr>
                  <td><span className="tag">USD</span></td>
                  <td>$ {totIncassiUsd.toFixed(2)}</td>
                  <td>$ {totUsciteUsd.toFixed(2)}</td>
                  <td>$ {(totIncassiUsd - totUsciteUsd).toFixed(2)}</td>
                </tr>
                <tr>
                  <td><span className="tag">EGP</span></td>
                  <td>{totIncassiEgp.toFixed(0)} LE</td>
                  <td>{totUsciteEgp.toFixed(0)} LE</td>
                  <td>{(totIncassiEgp - totUsciteEgp).toFixed(0)} LE</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
