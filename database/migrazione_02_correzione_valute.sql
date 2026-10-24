-- ============================================================
-- MIGRAZIONE 02: correzione valute
-- - Rimuove le colonne in Sterline (GBP), che erano un errore
-- - Il POS ora è in Lire egiziane (egp_pos)
-- - Il Delivery diventa una sezione separata, con importi
--   propri in EUR e EGP (non più un unico campo dentro "incassi")
-- Da eseguire nel SQL Editor di Supabase (dopo schema.sql e migrazione 01)
-- ============================================================

-- 1. Aggiungo la colonna POS in EGP sulla tabella incassi
alter table incassi add column if not exists egp_pos numeric(10,2) default 0;

-- 2. Rimuovo le colonne in sterline (non servono più)
alter table incassi drop column if exists gbp_pos;
alter table incassi drop column if exists gbp_contanti;

-- 3. Rimuovo il vecchio campo "delivery" generico (verrà sostituito
--    dalla tabella dedicata sotto). Se ci sono già dati che vuoi
--    conservare, dimmelo prima di eseguire questa riga.
alter table incassi drop column if exists delivery;

-- 4. Nuova tabella DELIVERY, separata dagli incassi di sala
create table if not exists delivery (
  id uuid default uuid_generate_v4() primary key,
  data date not null,
  importo_eur numeric(10,2) default 0,
  importo_egp numeric(10,2) default 0,
  note text,
  inserito_da uuid references profiles(id) not null,
  created_at timestamptz default now()
);

create index if not exists idx_delivery_data on delivery(data);

alter table delivery enable row level security;

create policy "delivery_select" on delivery for select using (
  get_my_role() = 'master' or get_my_role() = 'viewer' or inserito_da = auth.uid()
);
create policy "delivery_insert" on delivery for insert with check (
  get_my_role() in ('master', 'operatore')
);
create policy "delivery_update" on delivery for update using (
  get_my_role() = 'master'
);
create policy "delivery_delete" on delivery for delete using (
  get_my_role() = 'master'
);

-- 5. La valuta GBP non è più valida per le uscite: aggiorniamo il vincolo
alter table uscite drop constraint if exists uscite_valuta_check;
alter table uscite add constraint uscite_valuta_check check (valuta in ('EUR', 'USD', 'EGP'));

-- 6. Rimuoviamo il tasso di cambio EUR->GBP, non più necessario
--    (lasciamo la colonna per non rompere righe storiche, ma non viene più usata in app)
