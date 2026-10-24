# Riassunto del progetto – Sharm Cassa (ristorante a Sharm el-Sheikh)

Aggiornato al 24/10/2026. Si legge direttamente dal repository (questo file è
`RIASSUNTO.md`) oppure si incolla in una nuova chat con Claude.
Va aggiornato dopo ogni modifica: vedi il **Registro modifiche** in fondo.

---

## 1. Cos'è
Web app per la contabilità di un ristorante a Sharm el-Sheikh (Egitto).
Gestisce incassi, spese, cassa multi-valuta, dipendenti, clienti B2B e
contabilità dei soci.

**Multi-valuta:** EUR, EGP (lire egiziane, valuta principale), USD.
Il POS incassa sempre in EGP.

## 2. Account e accessi
- **App online:** https://sharm-cassa.vercel.app
- **GitHub:** repo `giorgiomangiapia28082001-lab/sharm-cassa` (⚠️ al momento **pubblico**).
  Sul PC di casa c'è la GitHub CLI (`gh`) già collegata; copia di lavoro in
  `Desktop\ai\sharm-cassa`.
- **Vercel:** team `mp-g01` (`team_bPbaCNNcGjiMWDGHUm9bowUd`), progetto `sharm-cassa`.
  Deploy automatico a ogni push su `main`. Il connettore Vercel di Claude non ha
  accesso a questo team (403).
- **Supabase:** progetto **sharm-cassa** (`samrgkyvhfzpsujzfumw`, eu-west-1),
  organizzazione `gaifujccslzyrlylovmg`. Archivio file: Storage, bucket `foto`.
- `api/keepalive.js` + cron giornaliero in `vercel.json` tengono sveglio Supabase.

## 3. Come è fatta
| Parte | Tecnologia |
|---|---|
| Frontend | React + Vite (`src/`) |
| Grafici | Recharts |
| Backend | Supabase (PostgreSQL con RLS) |
| Archivio file | Supabase Storage, bucket `foto` |
| Deploy | Vercel (automatico dal push su `main`) |

File principali:
- `src/lib/supabase.js` → connessione al database (legge `.env`)
- `src/lib/AuthContext.jsx` → login e ruoli
- `src/lib/foto.js` → rimpicciolisce le foto prima del caricamento (lato max 1600 px, JPEG)
- `src/lib/tassi.js` → tassi di cambio in un posto solo
- `src/pages/` → una schermata per sezione
- `src/index.css` → stile, incluse le regole per il telefono
- `database/` → `schema.sql` e tutte le migrazioni numerate
- `docs/` → istruzioni scritte nelle sessioni precedenti (chioschetto, foto, soci)

**Importante:** la logica di calcolo pesante (saldo cassa, stipendi
proporzionali, assegnazione ai periodi) sta in **viste e funzioni
PostgreSQL**, non nel frontend.

### Come si lavora (dal 24/10/2026)
Con **Claude Code**, da PC o da altri dispositivi (Claude Code sul web apre
direttamente questo repository):
- il codice si modifica su un ramo, si prova, e va su `main` solo dopo il sì dell'utente;
- i cambi al database si scrivono come migrazione in `database/` e si applicano su
  Supabase dopo conferma;
- alla fine si aggiorna questo file.

Prima di questa data l'utente lavorava solo da browser (drag & drop della
cartella `src` su GitHub + SQL Editor di Supabase). **Non mischiare i due metodi**:
un caricamento a mano su GitHub può sovrascrivere modifiche fatte da Claude.

