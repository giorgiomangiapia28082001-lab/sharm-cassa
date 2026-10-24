// ============================================================================
// Periodi di cassa condivisi da tutte le pagine.
//
// Ogni incasso, uscita, movimento e acconto appartiene a un periodo
// (colonna periodo_cassa_id, assegnata dal database al momento
// dell'inserimento). Quando si chiude un periodo, tutto riparte da zero nel
// periodo nuovo e quello vecchio finisce nell'Archivio.
//
// Le pagine mostrano di base il periodo in corso; con il selettore (o con
// ?periodo=<id> nell'indirizzo, usato dai link dell'Archivio) si guarda un
// periodo passato e se ne possono correggere le voci.
// ============================================================================

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from './supabase'

function giorno(d) {
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function etichettaPeriodo(p) {
  if (!p) return ''
  const dal = p.data_apertura ? giorno(p.data_apertura) : '?'
  return p.data_chiusura
    ? `Periodo ${p.numero} · ${dal} – ${giorno(p.data_chiusura)}`
    : `Periodo ${p.numero} · dal ${dal} (in corso)`
}

/**
 * Carica l'elenco dei periodi e restituisce quello scelto.
 * `periodo` è null finché il caricamento non è finito.
 */
export function usePeriodoScelto() {
  const [periodi, setPeriodi] = useState([])
  const [caricato, setCaricato] = useState(false)
  const [params, setParams] = useSearchParams()
  const idScelto = params.get('periodo')

  async function ricarica() {
    const { data } = await supabase
      .from('periodi_cassa')
      .select('*')
      .order('data_apertura', { ascending: false })
    setPeriodi(data || [])
    setCaricato(true)
  }

  useEffect(() => { ricarica() }, [])

  const aperto = periodi.find((p) => !p.data_chiusura) || null
  const periodo = periodi.find((p) => p.id === idScelto) || aperto

  function scegli(id) {
    const nuovi = new URLSearchParams(params)
    if (!id || id === aperto?.id) nuovi.delete('periodo')
    else nuovi.set('periodo', id)
    setParams(nuovi, { replace: true })
  }

  return {
    periodi,
    periodo,
    aperto,
    caricato,
    // true quando si sta guardando un periodo già chiuso (archivio)
    inArchivio: !!periodo?.data_chiusura,
    scegli,
    ricarica,
  }
}

/** Menu a tendina per cambiare periodo. */
export function SceltaPeriodo({ periodi, periodo, onChange }) {
  if (!periodi.length) return null
  return (
    <select
      value={periodo?.id || ''}
      onChange={(e) => onChange(e.target.value)}
      style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--linea)', background: '#fff', maxWidth: '100%' }}
    >
      {periodi.map((p) => (
        <option key={p.id} value={p.id}>{etichettaPeriodo(p)}</option>
      ))}
    </select>
  )
}

/** Avviso mostrato quando si sta guardando un periodo chiuso. */
export function AvvisoArchivio({ periodo, onTornaAlCorrente }) {
  if (!periodo?.data_chiusura) return null
  return (
    <div className="card" style={{ marginBottom: 20, borderColor: 'rgba(14,42,61,0.35)', background: 'var(--sabbia-chiara)', fontSize: 13.5 }}>
      <strong>📁 Stai guardando un periodo chiuso ({etichettaPeriodo(periodo)}).</strong>
      <div style={{ marginTop: 4, color: 'var(--inchiostro-soft)' }}>
        Puoi correggere le voci di questo periodo. Le voci nuove si inseriscono solo nel periodo in corso.
      </div>
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={onTornaAlCorrente}>
        ← Torna al periodo in corso
      </button>
    </div>
  )
}

/** Aggiunge alla query il filtro sul periodo scelto. */
export function filtraPeriodo(query, periodo) {
  return periodo ? query.eq('periodo_cassa_id', periodo.id) : query
}
