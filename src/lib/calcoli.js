// ============================================================================
// Calcoli sugli incassi condivisi tra Riepilogo e Archivio, così i due
// mostrano sempre gli stessi numeri.
// ============================================================================

import { confrontaStringhe } from './date'

/**
 * Ordina gli incassi per giorno (e, a parità di giorno, per ora di
 * inserimento) e aggiunge a ognuno il fondo cassa del giorno precedente.
 *
 * Il fondo cassa: i contanti contati la sera includono il fondo lasciato la
 * sera prima. Quindi l'incasso reale in euro di un giorno è
 *   contanti + bonifici + fondo di oggi − fondo di ieri.
 *
 * Prima l'ordine era solo per ora di inserimento: se una serata veniva
 * inserita in ritardo, il "giorno prima" risultava sbagliato.
 */
export function conFondoIeri(incassi) {
  return [...incassi]
    .sort((a, b) => confrontaStringhe(a.data, b.data) || confrontaStringhe(a.created_at, b.created_at))
    .map((r, i, arr) => ({ r, fondoIeri: i > 0 ? Number(arr[i - 1].fondo_cassa) : 0 }))
}

/** Incasso reale in euro della sala (senza delivery) per una riga. */
export function eurSalaReale({ r, fondoIeri }) {
  return Number(r.eur_contanti) + Number(r.bonifici) - fondoIeri + Number(r.fondo_cassa)
}

/** Totali per valuta di un elenco di incassi del ristorante. */
export function totaliIncassi(incassi) {
  const righe = conFondoIeri(incassi)
  const somma = (campo) => incassi.reduce((a, r) => a + Number(r[campo] || 0), 0)
  return {
    eurSala: righe.reduce((a, x) => a + eurSalaReale(x), 0),
    egpContanti: somma('egp_contanti'),
    egpPos: somma('egp_pos'),
    usd: somma('usd_contanti'),
    deliveryEur: somma('delivery_eur'),
    deliveryEgp: somma('delivery_egp'),
    persone: somma('numero_persone'),
    serate: incassi.length,
  }
}

/** Totali per valuta delle entrate del chioschetto. */
export function totaliChioschetto(righe) {
  const somma = (campo) => righe.reduce((a, r) => a + Number(r[campo] || 0), 0)
  return {
    eur: somma('eur_contanti') + somma('bonifici'),
    egpContanti: somma('egp_contanti'),
    egpPos: somma('egp_pos'),
    usd: somma('usd_contanti'),
    giorni: righe.length,
  }
}
