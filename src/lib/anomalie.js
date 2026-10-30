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
// 4. Uscita uguale a una già inserita lo stesso giorno, o importo molto lontano
//    da quello che si spende di solito per quella voce.
//
// 5. Incasso o chioschetto con importi molto lontani dalle serate precedenti,
//    o identici a una serata recente.
//
// Questi controlli NON bloccano il salvataggio: mostrano un avviso e
// chiedono conferma esplicita, perché un'operazione insolita ma reale
// (es. una grande festa privata) deve comunque poter essere registrata.
// ============================================================================

import { giornoDopo, giornoLeggibile } from './date'
import { tassiSicuri } from './tassi'

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

  if (totale <= 0) return null
  if (persone <= 0) return 'Non hai scritto il numero di persone servite.'

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

// Soglie scelte provandole sullo storico vero: su 483 uscite confrontabili ne
// segnalano circa l'1,5%, e prendono lo zero in più o in meno e la valuta sbagliata.
const VOLTE_SOPRA_IL_SOLITO = 5
const VOLTE_SOTTO_IL_SOLITO = 8
const RIGHE_MINIME_STORICO = 4

function mediana(valori) {
  const ordinati = [...valori].sort((a, b) => a - b)
  const meta = Math.floor(ordinati.length / 2)
  return ordinati.length % 2 ? ordinati[meta] : (ordinati[meta - 1] + ordinati[meta]) / 2
}

