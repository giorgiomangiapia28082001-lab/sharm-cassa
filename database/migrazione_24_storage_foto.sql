-- ============================================================
-- MIGRAZIONE 24 — Sistemare le FOTO (archivio "foto")
--
-- PERCHÉ LE FOTO NON SI VEDONO
-- L'app salva i file nell'archivio (bucket) chiamato "foto" e poi usa un
-- link pubblico per mostrarli. Se il bucket NON è impostato come pubblico,
-- il caricamento riesce ma il link non apre niente: la foto risulta
-- caricata e però non si vede. È quasi sempre questa la causa.
--
-- In più, se il bucket ha una lista ristretta di tipi di file consentiti,
-- vengono rifiutati i PDF e certe foto da iPhone.
--
-- Questa migrazione:
--   1. crea il bucket "foto" se non esiste;
--   2. lo rende pubblico in lettura (i link funzionano);
--   3. toglie i limiti sui tipi di file (accetta foto di ogni formato e PDF);
--   4. alza il limite di dimensione a 15 MB (le foto da telefono sono grandi);
--   5. imposta i permessi: chiunque può vedere, solo chi ha fatto l'accesso
--      può caricare o cancellare.
-- ============================================================

-- 1-4. Bucket "foto": crealo se manca, altrimenti correggi le impostazioni
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto', 'foto', true, 15728640, null)
on conflict (id) do update set
  public = true,
  file_size_limit = 15728640,   -- 15 MB
  allowed_mime_types = null;    -- null = nessuna restrizione sul tipo di file

-- 5. Permessi sui file dell'archivio
-- (li ricreiamo da zero per essere sicuri che siano corretti)
drop policy if exists "foto_lettura_pubblica" on storage.objects;
drop policy if exists "foto_upload_autenticati" on storage.objects;
drop policy if exists "foto_modifica_autenticati" on storage.objects;
drop policy if exists "foto_cancella_autenticati" on storage.objects;

-- Chiunque abbia il link può vedere il file (serve per mostrare le foto)
create policy "foto_lettura_pubblica" on storage.objects
  for select using (bucket_id = 'foto');

-- Solo gli utenti che hanno fatto l'accesso possono caricare
create policy "foto_upload_autenticati" on storage.objects
  for insert to authenticated with check (bucket_id = 'foto');

create policy "foto_modifica_autenticati" on storage.objects
  for update to authenticated using (bucket_id = 'foto');

create policy "foto_cancella_autenticati" on storage.objects
  for delete to authenticated using (bucket_id = 'foto');

-- ============================================================
-- VERIFICA (facoltativa): esegui questa riga da sola per controllare
-- che il bucket sia a posto. "public" deve risultare true.
--
--   select id, public, file_size_limit, allowed_mime_types
--   from storage.buckets where id = 'foto';
-- ============================================================