## 4. Sezioni dell'app
| Pagina | A cosa serve |
|---|---|
| **Riepilogo** | Statistiche periodo, grafico andamento, tabella giorno-per-giorno con progressivo |
| **Cassa** | Saldo in tempo reale per valuta, cambio valuta, scarico POS, versamenti, chiusura periodo |
| **Incassi serata** | Incasso giornaliero ristorante (una riga al giorno, tutte le valute) |
| **Chioschetto** | Incassi del chiosco (cassa separata, stessi proprietari) |
| **Uscite** | Spese con foto dello scontrino e categorie |
| **Spese fisse** | Voci ricorrenti mensili con spunta di pagamento |
| **Dipendenti** | Presenze, stipendi proporzionali, acconti, riepilogo per periodo |
| **Sadiki** | Clienti B2B: produzioni e pagamenti |
| **Spese soci** | Contabilità soci, separata dalla cassa, con allegati |
| **Impostazioni** | Tassi di cambio e categorie |

Nessuna pagina si aggiorna da sola quando un altro dispositivo inserisce dati:
serve ricaricare la pagina.

### Ruoli utente (tabella `profiles`, colonna `ruolo`)
- **master** — può tutto (unico che può modificare ed eliminare)
- **proprietario** — vede tutto e aggiunge tutto, non modifica né elimina
- **operatore** — inserisce incassi, uscite, presenze, movimenti
- **viewer** — sola lettura

## 5. Concetti da capire prima di toccare qualsiasi cosa

### I periodi
Ogni riga (incasso, uscita, movimento…) viene agganciata al **periodo aperto**
(tabella `periodi_cassa`) nel momento in cui viene registrata, tramite un
trigger `before insert`. La vista `saldo_cassa_attuale` somma **solo le righe
del periodo aperto**.
Alla chiusura: viene fotografato il saldo, il periodo si chiude e **ne viene
aperto uno nuovo**. La chiusura si può annullare (`annulla_chiusura_cassa`).

### Il chioschetto
Contabilità separata (tabella `incassi_chioschetto`, voce distinta nel
Riepilogo), ma i **contanti confluiscono nella cassa del ristorante**:
compare quindi in `saldo_cassa_attuale`.

### Le spese soci
**Non toccano la cassa e non l'hanno mai toccata.** È voluto: servono a tenere
separata la contabilità dei soci da quella del direttore.
I **versamenti soci** (tabella `versamenti_socio`) non entrano nel saldo: è il
master a riportarli a mano in Cassa, con una spunta promemoria. I periodi dei
soci sono in `periodi_soci` (annullabili con `annulla_chiusura_soci`).

## 6. Migrazioni database
I file sono in `database/`. Le 1-21 erano preesistenti; dalla 22 in poi sono
delle sessioni di luglio-settembre 2026.

| N. | Cosa fa | Stato (controllato sul database il 24/10/2026) |
|---|---|---|
| 22 | Chioschetto (tabella + vista) | ⚠️ conteneva un errore, corretto dalla 23 |
| 23 | Correzione vista saldo + chioschetto nei periodi | ✅ eseguita |
| 24 | Storage foto: bucket pubblico, tipi file, limite 15 MB | ✅ bucket `foto` pubblico, limite 15 MB |
| 25 | Chiusura periodo con date scelte dall'utente | da verificare |
| 26 | Versamenti soci | ✅ tabella `versamenti_socio` presente |
| 27 | Annulla chiusura | ✅ funzioni `annulla_chiusura_cassa` e `annulla_chiusura_soci` presenti |
| 28 | Ruolo `proprietario` | ✅ ruolo ammesso e già usato |
| 29 | Recupero righe orfane + prevenzione | da verificare — **file non trovato** |
| 30 | Disattivazione utenti (colonna `attivo`) | ❌ non eseguita (colonna assente) — **file non trovato** |
| 31 | Eliminazione definitiva di un utente | da verificare — **file non trovato** |

I file delle migrazioni 29, 30 e 31 non sono né nel repository né nel PC: se
l'utente li ritrova, vanno aggiunti in `database/`.