// "Caffè " e "caffe" sono la stessa voce
function normalizza(testo) {
  return String(testo || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Una contiene l'altra: "Mangiare" e "Mangiare staff"
function descrizioniSimili(a, b) {
  const [na, nb] = [normalizza(a), normalizza(b)]
  if (!na || !nb) return false
  return na === nb || (Math.min(na.length, nb.length) >= 4 && (na.includes(nb) || nb.includes(na)))
}

function inEur(importo, valuta, tassi) {
  const { eurUsd, eurEgp } = tassiSicuri(tassi)
  if (valuta === 'EGP') return Number(importo) / eurEgp
  if (valuta === 'USD') return Number(importo) / eurUsd
  return Number(importo)
}

function daEur(importoEur, valuta, tassi) {
  return importoEur / inEur(1, valuta, tassi)
}

function scrivi(importo, valuta) {
  const arrotondato = Math.round(importo).toLocaleString('it-IT')
  return valuta === 'EGP' ? `${arrotondato} LE` : `${valuta === 'USD' ? '$' : '€'} ${arrotondato}`
}

/**
 * Controlla un'uscita prima di salvarla: uguale a una già inserita quel giorno,
 * o importo fuori scala rispetto alla stessa voce (o, per una voce nuova, alla
 * sua categoria). Tutto è confrontato in euro, così si vede anche un importo in
 * LE scritto in Euro. Ritorna la lista degli avvisi; se il controllo non si può
 * fare ritorna una lista vuota, per non bloccare il salvataggio.
 */
export async function controllaUscita(supabase, uscita, tassi, idEscluso) {
  const importo = Number(uscita.importo) || 0
  if (importo <= 0) return ["L'importo è zero: controlla di averlo scritto."]

  const [stessoGiorno, storico] = await Promise.all([
    supabase.from('uscite').select('id, descrizione')
      .eq('data', uscita.data).eq('valuta', uscita.valuta).eq('importo', importo),
    supabase.from('uscite').select('id, descrizione, categoria_id, valuta, importo')
      .is('generato_da_acconto_id', null).order('data', { ascending: false }).limit(1000),
  ])

  const avvisi = []

  const doppione = (stessoGiorno.data || []).find((r) => r.id !== idEscluso && descrizioniSimili(r.descrizione, uscita.descrizione))
  if (doppione) {
    avvisi.push(
      `Per ${giornoLeggibile(uscita.data)} c'è già "${doppione.descrizione}" da ${scrivi(importo, uscita.valuta)}. ` +
      `Se è la stessa spesa la stai inserendo due volte.`
    )
  }

  const precedenti = (storico.data || []).filter((r) => r.id !== idEscluso)
  const importoEur = inEur(importo, uscita.valuta, tassi)
  const stessaVoce = precedenti
    .filter((r) => normalizza(r.descrizione) === normalizza(uscita.descrizione))
    .map((r) => inEur(r.importo, r.valuta, tassi))

  if (stessaVoce.length >= RIGHE_MINIME_STORICO) {
    const solito = mediana(stessaVoce)
    if (importoEur > solito * VOLTE_SOPRA_IL_SOLITO || importoEur < solito / VOLTE_SOTTO_IL_SOLITO) {
      avvisi.push(
        `Per "${uscita.descrizione.trim()}" di solito si spendono circa ${scrivi(daEur(solito, uscita.valuta, tassi), uscita.valuta)}, ` +
        `qui ci sono ${scrivi(importo, uscita.valuta)}. Controlla l'importo e la valuta.`
      )
    }
  } else {
    const stessaCategoria = precedenti
      .filter((r) => r.categoria_id === uscita.categoria_id)
      .map((r) => inEur(r.importo, r.valuta, tassi))
    if (stessaCategoria.length >= RIGHE_MINIME_STORICO && importoEur > Math.max(...stessaCategoria) * 1.5) {
      avvisi.push(
        `${scrivi(importo, uscita.valuta)} è molto più della spesa più alta mai registrata in questa categoria ` +
        `(circa ${scrivi(daEur(Math.max(...stessaCategoria), uscita.valuta, tassi), uscita.valuta)}). Controlla l'importo e la valuta.`
      )
    }
  }

  return avvisi
}

/** Totale di una serata in euro, senza il fondo cassa. */
export function totaleSerataEur(riga, tassi) {
  return inEur(Number(riga.eur_contanti) + Number(riga.bonifici) + Number(riga.delivery_eur || 0), 'EUR', tassi) +
    inEur(Number(riga.egp_pos) + Number(riga.egp_contanti) + Number(riga.delivery_egp || 0), 'EGP', tassi) +
    inEur(Number(riga.usd_contanti), 'USD', tassi)
}

/**
 * Confronta una serata (incassi o chioschetto) con le ultime 60 registrate:
 * voce per voce, sul totale, e cerca serate con gli stessi identici importi.
 * `campi` è la lista [colonna, etichetta]. Ritorna la lista degli avvisi.
 */
export async function controllaSerata(supabase, tabella, serata, campi, tassi, idEscluso) {
  const totale = totaleSerataEur(serata, tassi)
  if (totale <= 0) return ['Non hai scritto nessun importo.']

  const { data, error } = await supabase.from(tabella).select('*').order('data', { ascending: false }).limit(60)
  if (error || !data) return []
  const precedenti = data.filter((r) => r.id !== idEscluso)
  if (precedenti.length < RIGHE_MINIME_STORICO) return []

  const avvisi = []

  const identica = precedenti.find((r) => campi.every(([campo]) => Number(r[campo] || 0) === Number(serata[campo] || 0)))
  if (identica) {
    avvisi.push(`Gli importi sono identici a quelli di ${giornoLeggibile(identica.data)}: controlla di non averli inseriti due volte.`)
  }

  for (const [campo, etichetta] of campi) {
    const valore = Number(serata[campo]) || 0
    const storico = precedenti.map((r) => Number(r[campo]) || 0).filter((v) => v > 0)
    if (valore <= 0 || storico.length < RIGHE_MINIME_STORICO) continue
    const solito = mediana(storico)
    if ((valore > solito * VOLTE_SOPRA_IL_SOLITO && valore > Math.max(...storico)) ||
        (valore < solito / VOLTE_SOTTO_IL_SOLITO && valore < Math.min(...storico))) {
      avvisi.push(`${etichetta}: hai scritto ${valore.toLocaleString('it-IT')}, di solito è circa ${Math.round(solito).toLocaleString('it-IT')}. Controlla l'importo e la valuta.`)
    }
  }

  const totali = precedenti.map((r) => totaleSerataEur(r, tassi))
  const solito = mediana(totali)
  if (totale > Math.max(...totali) * 1.5 || totale < solito / VOLTE_SOTTO_IL_SOLITO) {
    avvisi.push(`Il totale è circa € ${Math.round(totale).toLocaleString('it-IT')}, di solito è circa € ${Math.round(solito).toLocaleString('it-IT')}.`)
  }

  return avvisi
}
