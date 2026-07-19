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
