// ============================================================================
// Controlli "di buon senso" sui dati inseriti, per intercettare errori di
// battitura comuni PRIMA che finiscano in contabilità:
//
// 1. Prezzo medio a persona fuori scala → tipicamente capita quando si
//    scrive un importo in EGP (lire) dentro un campo in EUR (o viceversa),
//    perché il cambio è ~55x: un incasso da 3000 LE diventa "3000 €" se
//    inserito nel campo sbagliato, e il prezzo a persona schizza alle stelle.
//
// 2. Cambio valuta inserito manualmente troppo lontano dal tasso configurato
//    in Impostazioni → probabile errore di digitazione (uno zero in più/meno,
//    o importo_da/importo_a invertiti).
//
// 3. Data di una serata nuova che non è il giorno dopo l'ultima registrata,
//    o che c'è già → serata sul giorno sbagliato o inserita due volte.
//
// Questi controlli NON bloccano il salvataggio: mostrano un avviso e
// chiedono conferma esplicita, perché un'operazione insolita ma reale
// (es. una grande festa privata) deve comunque poter essere registrata.
// ============================================================================

import { giornoDopo, giornoLeggibile } from './date'

// Range plausibile di spesa a persona per un ristorante come questo.
// Volutamente larghi per non disturbare in casi legittimi (gruppi grandi,
// menu degustazione, ecc.) mentre intercettano gli errori grossolani
// (tipicamente un fattore ~55x dovuto alla confusione EUR/EGP).
const PREZZO_PERSONA_MIN = 1
const PREZZO_PERSONA_MAX = 90

/**
 * Controlla se il totale incassato (in EUR, già convertito) diviso per il
 * numero di persone servite è fuori da un range plausibile.
 * Ritorna una stringa con l'avviso, oppure null se tutto ok.
 */
export function controllaPrezzoPersona(totaleEur, numeroPersone) {
  const persone = Number(numeroPersone) || 0
  const totale = Number(totaleEur) || 0

  if (persone <= 0 || totale <= 0) return null

  const perPersona = totale / persone

  if (perPersona > PREZZO_PERSONA_MAX) {
    return (
      `Il totale incassato corrisponde a circa € ${perPersona.toFixed(2)} a persona, ` +
      `un valore molto alto per ${persone} persone. Capita spesso quando un importo in ` +
      `Lire egiziane (LE) viene inserito per errore in un campo in Euro. Controlla i dati ` +
      `prima di confermare.`
    )
  }

  if (perPersona < PREZZO_PERSONA_MIN) {
    return (
      `Il totale incassato corrisponde a circa € ${perPersona.toFixed(2)} a persona, ` +
      `un valore molto basso per ${persone} persone. Controlla che il numero di persone e ` +
      `gli importi inseriti siano corretti.`
    )
  }

  return null
}

// Soglia di scostamento accettata rispetto al tasso configurato in Impostazioni.
const SOGLIA_SCOSTAMENTO_CAMBIO = 0.15 // 15%

/**
 * Confronta il cambio implicito in un movimento "cambio valuta"
 * (importo_a / importo_da) con il tasso configurato in Impostazioni.
 * Ritorna una stringa con l'avviso, oppure null se lo scostamento è nella norma.
 */
export function controllaCambioValuta(valutaDa, importoDa, valutaA, importoA, tassi) {
  const da = Number(importoDa) || 0
  const a = Number(importoA) || 0
  if (da <= 0 || a <= 0 || valutaDa === valutaA) return null

  const eurUsd = Number(tassi?.eur_usd) || null
  const eurEgp = Number(tassi?.eur_egp) || null
  if (!eurUsd || !eurEgp) return null

  // Tassi attesi (quante unità di "A" per 1 unità di "Da"), derivati dai
  // due tassi configurati (EUR/USD e EUR/EGP).
  const tassiAttesi = {
    EUR_EGP: eurEgp,
    EGP_EUR: 1 / eurEgp,
    EUR_USD: eurUsd,
    USD_EUR: 1 / eurUsd,
    USD_EGP: eurEgp / eurUsd,
    EGP_USD: eurUsd / eurEgp,
  }

  const atteso = tassiAttesi[`${valutaDa}_${valutaA}`]
  if (!atteso) return null

  const inserito = a / da
  const scostamento = Math.abs(inserito - atteso) / atteso

  if (scostamento > SOGLIA_SCOSTAMENTO_CAMBIO) {
    return (
      `Il cambio implicito in questo movimento è 1 ${valutaDa} ≈ ${inserito.toFixed(4)} ${valutaA}, ` +
      `ma il tasso configurato in Impostazioni è 1 ${valutaDa} ≈ ${atteso.toFixed(4)} ${valutaA} ` +
      `(scostamento del ${(scostamento * 100).toFixed(0)}%). Controlla gli importi prima di confermare, ` +
      `oppure aggiorna il tasso in Impostazioni se il cambio reale è davvero cambiato.`
    )
  }

  return null
}

/**
 * Controlla la data di una serata nuova (incassi o chioschetto) rispetto a
 * quelle già registrate da tutti (funzione del database, migrazione 37):
 * - se per quel giorno c'è già una serata → probabile doppione;
 * - se non è il giorno dopo l'ultima serata registrata → data da controllare
 *   (giorno saltato, o serata messa sul giorno sbagliato).
 * Ritorna una stringa con l'avviso, oppure null se tutto ok (o se il
 * controllo non si può fare, per non bloccare il salvataggio).
 */
export async function controllaDataSerata(supabase, tabella, data) {
  const { data: righe, error } = await supabase.rpc('controlla_data_serata', { p_tabella: tabella, p_data: data })
  if (error || !righe?.length) return null
  const { ultima_data: ultima, gia_presente: giaPresente } = righe[0]

  if (giaPresente) {
    return (
      `Per ${giornoLeggibile(data)} c'è già una serata registrata. ` +
      `Se è la stessa serata la stai inserendo due volte: torna indietro e controlla la data.`
    )
  }
  if (ultima && data !== giornoDopo(ultima)) {
    return (
      `L'ultima serata registrata è di ${giornoLeggibile(ultima)}, quindi questa dovrebbe essere di ` +
      `${giornoLeggibile(giornoDopo(ultima))}, ma la data scritta è ${giornoLeggibile(data)}. ` +
      `Controlla la data prima di confermare.`
    )
  }
  return null
}
