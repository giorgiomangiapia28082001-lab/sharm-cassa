# 🔧 Correzioni applicate — sessione del 20 luglio 2026

Questo documento elenca le modifiche fatte in questa sessione, a partire dallo
stato descritto in `RIEPILOGO_PROGETTO_STATO_ATTUALE.md`.

---

## 1. Crash da `.single()` → `.maybeSingle()` (RISOLTO)

`.single()` va in errore se la query non trova righe. Sostituito con
`.maybeSingle()` (che restituisce `null` invece di lanciare) in:

- `src/lib/AuthContext.jsx` — profilo utente senza ruolo assegnato
- `src/pages/Dipendenti.jsx` — periodo cassa aperto (assente subito dopo una chiusura)
- `src/pages/Soci.jsx` — periodo soci aperto

Prima queste pagine potevano diventare bianche in assenza di un periodo aperto.

## 2. Ordinamento null-safe su `created_at` (RISOLTO)

Nuova funzione `confrontaStringhe()` in `src/lib/date.js`: se `created_at` è
`null` (righe importate a mano o inserite via SQL), `localeCompare` lanciava un
errore che rendeva bianca l'intera pagina. Applicata in:

- `src/pages/Incassi.jsx` (calcolo fondo cassa)
- `src/pages/Riepilogo.jsx` (calcolo incasso reale + grafico)

## 3. Tassi di cambio centralizzati (RISOLTO)

Nuovo file `src/lib/tassi.js` con un'unica fonte di verità:

- `TASSI_DEFAULT` — stesso valore di partenza per tutte le pagine (era 55 in
  Incassi/Cassa e 60 in Riepilogo: ora tutti 60).
- `caricaTassi()` / `useTassi()` / `tassiSicuri()` — helper condivisi.
- **`src/pages/Uscite.jsx`**: il riepilogo per categoria non usa più i numeri
  fissi `55` e `1.08` scritti nel codice, ma i tassi reali impostati in
  Impostazioni. Prima il totale in EUR delle uscite era sbagliato appena il
  cambio reale cambiava.

Allineato anche il default in `Cassa.jsx` e `Incassi.jsx` a 60.

## 4. Collisione nome file foto in Sadiki (RISOLTO)

`src/pages/Sadiki.jsx`: il path della foto ora include una parte casuale
(`Date.now()-random`), come già faceva Uscite. Prima due upload nello stesso
millisecondo potevano sovrascriversi.

## 5. Sistema toast + `esegui()` esteso a tutte le pagine (RISOLTO)

Tutte le scritture (insert/update/delete) ora passano dal wrapper `esegui()`
con notifiche toast di successo/errore, e — soprattutto — **controllano
sempre l'esito**. Prima molte operazioni usavano `alert()` grezzo o non
controllavano affatto l'errore. Pagine aggiornate:

- `src/pages/Uscite.jsx`
- `src/pages/Dipendenti.jsx` — incluse **le presenze** (P / ½ / A / Mattina),
  che prima non controllavano l'errore: se la rete cadeva mentre segnavi una
  presenza, il dato spariva senza avviso.
- `src/pages/Sadiki.jsx`
- `src/pages/Soci.jsx`
- `src/pages/SpeseFisse.jsx`
- `src/pages/Impostazioni.jsx`

Ora Incassi, Cassa e tutte le altre pagine si comportano allo stesso modo:
avviso chiaro se la rete è assente e conferma verde quando il salvataggio va a
buon fine.

---

## File modificati in questa sessione

```
NUOVO:
src/lib/tassi.js

MODIFICATI:
src/lib/date.js          (nuova funzione confrontaStringhe)
src/lib/AuthContext.jsx  (maybeSingle)
src/pages/Incassi.jsx    (ordinamento null-safe + default tassi 60)
src/pages/Cassa.jsx      (default tassi 60)
src/pages/Riepilogo.jsx  (ordinamento null-safe)
src/pages/Uscite.jsx     (tassi reali + toast/esegui)
src/pages/Dipendenti.jsx (maybeSingle + toast/esegui su tutto, presenze incluse)
src/pages/Sadiki.jsx     (path foto anticollisione + toast/esegui)
src/pages/Soci.jsx       (maybeSingle + toast/esegui)
src/pages/SpeseFisse.jsx (toast/esegui)
src/pages/Impostazioni.jsx (toast/esegui)
```

## Verifica

- Nessun `.single()` pericoloso residuo.
- Nessun `alert()` grezzo residuo (restano solo il fallback interno del Toast e
  un commento).
- Parentesi bilanciate in tutti i file (verifica statica superata).
- Il build `vite build` non è stato eseguito in questo ambiente per assenza di
  rete: va lanciato in locale prima del deploy (vedi istruzioni).

## Ancora da fare (backlog invariato)

- Migrare le foto (dipendenti) da base64-nel-DB a Supabase Storage.
- Paginazione reale al posto dei `.limit()` fissi.
- Indici DB su colonne `data` e foreign key filtrate.
- Export CSV, test automatici sui calcoli critici.
