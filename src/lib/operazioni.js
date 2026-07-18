// ============================================================================
// Wrapper per le operazioni di scrittura su Supabase (insert/update/delete).
//
// Prima ogni pagina ripeteva a mano:
//   const { error } = await supabase.from(...).insert(...)
//   if (!error) { ... } else { alert('Errore: ' + error.message) }
// ...ma quasi mai lo faceva, quindi la maggior parte delle scritture non
// segnalava nulla in caso di fallimento (specialmente per rete assente,
// dove la Promise va in "reject" invece che restituire { error }).
//
// Questa funzione centralizza la gestione:
// - Rileva la mancanza di rete (fetch che fallisce a livello di trasporto)
//   e mostra un messaggio chiaro, invece di un errore tecnico incomprensibile.
// - Mostra comunque gli errori del database (permessi, vincoli, ecc.)
// - Restituisce sempre { data, error } così le pagine possono continuare
//   a controllare l'esito come già facevano.
// ============================================================================

/**
 * Esegue una query/mutazione Supabase mostrando un toast in caso di errore.
 *
 * @param {Promise} promise - la Promise restituita da supabase.from(...)...
 * @param {object} toast - istanza di useToast()
 * @param {string} contesto - descrizione breve dell'azione, es. "il salvataggio dell'incasso"
 * @param {object} [opzioni]
 * @param {boolean} [opzioni.silenzioso] - se true non mostra toast di successo/errore (solo lo ritorna)
 */
export async function esegui(promise, toast, contesto = 'operazione', opzioni = {}) {
  try {
    const risultato = await promise
    if (risultato?.error) {
      if (!opzioni.silenzioso) {
        toast.error(`Errore durante ${contesto}: ${risultato.error.message}`)
      }
      return risultato
    }
    return risultato
  } catch (err) {
    const messaggioRete = rilevaErroreRete(err)
    if (!opzioni.silenzioso) {
      if (messaggioRete) {
        toast.error(`Connessione assente: ${contesto} non è andato a buon fine. I dati NON sono stati salvati — riprova quando la rete torna disponibile.`, 10000)
      } else {
        toast.error(`Errore imprevisto durante ${contesto}. Riprova tra poco.`)
      }
    }
    return { data: null, error: err }
  }
}

/** Riconosce i pattern tipici di un fallimento di rete (fetch non riuscito). */
function rilevaErroreRete(err) {
  if (!err) return false
  const msg = (err.message || '').toLowerCase()
  return (
    err.name === 'TypeError' && msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    !navigator.onLine
  )
}

/** Da usare all'avvio di ogni pagina o dopo un evento di reconnessione,
 * per avvisare in modo proattivo se il browser risulta offline. */
export function avvisaSeOffline(toast) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    toast.warning('Sei offline: i dati mostrati potrebbero non essere aggiornati e i salvataggi non funzioneranno finché la connessione non torna.', 10000)
  }
}