### L'errore della migrazione 22 (da sapere)
Riscrivendo `saldo_cassa_attuale` era stata usata come base una versione
vecchia (migrazione 08), perdendo tre cose aggiunte dalle migrazioni 16, 19
e 20: il **filtro per periodo**, la distinzione **contanti/POS** sulle uscite,
e i movimenti **versamento** e **incasso_b2b**. La 23 ha rimesso tutto a posto.
**Lezione:** prima di riscrivere una vista o una funzione, controllare **tutte**
le migrazioni successive che la ridefiniscono.

## 7. ⚠️ PROBLEMA APERTO — saldo cassa tra un periodo e l'altro

### Il sintomo
Il saldo contanti in LE risultava negativo. Lo scarico del POS **funziona**:
il problema è a monte.

### La diagnosi
Alla chiusura di un periodo il saldo **riparte da zero**, ma i contanti nel
cassetto no. Nel periodo nuovo ogni spesa scava sotto zero finché non si
scarica il POS (i clienti pagano molto col POS, le spese si pagano in contanti).
Nel periodo 6: scarico POS 47.025 LE; contanti LE prima dello scarico ≈ −34.871.

### La domanda ancora senza risposta
**Quando si chiude un periodo, i contanti restano nel cassetto o vengono portati via?**
- Se **restano** → serve il **riporto**: alla chiusura il saldo fotografato diventa
  il saldo iniziale del periodo nuovo (colonne `saldo_iniziale_*` su `periodi_cassa`,
  incluse nella vista). Ad oggi queste colonne **non esistono**.
- Se **vengono portati via** → ripartire da zero è corretto: basta registrare un
  versamento con i contanti rimasti.

### Situazione al 24/10/2026
Periodo aperto: **n. 7, dal 01/10/2026**. `saldo_cassa_attuale`:
contanti 7.614 € · 47.285 LE · 80 $; **saldo POS −100.343 LE** (da capire: un saldo
POS negativo vuol dire che sono stati scaricati più soldi di quelli incassati col POS
nel periodo, o che lo scarico è contato in un periodo diverso dagli incassi).

## 8. Altre cose da sapere
- **Foto dipendenti:** salvate come base64 dentro il database. Funzionano, ma andrebbero
  spostate su Storage (serve migrare i dati esistenti).
- **Layout telefono:** l'utente lavora molto da telefono. Già corretti: moduli a una
  colonna, campi data su iOS, pulsanti presenza a tutta larghezza, tabelle che scorrono.
- **Garage:** le 9 tabelle `garage_*` finite per errore nel database del ristorante sono
  state rimosse (verificato: 0 tabelle rimaste).

## 9. Backlog
- **Riporto del saldo tra periodi** (punto 7) — priorità massima
- Capire il saldo POS negativo del periodo 7
- Ritrovare o riscrivere le migrazioni 29-31; eseguire la 30 se serve
- Valutare se rendere **privato** il repository GitHub
- Foto dipendenti da base64 a Supabase Storage
- Paginazione reale al posto dei `.limit()` fissi (60/100)
- Indici sulle colonne `data` e sulle chiavi esterne più filtrate
- Export CSV dei riepiloghi
- Test automatici sui calcoli critici (saldo, stipendi proporzionali)

## 10. Registro modifiche
Le voci più recenti in alto. Una riga per ogni modifica pubblicata.

- **24/10/2026** — Progetto portato su Claude Code. Aggiunti `CLAUDE.md` e questo
  `RIASSUNTO.md`, le migrazioni 01-28 e gli script SQL in `database/`, le vecchie
  istruzioni in `docs/`, `.gitignore` e `.env.example`. Controllato lo stato reale del
  database. Nessun cambio al codice dell'app né al database.
- **22/10/2026** — `api/keepalive.js` + cron giornaliero per tenere attivo Supabase.
- **31/08/2026** — Ruolo `proprietario` (migrazione 28) e relative pagine.
- **12/08/2026** — Foto su Storage, chiusura con date scelte, versamenti soci, annulla
  chiusura (migrazioni 23-27).
- **26/07/2026** — Chioschetto (migrazione 22).
