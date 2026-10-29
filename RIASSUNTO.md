# Riassunto del progetto – Sharm Cassa (ristorante a Sharm el-Sheikh)

Aggiornato al 29/10/2026. Si legge direttamente dal repository (questo file è
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
| **Riepilogo** | Statistiche del periodo, grafico andamento, target giornaliero |
| **Cassa** | Saldo del periodo in corso per valuta, cambio valuta, scarico POS, chiusura periodo. **Solo master:** versamenti in cassa e "Rettifica cassa" (si scrive quanto c'è davvero; la differenza diventa un movimento `rettifica`) |
| **Archivio periodi** | Una "cartella" per periodo: entrate, uscite per categoria, acconti, movimenti, saldo; link per correggere le voci |
| **Incassi serata** | Incasso giornaliero ristorante (una riga al giorno, tutte le valute) |
| **Chioschetto** | Incassi del chiosco (cassa separata, stessi proprietari) |
| **Uscite** | Spese con foto dello scontrino e categorie |
| **Spese fisse** | Voci ricorrenti mensili con spunta di pagamento |
| **Dipendenti** | Presenze, stipendi proporzionali, acconti, riepilogo per periodo |
| **Inventario** | Articoli in magazzino, giacenza (= ultimo conteggio), scorta minima, valore; "Fai l'inventario" conta tutto insieme. Non tocca la cassa |
| **Spese soci** | Contabilità soci, separata dalla cassa, con allegati |
| **Impostazioni** | Tassi di cambio e categorie |

La sezione **Sadiki** (clienti B2B) è stata tolta il 24/10/2026: le tabelle
`clienti_b2b`, `produzioni_b2b`, `pagamenti_b2b` e i movimenti `incasso_b2b`
restano nel database, così i totali dei periodi passati non cambiano.

**Tutto per periodo:** Riepilogo, Incassi, Uscite, Chioschetto e i movimenti in
Cassa mostrano il periodo in corso; in alto c'è lo stesso menu per passare a un
periodo passato (indirizzo `?periodo=<id>`, codice in `src/lib/periodi.jsx`).
Su un periodo chiuso si possono correggere le voci ma non aggiungerne di nuove.
I calcoli sugli incassi (fondo cassa) sono in `src/lib/calcoli.js`, condivisi da
Riepilogo, Incassi e Archivio.

Nessuna pagina si aggiorna da sola quando un altro dispositivo inserisce dati:
serve ricaricare la pagina.

### Ruoli utente (tabella `profiles`, colonna `ruolo`)
- **master** — può tutto (unico che può modificare ed eliminare)
- **proprietario** — vede tutto e aggiunge tutto, non modifica né elimina
- **operatore** — inserisce incassi, uscite, presenze, movimenti; vede tutti gli
  incassi e le uscite, anche degli altri (visione comune, migrazione 38). Il nome
  di chi ha inserito le righe altrui gli resta vuoto (`profiles` la vedono solo
  master e proprietario)
- **viewer** — sola lettura

## 5. Concetti da capire prima di toccare qualsiasi cosa

### I periodi
Ogni riga (incasso, uscita, movimento…) viene agganciata al **periodo aperto**
(tabella `periodi_cassa`) nel momento in cui viene registrata, tramite un
trigger `before insert`. La vista `saldo_cassa_attuale` somma **solo le righe
del periodo aperto**.
Alla chiusura: viene fotografato il saldo, il periodo si chiude e **ne viene
aperto uno nuovo**, che riparte da 0 (scelta dell'utente del 24/10/2026: a ogni
chiusura tutto si azzera, niente riporto). Il periodo chiuso va in Archivio.
L'ultima chiusura si può annullare (`annulla_chiusura_cassa`).

Il saldo di qualsiasi periodo si calcola con `saldo_periodo_cassa(id)`; la vista
`saldo_cassa_attuale` la usa per il periodo aperto. **La formula del saldo sta
solo lì** (migrazione 32).

### Il chioschetto
Contabilità separata (tabella `incassi_chioschetto`, voce distinta nel
Riepilogo), ma i **contanti confluiscono nella cassa del ristorante**:
compare quindi in `saldo_cassa_attuale`.

### Le rettifiche
Quando il conteggio vero non torna, il master usa "Rettifica cassa": per ogni voce
(contanti €/LE/$, POS) viene salvato un movimento `rettifica` con la **differenza**
(anche negativa). Contanti: `valuta_a` + `importo_a`; POS: `importo_pos` con
`valuta_a` vuota. Il saldo le somma (migrazione 36). Non si modificano: se sbagliata,
si elimina e se ne fa un'altra.

### Il fondo cassa (migrazione 37)
Il fondo cassa € di una serata resta nel cassetto: si conta nell'incasso di quella
serata e si toglie la serata dopo (i contanti contati la sera dopo lo comprendono
già). Pagine e `saldo_periodo_cassa` usano la stessa regola. Il "fondo di ieri"
della prima serata di un periodo è quello dell'ultima serata del periodo prima
(`fondo_prima_del_periodo`).

### Le date delle serate
Gli incassi si inseriscono di notte: **fino alle 5 del mattino** l'app propone la
serata appena finita (incassi, chioschetto, uscite, presenze, acconti, movimenti;
`src/lib/date.js`). Se la data scelta non è il giorno dopo l'ultima serata o c'è
già, l'app avvisa e chiede conferma (`controlla_data_serata`, migrazione 37).

### Le giornate parziali dei dipendenti
**Contano 0** sia nello stipendio del mese sia nel Riepilogo per periodo (deciso
il 29/10/2026). Sono elencate a parte, con le date, per decidere caso per caso.

### I soci
Sono **tre**: Gianluigi, Luca e Giorgio (tabella `soci`). Il valore `erogato_da` degli
acconti accetta `direttore`, `gianluigi`, `luca`, `giorgio`: se l'acconto lo dà un
socio, `crea_uscita_da_acconto` crea anche la sua spesa socio. Per un socio nuovo
servono: riga in `soci`, il vincolo `acconti_erogato_da_check`, la funzione
`crea_uscita_da_acconto` e il menu "Chi ha dato i soldi" in `Dipendenti.jsx`.

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
| 32 | Saldo per qualsiasi periodo (`saldo_periodo_cassa`) + indici sul periodo | ✅ eseguita il 24/10/2026, saldi identici a prima |
| 33 | Funzioni del database solo per chi ha fatto l'accesso | ✅ eseguita il 24/10/2026 |
| 34 | Acconti nel periodo giusto alla chiusura + correzione di 11 acconti di ottobre | ✅ eseguita il 24/10/2026 |
| 35 | Inventario: tabelle `inventario_articoli` e `inventario_conteggi` con permessi | ✅ eseguita il 24/10/2026, permessi provati per ogni ruolo |
| 36 | Movimento `rettifica` nel saldo; versamenti e rettifiche solo master; socio Giorgio (anche negli acconti) | ✅ eseguita il 25/10/2026, saldi identici, permessi provati |
| 38 | L'operatore vede tutti gli incassi, chioschetto e uscite (solo lettura) | ✅ eseguita il 29/10/2026, provata come operatore: vede 115 incassi, 86 chioschetto, 1.395 uscite; spese soci sempre nascoste |
| 37 | Fondo cassa con una sola formula nel saldo; `fondo_prima_del_periodo`; `controlla_data_serata` | ✅ eseguita il 29/10/2026: contanti € periodo 7 da 9.586,50 a 9.468,00 (−118,50), il resto identico; i periodi chiusi tengono la foto salvata |

I file delle migrazioni 29, 30 e 31 non sono né nel repository né nel PC: se
l'utente li ritrova, vanno aggiunti in `database/`.

### L'errore della migrazione 22 (da sapere)
Riscrivendo `saldo_cassa_attuale` era stata usata come base una versione
vecchia (migrazione 08), perdendo tre cose aggiunte dalle migrazioni 16, 19
e 20: il **filtro per periodo**, la distinzione **contanti/POS** sulle uscite,
e i movimenti **versamento** e **incasso_b2b**. La 23 ha rimesso tutto a posto.
**Lezione:** prima di riscrivere una vista o una funzione, controllare **tutte**
le migrazioni successive che la ridefiniscono.

## 7. Saldo cassa tra un periodo e l'altro

**Deciso il 24/10/2026:** alla chiusura tutto riparte da 0 (risposta alla
domanda qui sotto: niente riporto). La spiegazione resta per capire perché i
contanti in LE possono andare sotto zero a inizio periodo.

### Il sintomo
Il saldo contanti in LE risultava negativo. Lo scarico del POS **funziona**:
il problema è a monte.

### La diagnosi
Alla chiusura di un periodo il saldo **riparte da zero**, ma i contanti nel
cassetto no. Nel periodo nuovo ogni spesa scava sotto zero finché non si
scarica il POS (i clienti pagano molto col POS, le spese si pagano in contanti).
Nel periodo 6: scarico POS 47.025 LE; contanti LE prima dello scarico ≈ −34.871.

### La domanda (risolta: si riparte da zero)
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
Verificato: nel periodo 7 gli scarichi POS sono 358.500 LE contro 258.157 LE di
incassi POS; una parte sono i 57.092 LE rimasti sul POS a fine periodo 6. Con
l'azzeramento a ogni chiusura succede ogni volta che si scarica il POS di un
periodo nel periodo dopo.

### Saldo POS: come si procede (deciso il 29/10/2026)
Non è un errore di calcolo: dall'inizio il POS fa in tutto +9.487 LE (al 28/10).
Il negativo nasce dai residui rimasti sul POS alla chiusura (31.234 LE a fine
periodo 1, 57.092 LE a fine periodo 6). L'utente, dopo ogni chiusura, registra a
mano quanto è rimasto sul POS: **Cassa → Rettifica cassa → solo la casella "Saldo
POS"** (non il fondo cassa, che è in euro). La rettifica cambia il saldo ma non è
un'entrata. Facoltativo, se serve: promemoria in Cassa con il residuo POS del
periodo prima.

## 8. Altre cose da sapere
- **Foto dipendenti:** salvate come base64 dentro il database. Funzionano, ma andrebbero
  spostate su Storage (serve migrare i dati esistenti).
- **Layout telefono:** l'utente lavora molto da telefono. Sotto gli 860 px il menu è
  una barra in alto con ☰ e un pannello laterale (`Layout.jsx` + `index.css`).
  Regole da rispettare nelle pagine nuove:
  - le azioni in testa alla pagina vanno in un `<div className="azioni-pagina">`;
  - le griglie di schede usano `gridTemplateColumns: 'minmax(0, 1fr)'`, altrimenti
    una tabella larga allarga tutta la griglia e le schede escono dallo schermo
    (era il guasto di Dipendenti);
  - niente tabelle con tante colonne: meglio liste a righe;
  - caselle con testo a 16 px (sotto, iPhone ingrandisce la pagina).
  Prova veloce: anteprima a 375 px di larghezza, nessun elemento oltre il bordo destro.
- **Garage:** le 9 tabelle `garage_*` finite per errore nel database del ristorante sono
  state rimosse (verificato: 0 tabelle rimaste).

## 9. Backlog
- Audit completo del 28/10/2026: problemi e priorità sono in `RIEPILOGO_PER_PROMPT.md`
  e nel recap dell'utente. Bonifici e Inventario/Spese soci: lasciati così per
  ora (29/10/2026)
- Controllo del ruolo **master** dentro `chiudi_periodo_cassa` e `annulla_chiusura_*`
  (oggi qualsiasi utente con accesso può chiamarle dal database)
- Bucket `foto` pubblico: chi ha il link vede scontrini e allegati dei soci
  senza accesso. Valutare bucket privato con link temporanei
- Attivare in Supabase la protezione dalle password già rubate (Auth → password)
- Modificare dall'Archivio anche i movimenti di cassa dei periodi chiusi
  (oggi si vedono ma non si correggono)
- Target giornaliero nel Riepilogo: la media conta anche i giorni con sole uscite
- Ritrovare o riscrivere le migrazioni 29-31; eseguire la 30 se serve
- Valutare se rendere **privato** il repository GitHub
- Foto dipendenti da base64 a Supabase Storage
- Paginazione reale al posto dei `.limit()` fissi (60/100)
- Indici sulle colonne `data` e sulle chiavi esterne più filtrate
- Export CSV dei riepiloghi
- Test automatici sui calcoli critici (saldo, stipendi proporzionali)

## 10. Registro modifiche
Le voci più recenti in alto. Una riga per ogni modifica pubblicata.

- **29/10/2026** — L'**operatore vede tutti** gli incassi, il chioschetto e le
  uscite (prima solo i suoi, quindi totali vuoti). Solo lettura: modifiche ed
  eliminazioni restano al master. Migrazione **38**.

- **29/10/2026** — **Fondo cassa** con una sola formula anche nel saldo della Cassa
  (prima sommava i fondi di tutte le sere: −118,50 € nel periodo 7). **Data della
  serata**: fino alle 5 del mattino vale la serata appena finita; avviso con
  conferma se la data non è il giorno dopo l'ultima serata o c'è già. **Giornate
  parziali** a 0 anche nel Riepilogo per periodo dei Dipendenti, elencate a parte.
  Migrazione **37**.

- **25/10/2026** — **Rettifica cassa** (solo master) per allineare contanti e POS a
  quanto c'è davvero; **versamenti in cassa** visibili e possibili solo al master
  (bloccati anche nel database); **Giorgio** terzo socio, anche come "chi ha dato
  i soldi" negli acconti. Migrazione **36**.

- **24/10/2026 (sera)** — **Schermate da telefono**: menu con barra in alto e ☰ (prima
  occupava tutta la prima schermata e mancava Esci), Dipendenti che usciva dallo
  schermo (griglia allargata dalla tabella acconti, ora lista), pulsanti in testa
  che vanno a capo, pulsanti e caselle più grandi, testo a 16 px nelle caselle.
  Nuova sezione **Inventario** con migrazione **35** (articoli + conteggi).

- **24/10/2026** — Nuova pagina **Archivio periodi** (una cartella per periodo con
  riepilogo completo e link per correggere). Riepilogo, Incassi, Uscite,
  Chioschetto e movimenti Cassa ora lavorano **per periodo** con lo stesso menu.
  Tolta la sezione **Sadiki**. Fondo cassa calcolato per data. Corretti: date dei
  periodi (fuso orario), lampo "account senza ruolo", proprietario respinto da
  Spese soci. Migrazioni **32** (saldo per periodo + indici), **33** (funzioni solo
  con login), **34** (acconti nel periodo giusto + 11 acconti di ottobre spostati
  da settembre a ottobre). Saldi verificati identici prima e dopo.

- **24/10/2026** — Progetto portato su Claude Code. Aggiunti `CLAUDE.md` e questo
  `RIASSUNTO.md`, le migrazioni 01-28 e gli script SQL in `database/`, le vecchie
  istruzioni in `docs/`, `.gitignore` e `.env.example`. Controllato lo stato reale del
  database. Nessun cambio al codice dell'app né al database.
- **22/10/2026** — `api/keepalive.js` + cron giornaliero per tenere attivo Supabase.
- **31/08/2026** — Ruolo `proprietario` (migrazione 28) e relative pagine.
- **12/08/2026** — Foto su Storage, chiusura con date scelte, versamenti soci, annulla
  chiusura (migrazioni 23-27).
- **26/07/2026** — Chioschetto (migrazione 22).
