// ============================================================================
// Tassi di cambio — un'unica fonte di verità per tutta l'app.
//
// Prima ogni pagina aveva il proprio valore di partenza dei tassi, scritto a
// mano: Incassi e Cassa usavano eur_egp: 55, Riepilogo eur_egp: 60, e Uscite
// aveva addirittura i numeri fissi (55 e 1.08) dentro il calcolo del riepilogo
// per categoria. Risultato: per lo stesso dato, pagine diverse potevano
// mostrare importi in EUR diversi, e le Uscite ignoravano del tutto il tasso
// reale impostato in Impostazioni.
//
// Qui centralizziamo:
// - TASSI_DEFAULT: gli stessi valori di partenza per TUTTE le pagine, usati
//   solo nell'istante prima che arrivino i tassi reali dal database (o se il
//   database non ne ha ancora nessuno).
// - caricaTassi(): legge dal database l'ultimo tasso salvato in Impostazioni.
// - useTassi(): hook comodo che carica i tassi una volta e li tiene pronti.
// ============================================================================

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Valori di partenza UNICI per tutta l'app. Sono solo un ripiego: appena
// Impostazioni ha dei tassi salvati, sono quelli a comandare.
export const TASSI_DEFAULT = { eur_usd: 1.08, eur_egp: 60 }

/**
 * Legge dal database l'ultimo tasso di cambio salvato in Impostazioni.
 * Ritorna sempre un oggetto valido: se non trova nulla, usa TASSI_DEFAULT.
 */
export async function caricaTassi() {
  const { data, error } = await supabase
    .from('tassi_cambio')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) return { ...TASSI_DEFAULT }
  return data[0]
}

/**
 * Restituisce i due tassi già puliti in numeri sicuri (mai 0, mai NaN),
 * pronti da usare nelle divisioni per convertire in EUR.
 */
export function tassiSicuri(tassi) {
  const eurUsd = Number(tassi?.eur_usd) || TASSI_DEFAULT.eur_usd
  const eurEgp = Number(tassi?.eur_egp) || TASSI_DEFAULT.eur_egp
  return { eurUsd, eurEgp }
}

/**
 * Hook: carica i tassi una volta all'avvio del componente.
 * Ritorna { tassi, ricarica } dove `tassi` parte da TASSI_DEFAULT e viene
 * aggiornato appena arriva la risposta dal database.
 */
export function useTassi() {
  const [tassi, setTassi] = useState(TASSI_DEFAULT)

  async function ricarica() {
    const t = await caricaTassi()
    setTassi(t)
  }

  useEffect(() => {
    ricarica()
  }, [])

  return { tassi, ricarica }
}
