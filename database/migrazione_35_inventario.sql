-- ============================================================
--  MIGRAZIONE 35 · Inventario del materiale in giacenza
--
--  Due tabelle nuove, nessuna tabella esistente viene toccata:
--
--  inventario_articoli  · l'elenco di cosa si tiene in magazzino
--                         (nome, categoria, unità, scorta minima,
--                         prezzo per unità facoltativo)
--  inventario_conteggi  · ogni volta che si conta un articolo:
--                         data e quantità trovata. La giacenza
--                         attuale è l'ultimo conteggio.
--
--  L'inventario NON tocca la cassa: è solo un registro di quanto
--  materiale c'è.
--
--  Permessi (come le altre sezioni):
--    vedere           · tutti quelli che hanno fatto l'accesso
--    contare/aggiungere · master, operatore, proprietario
--    modificare/eliminare · solo master
--
--  Si può eseguire più volte senza danni.
-- ============================================================

create table if not exists public.inventario_articoli (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  categoria       text,
  unita           text not null default 'pz',
  scorta_minima   numeric not null default 0,
  prezzo_unitario numeric,
  valuta          text not null default 'EGP' check (valuta in ('EUR', 'EGP', 'USD')),
  note            text,
  attivo          boolean not null default true,
  inserito_da     uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);

create table if not exists public.inventario_conteggi (
  id           uuid primary key default gen_random_uuid(),
  articolo_id  uuid not null references public.inventario_articoli(id) on delete cascade,
  data         date not null default current_date,
  quantita     numeric not null check (quantita >= 0),
  note         text,
  inserito_da  uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

create index if not exists idx_inventario_conteggi_articolo on public.inventario_conteggi (articolo_id, data desc, created_at desc);
create index if not exists idx_inventario_conteggi_data     on public.inventario_conteggi (data);

alter table public.inventario_articoli enable row level security;
alter table public.inventario_conteggi enable row level security;

drop policy if exists inventario_articoli_select on public.inventario_articoli;
drop policy if exists inventario_articoli_insert on public.inventario_articoli;
drop policy if exists inventario_articoli_update on public.inventario_articoli;
drop policy if exists inventario_articoli_delete on public.inventario_articoli;

create policy inventario_articoli_select on public.inventario_articoli
  for select to authenticated using (auth.uid() is not null);
create policy inventario_articoli_insert on public.inventario_articoli
  for insert to authenticated with check (public.get_my_role() in ('master', 'operatore', 'proprietario'));
create policy inventario_articoli_update on public.inventario_articoli
  for update to authenticated using (public.get_my_role() = 'master');
create policy inventario_articoli_delete on public.inventario_articoli
  for delete to authenticated using (public.get_my_role() = 'master');

drop policy if exists inventario_conteggi_select on public.inventario_conteggi;
drop policy if exists inventario_conteggi_insert on public.inventario_conteggi;
drop policy if exists inventario_conteggi_update on public.inventario_conteggi;
drop policy if exists inventario_conteggi_delete on public.inventario_conteggi;

create policy inventario_conteggi_select on public.inventario_conteggi
  for select to authenticated using (auth.uid() is not null);
create policy inventario_conteggi_insert on public.inventario_conteggi
  for insert to authenticated with check (public.get_my_role() in ('master', 'operatore', 'proprietario'));
create policy inventario_conteggi_update on public.inventario_conteggi
  for update to authenticated using (public.get_my_role() = 'master');
create policy inventario_conteggi_delete on public.inventario_conteggi
  for delete to authenticated using (public.get_my_role() = 'master');
