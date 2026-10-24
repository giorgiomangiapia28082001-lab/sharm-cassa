-- ============================================================
-- MIGRAZIONE 14: Sezione Sadiki (clienti B2B)
-- Gestisce la vendita di prodotti al kg a clienti fissi
-- (es. pane, pizzette) con tracciamento produzioni e pagamenti.
-- I pagamenti ricevuti entrano nella cassa EUR contanti.
-- ============================================================

-- 1. Tabella dei CLIENTI B2B (oggi solo Sadiki, ma struttura espandibile)
create table if not exists clienti_b2b (
  id uuid default uuid_generate_v4() primary key,
  nome text not null unique,
  note text,
  attivo boolean default true,
  created_at timestamptz default now()
);

-- Inserimento cliente iniziale
insert into clienti_b2b (nome) values ('Sadiki')
  on conflict (nome) do nothing;

-- 2. Tabella delle PRODUZIONI giornaliere
--    Ogni riga = una produzione di un prodotto per un cliente in una data
create table if not exists produzioni_b2b (
  id uuid default uuid_generate_v4() primary key,
  cliente_id uuid references clienti_b2b(id) on delete cascade not null,
  data date not null,
  prodotto text not null,           -- descrizione prodotto, es. "Pane", "Pizzette Margherita"
  kg numeric(10,3) not null check (kg > 0),
  prezzo_kg_eur numeric(10,2) not null check (prezzo_kg_eur >= 0),
  foto_url text,                    -- foto del prodotto / consegna (opzionale)
  note text,
  inserito_da uuid references profiles(id) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_produzioni_b2b_data on produzioni_b2b(data);
create index if not exists idx_produzioni_b2b_cliente on produzioni_b2b(cliente_id);

-- 3. Tabella dei PAGAMENTI ricevuti dal cliente
create table if not exists pagamenti_b2b (
  id uuid default uuid_generate_v4() primary key,
  cliente_id uuid references clienti_b2b(id) on delete cascade not null,
  data_pagamento date not null default current_date,
  importo_eur numeric(10,2) not null check (importo_eur > 0),
  data_da date,                     -- periodo coperto: da (opzionale, informativo)
  data_a date,                      -- periodo coperto: a (opzionale, informativo)
  note text,
  inserito_da uuid references profiles(id) not null,
  created_at timestamptz default now()
);

create index if not exists idx_pagamenti_b2b_data on pagamenti_b2b(data_pagamento);
create index if not exists idx_pagamenti_b2b_cliente on pagamenti_b2b(cliente_id);

-- 4. Trigger: quando si registra un pagamento B2B, crea automaticamente
--    un movimento in entrata nella cassa EUR contanti.
--    Lo facciamo tramite un record negli incassi con flag speciale
--    oppure, più pulito, come riga in movimenti_cassa con tipo dedicato.
--    Scelta: aggiungiamo il tipo 'incasso_b2b' a movimenti_cassa.

-- Prima aggiorniamo il check esistente su movimenti_cassa
alter table movimenti_cassa drop constraint if exists movimenti_cassa_tipo_check;
alter table movimenti_cassa add constraint movimenti_cassa_tipo_check
  check (tipo in ('cambio_valuta', 'prelievo_pos', 'incasso_b2b'));

-- Aggiungiamo colonna riferimento al pagamento b2b (opzionale, per tracciabilità)
alter table movimenti_cassa add column if not exists pagamento_b2b_id uuid references pagamenti_b2b(id) on delete cascade;

-- Funzione trigger: alla registrazione del pagamento → crea movimento in cassa EUR
create or replace function crea_movimento_cassa_da_pagamento_b2b()
returns trigger as $$
declare
  v_nome_cliente text;
begin
  select nome into v_nome_cliente from clienti_b2b where id = new.cliente_id;

  insert into movimenti_cassa (
    tipo,
    data,
    valuta_a,
    importo_a,
    note,
    inserito_da,
    pagamento_b2b_id
  ) values (
    'incasso_b2b',
    new.data_pagamento,
    'EUR',
    new.importo_eur,
    'Pagamento da ' || coalesce(v_nome_cliente, 'cliente B2B')
      || case when new.note is not null then ' — ' || new.note else '' end,
    new.inserito_da,
    new.id
  );

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_crea_movimento_cassa_b2b on pagamenti_b2b;

create trigger trg_crea_movimento_cassa_b2b
  after insert on pagamenti_b2b
  for each row
  execute function crea_movimento_cassa_da_pagamento_b2b();

-- Funzione trigger: se il pagamento B2B viene eliminato → elimina il movimento cassa
create or replace function elimina_movimento_cassa_da_pagamento_b2b_eliminato()
returns trigger as $$
begin
  delete from movimenti_cassa where pagamento_b2b_id = old.id;
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_elimina_movimento_cassa_b2b on pagamenti_b2b;

create trigger trg_elimina_movimento_cassa_b2b
  after delete on pagamenti_b2b
  for each row
  execute function elimina_movimento_cassa_da_pagamento_b2b_eliminato();

-- 5. Aggiornamento vista saldo cassa: i pagamenti B2B (Sadiki) devono
--    sommarsi ai contanti EUR. La vista originale sommava importo_a solo
--    per tipo = 'cambio_valuta', quindi va ricreata per includere anche
--    tipo = 'incasso_b2b'.

create or replace view saldo_cassa_attuale as
select
  -- CONTANTI EUR: incassi eur (contanti+fondo+bonifici+delivery) - uscite EUR
  --   - cambio valuta EUR in/out + pagamenti B2B ricevuti (es. Sadiki)
  (
    coalesce((select sum(eur_contanti + fondo_cassa + bonifici + delivery_eur) from incassi), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'EUR'), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'EUR'), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'EUR'), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'incasso_b2b' and valuta_a = 'EUR'), 0)
  ) as contanti_eur,

  -- CONTANTI EGP: incassi egp contanti+delivery - uscite EGP - cambio valuta EGP in/out + prelievi POS
  (
    coalesce((select sum(egp_contanti + delivery_egp) from incassi), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'EGP'), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'EGP'), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'EGP'), 0)
    + coalesce((select sum(importo_pos) from movimenti_cassa where tipo = 'prelievo_pos'), 0)
  ) as contanti_egp,

  -- CONTANTI USD
  (
    coalesce((select sum(usd_contanti) from incassi), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'USD'), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'USD'), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'USD'), 0)
  ) as contanti_usd,

  -- SALDO POS (EGP): incassi pos - prelievi effettuati
  (
    coalesce((select sum(egp_pos) from incassi), 0)
    - coalesce((select sum(importo_pos) from movimenti_cassa where tipo = 'prelievo_pos'), 0)
  ) as saldo_pos_egp;

