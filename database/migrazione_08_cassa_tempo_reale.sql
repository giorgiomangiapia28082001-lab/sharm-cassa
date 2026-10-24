-- ============================================================
-- MIGRAZIONE 08: Cassa in tempo reale
-- - Tabella "movimenti_cassa" per cambio valuta e prelievi POS->contanti
-- - Vista che calcola il saldo attuale di ogni "borsello"
--   (Contanti EUR, Contanti EGP, Contanti USD, Saldo POS EGP)
-- ============================================================

create table if not exists movimenti_cassa (
  id uuid default uuid_generate_v4() primary key,
  tipo text not null check (tipo in ('cambio_valuta', 'prelievo_pos')),
  data date not null default current_date,

  -- per "cambio_valuta": cosa esce e cosa entra
  valuta_da text check (valuta_da in ('EUR', 'USD', 'EGP')),
  importo_da numeric(10,2),
  valuta_a text check (valuta_a in ('EUR', 'USD', 'EGP')),
  importo_a numeric(10,2),

  -- per "prelievo_pos": quanto si preleva dal POS (sempre EGP) e si aggiunge ai contanti EGP
  importo_pos numeric(10,2),

  note text,
  inserito_da uuid references profiles(id) not null,
  created_at timestamptz default now()
);

create index if not exists idx_movimenti_cassa_data on movimenti_cassa(data);

alter table movimenti_cassa enable row level security;

create policy "movimenti_cassa_select" on movimenti_cassa for select using (auth.uid() is not null);
create policy "movimenti_cassa_insert" on movimenti_cassa for insert with check (get_my_role() in ('master', 'operatore'));
create policy "movimenti_cassa_update" on movimenti_cassa for update using (get_my_role() = 'master');
create policy "movimenti_cassa_delete" on movimenti_cassa for delete using (get_my_role() = 'master');

-- ============================================================
-- Vista "saldo_cassa_attuale": calcola il saldo per ogni borsello,
-- combinando incassi, uscite, acconti, spese fisse e movimenti manuali.
-- ============================================================
create or replace view saldo_cassa_attuale as
select
  -- CONTANTI EUR: incassi eur (contanti+fondo+bonifici+delivery) - uscite EUR - cambio valuta EUR in/out
  (
    coalesce((select sum(eur_contanti + fondo_cassa + bonifici + delivery_eur) from incassi), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'EUR'), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'EUR'), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'EUR'), 0)
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
