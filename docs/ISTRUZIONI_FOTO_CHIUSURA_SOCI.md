# 📋 Istruzioni — foto, chiusura con date, soci separati dalla cassa

## ⚠️ PRIMA DI TUTTO: una correzione importante

Nella sessione scorsa ho commesso un errore nella **migrazione 22
(chioschetto)**. Riscrivendo il calcolo del saldo cassa sono partito da una
versione vecchia, e così ho tolto per sbaglio tre cose:

1. **Il filtro sul periodo aperto** → il saldo mostrava il totale di *sempre*
   invece che quello del periodo corrente. La chiusura periodo diventava di
   fatto inutile.
2. **La distinzione contanti/POS sulle uscite** → le uscite pagate col POS
   tornavano a essere scalate dai contanti.
3. **I versamenti e gli incassi Sadiki** → non venivano più contati nel saldo.

**Se hai già eseguito la migrazione 22, il saldo cassa che vedi adesso è
sbagliato.** La migrazione 23 qui sotto rimette tutto a posto. Non perdi
nessun dato: si tratta solo del calcolo, i movimenti sono tutti al loro posto.

Mi scuso: avrei dovuto controllare le migrazioni successive alla 08 prima di
riscrivere quella vista.

---

## PASSO 1 — Supabase (SQL Editor), in quest'ordine

Esegui i file uno alla volta, aspettando "Success" prima di passare al
successivo.

| Ordine | File | A cosa serve |
|---|---|---|
| 1️⃣ | `migrazione_23_fix_saldo_chioschetto.sql` | **Correzione urgente** del saldo cassa |
| 2️⃣ | `migrazione_24_storage_foto.sql` | Sistema le foto (il motivo per cui non si vedono) |
| 3️⃣ | `migrazione_25_chiusura_date_scelte.sql` | Chiusura periodo con date scelte da te |
| 4️⃣ | `migrazione_26_versamenti_soci.sql` | Versamenti dei soci, fuori dalla cassa |

Se uno dà errore, fermati e mandami il messaggio prima di proseguire.

## PASSO 2 — GitHub

**File NUOVO:**
- `src/lib/foto.js`

**File MODIFICATI:**
- `src/pages/Soci.jsx`
- `src/pages/Cassa.jsx`
- `src/pages/Uscite.jsx`
- `src/pages/Sadiki.jsx`

---

## 1. Le foto

**Perché non si vedevano:** l'app carica i file nell'archivio "foto" e poi usa
un link pubblico. Se l'archivio non è impostato come *pubblico*, il file viene
caricato ma il link non apre niente — esattamente il problema che avevi.

**Cosa ho fatto:**
- La **migrazione 24** rende l'archivio pubblico in lettura, toglie i limiti sui
  tipi di file (così passano anche i PDF e le foto da iPhone) e alza il limite
  di dimensione a 15 MB.
- Le foto ora vengono **rimpicciolite automaticamente prima di essere caricate**
  (lato più lungo 1600 pixel). Una foto da 6 MB diventa circa 300 KB: si carica
  molto più in fretta con la connessione del ristorante, e si legge uguale.
- Se un caricamento fallisce, ora compare **un messaggio che dice il perché**
  (file troppo grande, permessi mancanti, connessione assente...) invece di un
  avviso generico. In Sadiki, prima, un errore non veniva segnalato affatto.

Le foto dei **dipendenti** restano com'erano (salvate dentro il database):
funzionano già e cambiarle avrebbe richiesto una migrazione dei dati esistenti.

## 2. Chiusura periodo con date scelte

Sia in **Cassa** sia in **Spese soci**, nel riquadro di chiusura trovi ora
"Periodo da chiudere" con **Dal giorno** e **Al giorno**.

- Se le lasci **vuote**: funziona esattamente come prima (chiude tutto).
- Se le compili: viene chiuso solo ciò che rientra in quei giorni. Tutto il
  resto **non va perso**, passa automaticamente al periodo nuovo.

Esempio: hai incassi dal 1 al 20 giugno ma vuoi chiudere solo fino al 15 →
metti 1/6 e 15/6. I giorni dal 16 al 20 restano aperti nel periodo nuovo.

## 3. Spese soci separate dalla cassa

**Una precisazione importante:** ho controllato il database, e le **spese dei
soci non hanno mai toccato la cassa**. Non c'è nessun collegamento tra le due
cose: nessuna spesa socio è mai entrata nel saldo del direttore. Quindi da
questo lato eri già a posto.

Il punto di contatto vero era un altro: **i contanti che i soci mettono**.
L'unico modo di registrarli era il "Versamento" dentro la Cassa, che fa
aumentare subito il saldo del direttore.

**Cosa ho aggiunto:** in fondo alla pagina Spese soci c'è ora una sezione
**"Versamenti dei soci"**, dove si registrano i contanti messi dai soci con
tanto di foto/PDF allegato. Questi versamenti:

- **non entrano nel saldo della Cassa**
- **non compaiono nella sezione Cassa**
- restano nella contabilità soci, col loro periodo

Ogni versamento ha un promemoria "Non ancora riportato in Cassa" / "Già
riportato", che puoi spuntare quando lo inserisci a mano in Cassa. Serve solo
a te per non perdere il conto: non ha nessun effetto sui saldi.

---

## Dopo il deploy, controlla queste tre cose

1. **Cassa** → il saldo deve essere quello del periodo corrente (non di sempre).
2. **Uscite** → allega una foto a un'uscita di prova e riaprila: deve vedersi.
3. **Spese soci** → in fondo alla pagina deve comparire "Versamenti dei soci".
