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
