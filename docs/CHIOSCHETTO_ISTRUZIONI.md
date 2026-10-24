# ☕ Nuova sezione "Chioschetto" — istruzioni

Il chioschetto è una cassa **separata** degli stessi proprietari. Le sue entrate
si registrano una riga al giorno (come gli Incassi serata), con le tre valute
(EUR / EGP / USD) e il POS in Lire. La contabilità resta separata (nel Riepilogo
vedi quanto rende il chioschetto da solo), ma i suoi **contanti confluiscono
nella cassa del ristorante**, quindi il saldo cassa li include.

---

## ⚠️ IMPORTANTE: due passaggi, in quest'ordine

Questa modifica tocca **anche il database**, non solo l'app. Vanno fatti tutti e
due i passaggi, prima Supabase e poi GitHub.

### PASSO 1 — Database (Supabase)

1. Apri il tuo progetto su **supabase.com**.
2. Menu a sinistra → **SQL Editor** → **New query**.
3. Apri il file `database/migrazione_22_chioschetto.sql` (nello zip), copia
   **tutto** il contenuto e incollalo nell'editor.
4. Premi **Run** (in basso a destra).
5. Deve comparire "Success. No rows returned". Se dà errore, fermati e mandami
   il messaggio: **non caricare i file su GitHub finché il DB non è a posto**,
   altrimenti la pagina Chioschetto darà errore perché la tabella non esiste.

Questa migrazione crea la tabella `incassi_chioschetto` e aggiorna la vista del
saldo cassa. Non tocca né cancella nulla di esistente.

### PASSO 2 — App (GitHub)

Carica su GitHub questi file (drag & drop della cartella `src`, come al solito).

**File NUOVO:**
- `src/pages/Chioschetto.jsx`

**File MODIFICATI:**
- `src/App.jsx`            (aggiunta la rotta /chioschetto)
- `src/pages/Layout.jsx`   (aggiunta la voce di menu "Chioschetto")
- `src/pages/Riepilogo.jsx`(mostra il chioschetto nel totale e nel dettaglio)

Committa su **main**, aspetta che Vercel diventi verde, e la nuova voce
"Chioschetto" comparirà nel menu a sinistra, subito sotto "Incassi serata".

---

## Cosa vedrai

- **Menu**: nuova voce ☕ Chioschetto.
- **Pagina Chioschetto**: modulo per inserire l'entrata del giorno (contanti €,
  bonifici €, POS LE, contanti LE, contanti $) + storico, esattamente come
  Incassi ma senza delivery, fondo cassa e numero persone.
- **Cassa**: il saldo dei contanti (e del POS) ora comprende anche il
  chioschetto. Non c'è nessuna schermata nuova qui: i soldi si sommano e basta.
- **Riepilogo**: la card "Incassi totali" ora è ristorante + chioschetto;
  sotto trovi due card separate "di cui Ristorante" e "di cui Chioschetto".
  Nel "Dettaglio per valuta" c'è una nuova colonna Chioschetto.

## Permessi (uguali agli incassi)

- **Master**: inserisce, modifica, elimina.
- **Operatore**: inserisce.
- **Viewer** (sola visione): vede tutto, non modifica.

## Una nota sul "Target giornaliero"

Il riquadro Target giornaliero (nel Riepilogo, visibile solo al Master) continua
a basarsi sui soli incassi del **ristorante**, non del chioschetto. L'ho lasciato
così di proposito, perché quel target serve a coprire le spese del ristorante.
Se preferisci che il target consideri anche gli incassi del chioschetto, dimmelo
e lo cambio: è una riga sola.
