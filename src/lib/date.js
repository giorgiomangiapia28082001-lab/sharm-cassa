// Utility per le date, pensate per evitare il bug classico di JavaScript:
// new Date(...).toISOString() converte in UTC, e per chi vive in un fuso
// orario avanti rispetto a UTC (es. Europa, Egitto) questo può "spostare"
// la data al giorno prima. Qui costruiamo le stringhe sempre usando i
// valori LOCALI (anno/mese/giorno), senza passare da toISOString().

export function oggiLocale() {
  const d = new Date()
  const anno = d.getFullYear()
  const mese = String(d.getMonth() + 1).padStart(2, '0')
  const giorno = String(d.getDate()).padStart(2, '0')
  return `${anno}-${mese}-${giorno}`
}

// Fino a quest'ora del mattino si sta ancora chiudendo la serata di ieri.
const ORA_FINE_SERATA = 5

/**
 * Il giorno a cui appartiene quello che si registra adesso: la serata finisce
 * dopo mezzanotte, quindi prima delle 5 del mattino è ancora "ieri".
 * Prima l'app proponeva il giorno di calendario e quasi ogni notte la data
 * andava corretta a mano; quando ci si dimenticava, la serata finiva sul
 * giorno dopo (doppioni e giorni vuoti).
 */
export function giornataServizio() {
  const d = new Date()
  if (d.getHours() < ORA_FINE_SERATA) d.setDate(d.getDate() - 1)
  const anno = d.getFullYear()
  const mese = String(d.getMonth() + 1).padStart(2, '0')
  const giorno = String(d.getDate()).padStart(2, '0')
  return `${anno}-${mese}-${giorno}`
}

/** Il giorno dopo una data 'AAAA-MM-GG', nello stesso formato. */
export function giornoDopo(data) {
  const [a, m, g] = String(data).split('-').map(Number)
  const d = new Date(a, m - 1, g + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 'AAAA-MM-GG' → es. "lun 27 ott". */
export function giornoLeggibile(data) {
  const [a, m, g] = String(data).split('-').map(Number)
  return new Date(a, m - 1, g).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function primoGiornoMeseLocale(d = new Date()) {
  const anno = d.getFullYear()
  const mese = String(d.getMonth() + 1).padStart(2, '0')
  return `${anno}-${mese}-01`
}

// Confronto sicuro tra due stringhe (es. created_at o data) da usare dentro
// .sort(). Se un valore è null/undefined (capita con righe importate a mano o
// inserite via SQL, dove created_at può mancare), localeCompare andrebbe in
// errore e farebbe diventare bianca l'intera pagina. Qui trattiamo il valore
// mancante come stringa vuota, così l'ordinamento regge sempre.
export function confrontaStringhe(a, b) {
  return String(a || '').localeCompare(String(b || ''))
}
