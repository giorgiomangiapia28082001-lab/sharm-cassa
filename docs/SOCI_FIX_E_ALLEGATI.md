# 🔧 Spese soci — fix mobile + allegati foto/PDF

Due interventi su questa sezione:

1. **Layout su telefono** — risolto lo spostamento laterale della pagina e le
   caselle di testo troppo larghe nel modulo "Nuova spesa".
2. **Allegati** — ora a ogni spesa puoi allegare una **foto o un PDF** per
   tenere traccia dello scontrino/fattura.

---

## File da caricare su GitHub

**MODIFICATI:**
- `src/index.css`          (fix layout mobile — vale per tutte le pagine)
- `src/pages/Soci.jsx`     (campo allegato + link per aprirlo)

Carica come al solito la cartella `src` (o questi due file). Committa su main e
aspetta che Vercel diventi verde.

## ⚠️ Database: NON serve nessuna migrazione

La tabella delle spese soci aveva **già** il campo per l'allegato (`foto_url`),
quindi su Supabase non devi eseguire nessuno script SQL per questa modifica.

---

## ⚠️ Una cosa da controllare su Supabase: i PDF nel bucket

Gli allegati vengono caricati nello stesso archivio delle foto delle uscite
(bucket **"foto"**). Quel bucket, quando è stato creato, potrebbe essere
limitato alle sole immagini. Se è così, **le foto funzioneranno ma i PDF no**
(la spesa si salverà lo stesso, ma senza allegato, e comparirà un avviso).

Per permettere anche i PDF:

1. Supabase → menu a sinistra **Storage** → clicca il bucket **foto**.
2. In alto a destra **Configuration** (o l'icona ingranaggio) del bucket.
3. Alla voce **Allowed MIME types**:
   - se è **vuota**, va già bene (accetta tutto): non devi fare niente.
   - se contiene solo `image/*`, aggiungi anche `application/pdf`.
4. Salva.

Se non trovi questa impostazione o hai dubbi, fai una prova pratica: allega un
PDF a una spesa di test. Se lo riapri e si vede, è tutto a posto. Se compare
l'avviso "allegato non caricato", allora il bucket sta bloccando i PDF e serve
il passaggio qui sopra.

---

## Cosa vedrai nella pagina

- Nel modulo **Nuova spesa**, sotto gli importi, un campo **"Allegato — foto o
  PDF (opzionale)"**. Dal telefono puoi scattare una foto sul momento o
  scegliere un file.
- In **modifica** di una spesa che ha già un allegato, vedi il link
  all'allegato attuale; se scegli un nuovo file, sostituisce il precedente.
- Nella lista delle spese, sotto la data, compare **📎 Vedi allegato**
  (o "Vedi PDF") per aprirlo.

## Nota sul fix mobile

La correzione del layout è nel CSS globale, quindi oltre a Spese soci sistema
lo stesso tipo di problema (moduli che sforano di lato, caselle troppo larghe)
anche nelle altre pagine, su schermi stretti.
