# CLAUDE.md – istruzioni per Claude su questo progetto

Questo file viene letto automaticamente da Claude Code all'inizio di ogni sessione.
Il contesto completo (com'è fatta l'app, stato del database, problemi aperti,
registro delle modifiche) è in `RIASSUNTO.md`: leggilo sempre prima di iniziare.

## Come lavorare qui
- Rispondi all'utente in **italiano**, in modo semplice: non è un programmatore.
  Scrive spesso da telefono con errori di battitura: interpreta con buon senso.
  Spiega **cosa** cambia e **perché**, non come è scritto il codice.
- App: React + Vite, dati su Supabase. Ogni push su `main` ripubblica l'app su
  Vercel da solo (circa 1 minuto): https://sharm-cassa.vercel.app
- **Regola di pubblicazione (vale sia in cloud sia da PC):** lavora sempre su un ramo
  separato, mai direttamente su `main`. Salva il lavoro su quel ramo (commit e push sul
  ramo) così non si perde. Quando un gruppo di modifiche è finito e provato, riassumi in
  poche righe cosa cambia e chiedi all'utente: "Posso pubblicare?". Solo dopo il suo sì
  porta le modifiche su `main` (che aggiorna l'app vera).
- **Dopo ogni modifica pubblicata aggiorna `RIASSUNTO.md`**: aggiungi una riga in cima
  al "Registro modifiche" (data, cosa è cambiato, eventuale migrazione) e correggi le
  altre sezioni se non sono più vere. È così che il lavoro continua da altri dispositivi.
- **Database:** è il progetto Supabase **sharm-cassa** (`samrgkyvhfzpsujzfumw`).
  Esiste anche il progetto "garage giorgio" (`kopbioghepugymwgukzn`): non confonderli mai.
  - I calcoli importanti (saldo cassa, stipendi, periodi) stanno in viste e funzioni
    PostgreSQL, non nel frontend: prima di cambiare un calcolo guarda nel database.
  - Prima di riscrivere una vista o funzione, controlla **tutte** le migrazioni che la
    ridefiniscono (vedi l'errore della migrazione 22 in `RIASSUNTO.md`).
  - Ogni cambio al database va in un nuovo file `database/migrazione_NN_nome.sql`
    (numerazione progressiva), scritto in modo da poter essere rieseguito senza danni.
    Prima di applicarlo sul database vero chiedi conferma all'utente.
  - Per capire un calcolo che non torna non tirare a indovinare: leggi i dati veri con
    una query di sola lettura. Se l'utente deve incollarla nel SQL Editor di Supabase,
    falla come **query unica** (`union all`): l'editor mostra solo l'ultimo risultato.
- **Provare in locale:** `npm install`, poi `npm run dev` (porta 5173). Serve un file
  `.env` (vedi `.env.example`) con URL e chiave pubblica del progetto Supabase
  sharm-cassa; non va mai caricato su GitHub. Attenzione: in locale l'app usa i
  **dati veri**, quindi non inserire dati di prova senza chiederlo.
- Prima di pubblicare, controlla che `npm run build` riesca e che la pagina non dia
  errori nella console del browser.
- Vercel: il connettore Vercel di Claude NON ha accesso al team `mp-g01` (errore 403).
  Lo stato dei deploy si vede su vercel.com oppure dai controlli del commit su GitHub.
