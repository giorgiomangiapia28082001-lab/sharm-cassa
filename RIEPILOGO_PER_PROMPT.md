# Sharm Cassa – riepilogo per prompt (aggiornato al 25/10/2026)

## Cos'è
Web app di contabilità per un ristorante a Sharm el-Sheikh (Egitto): incassi, spese,
cassa multi-valuta, dipendenti, inventario, contabilità dei soci.
Valute: **EGP/LE** (principale), EUR, USD. Il POS incassa sempre in EGP.

## Tecnologia e accessi
- Frontend **React + Vite** (`src/`), grafici Recharts.
- Database **Supabase** (PostgreSQL con RLS), progetto **sharm-cassa** (`samrgkyvhfzpsujzfumw`).
  Da NON confondere con "garage giorgio" (`kopbioghepugymwgukzn`). File in Storage, bucket `foto`.
- Deploy **Vercel** automatico a ogni push su `main`: https://sharm-cassa.vercel.app
- Repo GitHub: `giorgiomangiapia28082001-lab/sharm-cassa` (al momento pubblico).
- I calcoli importanti (saldo cassa, stipendi, periodi) stanno in **viste e funzioni
  PostgreSQL**, non nel frontend. Ogni cambio al database va in
  `database/migrazione_NN_nome.sql` (ultima: **36**).

## Sezioni dell'app
- **Riepilogo**: statistiche del periodo, grafico, target giornaliero
- **Cassa**: saldo per valuta, cambio valuta, scarico POS, chiusura periodo;
  solo master: versamenti e "Rettifica cassa"
- **Archivio periodi**: una cartella per ogni periodo chiuso
- **Incassi serata**: incasso giornaliero (una riga al giorno, tutte le valute)
- **Chioschetto**: incassi del chiosco (contabilità separata, ma i contanti finiscono nella cassa)
- **Uscite**: spese con foto dello scontrino e categorie
- **Spese fisse**: voci mensili con spunta di pagamento
- **Dipendenti**: presenze, stipendi proporzionali, acconti
- **Inventario**: articoli, giacenze, scorta minima (non tocca la cassa)
- **Spese soci**: contabilità dei soci, separata dalla cassa
- **Impostazioni**: tassi di cambio e categorie

## Ruoli
- **master**: può tutto (unico che modifica ed elimina)
- **proprietario**: vede e aggiunge tutto, non modifica né elimina
- **operatore**: inserisce incassi, uscite, presenze, movimenti
- **viewer**: sola lettura

## Regole di funzionamento
- **Periodi**: ogni voce si aggancia da sola al periodo aperto. Alla chiusura il saldo
  viene fotografato e il periodo nuovo **riparte da 0** (nessun riporto, scelta voluta).
  L'ultima chiusura si può annullare. Saldo di un periodo: funzione `saldo_periodo_cassa(id)`.
- **Rettifica cassa**: il master scrive quanto c'è davvero; la differenza viene salvata
  come movimento `rettifica`.
- **Soci**: tre, Gianluigi, Luca e Giorgio. Le spese soci e i versamenti soci **non
  toccano la cassa** (voluto).
- Le pagine non si aggiornano da sole: serve ricaricare.
- Usato molto da **telefono**: sotto gli 860 px c'è il menu ☰; niente tabelle larghe,
  caselle con testo a 16 px.

## Situazione e problemi aperti
- Periodo aperto: n. 7, dal 01/10/2026.
- **Saldo POS negativo** (circa −100.343 LE): con l'azzeramento a ogni chiusura, il POS
  di un periodo scaricato nel periodo dopo va sotto zero. Da decidere come contarlo.
- Le funzioni di chiusura/annullo periodo non controllano che l'utente sia master.
- Bucket `foto` pubblico: chi ha il link vede scontrini e allegati.
- Mancano i file delle migrazioni 29-31.
- Foto dipendenti salvate dentro il database (base64) invece che in Storage.
- Altri desideri: correggere i movimenti dei periodi chiusi dall'Archivio, export CSV,
  paginazione, test automatici sui calcoli.

## Come voglio lavorare
- Rispondimi in **italiano semplice**: non sono un programmatore e scrivo spesso da
  telefono con errori di battitura.
- Spiegami **cosa** cambia e **perché**, non il codice.
- Lavora su un ramo separato; porta le modifiche su `main` solo dopo il mio "sì".
- Prima di applicare una modifica al database vero, chiedimi conferma.
- Le query da incollare nel SQL Editor di Supabase devono essere **una sola query**
  (`union all`).
- Il riassunto completo e il registro modifiche sono in `RIASSUNTO.md` nel repository.
