# Sharm Cassa — Guida di setup e pubblicazione online

Questa guida ti accompagna passo per passo nella pubblicazione del gestionale, anche se non hai esperienza tecnica. In totale richiede 20-30 minuti.

---

## PARTE 1 — Creare il database (Supabase)

1. Vai su **https://supabase.com** e crea un account gratuito (puoi usare Google o GitHub per registrarti più in fretta).
2. Clicca **"New project"**.
   - Nome progetto: `sharm-cassa` (o quello che preferisci)
   - Password del database: scegline una sicura e **salvala da parte**, ti servirà raramente ma è importante.
   - Regione: scegli quella più vicina (es. Europe / Frankfurt).
3. Attendi 1-2 minuti che il progetto venga creato.

### Eseguire lo schema del database

4. Nel menu a sinistra, clicca su **"SQL Editor"**.
5. Clicca **"New query"**.
6. Apri il file `database/schema.sql` (incluso in questo progetto), copia **tutto** il contenuto e incollalo nell'editor.
7. Clicca **"Run"** (in basso a destra). Dovresti vedere "Success" — questo crea tutte le tabelle, le categorie di spesa predefinite e le regole di sicurezza (chi vede cosa).

### Creare lo spazio per le foto (Storage)

8. Nel menu a sinistra, clicca **"Storage"**.
9. Clicca **"New bucket"**, chiamalo esattamente `foto`, e attiva **"Public bucket"** (così le immagini sono visibili nell'app). Clicca **"Create bucket"**.

### Recuperare le chiavi di collegamento

10. Nel menu a sinistra, clicca **"Project Settings"** (icona ingranaggio) → **"API"**.
11. Copia questi due valori, ti serviranno dopo:
    - **Project URL** (es. `https://xxxxx.supabase.co`)
    - **anon public key** (una stringa lunga)

---

## PARTE 2 — Creare gli utenti (Master, Operatore, eventuali Viewer)

12. Nel menu a sinistra, clicca **"Authentication"** → **"Users"** → **"Add user"** → **"Create new user"**.
13. Crea il **tuo** utente Master:
    - Email: la tua email
    - Password: una password sicura
    - Spunta **"Auto Confirm User"**
14. Ripeti per l'utente **Operatore** (es. email del tuo collaboratore).
15. (Eventuale) Ripeti per ogni **Viewer** (proprietari che vogliono solo vedere i report).

### Assegnare il ruolo a ciascun utente

16. Torna su **"SQL Editor"** → **"New query"** e per ognuno degli utenti creati esegui questo comando, sostituendo i valori (l'UUID lo trovi cliccando sull'utente in Authentication → Users):

```sql
insert into profiles (id, nome, ruolo)
values ('UUID-DELL-UTENTE-QUI', 'Nome Visibile', 'master');
-- ruolo può essere: 'master', 'operatore', oppure 'viewer'
```

Esempio concreto:
```sql
insert into profiles (id, nome, ruolo) values
('a1b2c3d4-...', 'Marco (Titolare)', 'master'),
('e5f6g7h8-...', 'Ahmed (Sala)', 'operatore');
```

---

## PARTE 3 — Pubblicare l'app online (Vercel)

17. Vai su **https://vercel.com** e crea un account gratuito (puoi usare GitHub).
18. Se non l'hai già fatto, carica il codice di questo progetto su **GitHub**:
    - Crea un nuovo repository su github.com (es. `sharm-cassa`)
    - Segui le istruzioni di GitHub per caricare i file della cartella di questo progetto (oppure chiedi a un amico/sviluppatore di farlo per te in 5 minuti)
19. Su Vercel, clicca **"Add New" → "Project"**, collega il tuo account GitHub e seleziona il repository appena creato.
20. Prima di cliccare "Deploy", apri la sezione **"Environment Variables"** e aggiungi:

| Nome variabile | Valore |
|---|---|
| `VITE_SUPABASE_URL` | il Project URL copiato al punto 11 |
| `VITE_SUPABASE_ANON_KEY` | l'anon public key copiata al punto 11 |

21. Clicca **"Deploy"**. Dopo circa 1 minuto, Vercel ti darà un link pubblico (es. `https://sharm-cassa.vercel.app`) — è il link che userete tu e il tuo operatore, da telefono o computer, ovunque vi troviate.

---

## PARTE 4 — Primo utilizzo

22. Apri il link dell'app, fai login con l'utente **Master** che hai creato.
23. Vai su **Dipendenti** e inserisci il personale (con foto, stipendio, data inizio).
24. Vai su **Impostazioni** e inserisci i tassi di cambio attuali (€→$, €→LE, €→£).
25. Comunica all'**Operatore** il link dell'app, la sua email e la password che hai impostato per lui: potrà subito iniziare a inserire incassi e uscite da telefono.

---

## Note utili

- **Modificare i tassi di cambio**: solo il Master può farlo, da "Impostazioni" — ogni aggiornamento si applica ai calcoli successivi.
- **Aggiungere/disattivare categorie di spesa**: da "Impostazioni", in basso.
- **Cambiare la password di un utente**: Supabase → Authentication → Users → clicca sull'utente → puoi reimpostare la password.
- **Backup**: Supabase fa backup automatici sul piano gratuito per 7 giorni; per progetti seri valuta in futuro un piano a pagamento (pochi euro al mese) per backup più lunghi.
- Se qualcosa non funziona, il primo posto dove guardare è la console del browser (tasto destro → "Ispeziona" → tab "Console") che mostra eventuali errori di collegamento.
