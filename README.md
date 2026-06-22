# Sharm Cassa — Gestionale Ristorante

App web per la gestione della cassa serale, delle uscite, dei dipendenti e delle spese dei soci, con tre livelli di accesso:

- **Master** — vede e modifica tutto.
- **Operatore** — inserisce incassi serata, uscite, presenze e acconti dipendenti; vede solo i propri inserimenti.
- **Viewer** (proprietari) — sola visualizzazione dei riepiloghi generali.

## Stack tecnico
- **Frontend**: React + Vite
- **Backend**: Supabase (database Postgres, autenticazione, storage foto)
- **Deploy**: Vercel

## Avvio in locale (per sviluppatori)

```bash
npm install
cp .env.example .env   # poi inserisci le tue chiavi Supabase
npm run dev
```

## Pubblicazione online

Segui la guida passo-passo in **`GUIDA_SETUP.md`** — non richiede competenze tecniche avanzate.

## Struttura del progetto

```
database/schema.sql     → schema completo del database (tabelle + permessi)
src/lib/supabase.js      → connessione al database
src/lib/AuthContext.jsx  → gestione login e ruoli
src/pages/               → tutte le schermate dell'app
GUIDA_SETUP.md           → guida di pubblicazione passo-passo
```