-- 6. RLS

alter table clienti_b2b enable row level security;
alter table produzioni_b2b enable row level security;
alter table pagamenti_b2b enable row level security;

-- Clienti B2B: tutti leggono, solo master modifica
create policy "clienti_b2b_select" on clienti_b2b for select using (auth.uid() is not null);
create policy "clienti_b2b_insert" on clienti_b2b for insert with check (get_my_role() = 'master');
create policy "clienti_b2b_update" on clienti_b2b for update using (get_my_role() = 'master');
create policy "clienti_b2b_delete" on clienti_b2b for delete using (get_my_role() = 'master');

-- Produzioni: tutti leggono; master e operatore inseriscono; solo master modifica/elimina
create policy "produzioni_b2b_select" on produzioni_b2b for select using (auth.uid() is not null);
create policy "produzioni_b2b_insert" on produzioni_b2b for insert with check (get_my_role() in ('master', 'operatore'));
create policy "produzioni_b2b_update" on produzioni_b2b for update using (get_my_role() = 'master');
create policy "produzioni_b2b_delete" on produzioni_b2b for delete using (get_my_role() = 'master');

-- Pagamenti: tutti leggono; master e operatore inseriscono; solo master elimina
create policy "pagamenti_b2b_select" on pagamenti_b2b for select using (auth.uid() is not null);
create policy "pagamenti_b2b_insert" on pagamenti_b2b for insert with check (get_my_role() in ('master', 'operatore'));
create policy "pagamenti_b2b_delete" on pagamenti_b2b for delete using (get_my_role() = 'master');
