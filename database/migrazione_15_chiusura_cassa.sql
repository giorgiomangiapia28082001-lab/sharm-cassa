-- ============================================================
-- MIGRAZIONE 15: Chiusura periodo Cassa (azzeramento manuale)
-- Il Master può premere "Chiudi periodo": l'app fotografa il saldo
-- attuale (storico) e da quel momento il saldo corrente riparte da 0,
-- contando solo i movimenti successivi alla chiusura.
-- ============================================================

-- 1. Tabella storico chiusure
create table if not exists chiusure_cassa (
  id uuid default uuid_generate_v4() primary key,
  data_chiusura date not null default current_date,
  -- fotografia del saldo al momento della chiusura (cioè quanto c'era PRIMA di azzerare)
  contanti_eur numeric(10,2) not null default 0,
  contanti_egp numeric(10,2) not null default 0,
  contanti_usd numeric(10,2) not null default 0,
  saldo_pos_egp numeric(10,2) not null default 0,
  note text,
  chiuso_da uuid references profiles(id) not null,
  created_at timestamptz default now()
);

create index if not exists idx_chiusure_cassa_data on chiusure_cassa(created_at);

alter table chiusure_cassa enable row level security;

create policy "chiusure_cassa_select" on chiusure_cassa for select using (auth.uid() is not null);
create policy "chiusure_cassa_insert" on chiusure_cassa for insert with check (get_my_role() = 'master');
create policy "chiusure_cassa_delete" on chiusure_cassa for delete using (get_my_role() = 'master');

-- ============================================================
-- 2. Ricalcolo vista saldo_cassa_attuale:
--    conta solo i movimenti (incassi/uscite/movimenti_cassa) con
--    data/created_at SUCCESSIVI all'ultima chiusura registrata.
--    Se non c'è mai stata una chiusura, conta tutto come prima.
-- ============================================================

create or replace view saldo_cassa_attuale as
with ultima_chiusura as (
  select coalesce(max(created_at), '1900-01-01'::timestamptz) as da
  from chiusure_cassa
)
select
  -- CONTANTI EUR
  (
    coalesce((select sum(eur_contanti + fondo_cassa + bonifici + delivery_eur) from incassi where created_at > (select da from ultima_chiusura)), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'EUR' and created_at > (select da from ultima_chiusura)), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'EUR' and created_at > (select da from ultima_chiusura)), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'EUR' and created_at > (select da from ultima_chiusura)), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'incasso_b2b' and valuta_a = 'EUR' and created_at > (select da from ultima_chiusura)), 0)
  ) as contanti_eur,

  -- CONTANTI EGP
  (
    coalesce((select sum(egp_contanti + delivery_egp) from incassi where created_at > (select da from ultima_chiusura)), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'EGP' and created_at > (select da from ultima_chiusura)), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'EGP' and created_at > (select da from ultima_chiusura)), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'EGP' and created_at > (select da from ultima_chiusura)), 0)
    + coalesce((select sum(importo_pos) from movimenti_cassa where tipo = 'prelievo_pos' and created_at > (select da from ultima_chiusura)), 0)
  ) as contanti_egp,

  -- CONTANTI USD
  (
    coalesce((select sum(usd_contanti) from incassi where created_at > (select da from ultima_chiusura)), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'USD' and created_at > (select da from ultima_chiusura)), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'USD' and created_at > (select da from ultima_chiusura)), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'USD' and created_at > (select da from ultima_chiusura)), 0)
  ) as contanti_usd,

  -- SALDO POS (EGP)
  (
    coalesce((select sum(egp_pos) from incassi where created_at > (select da from ultima_chiusura)), 0)
    - coalesce((select sum(importo_pos) from movimenti_cassa where tipo = 'prelievo_pos' and created_at > (select da from ultima_chiusura)), 0)
  ) as saldo_pos_egp;

-- ============================================================
-- 3. Vista di supporto: saldo "pre-chiusura" da usare quando il
--    Master apre il pannello "Chiudi periodo", per fargli vedere
--    cosa sta per fotografare prima di confermare.
--    (coincide semplicemente con saldo_cassa_attuale al momento
--     della query, quindi il frontend userà saldo_cassa_attuale
--     stessa subito prima della chiusura)
-- ============================================================

-- Nota: l'IMPORTANTE è che le colonne incassi/uscite/movimenti_cassa
-- usino "created_at" per il taglio temporale (non "data"), perché un
-- utente potrebbe inserire OGGI un incasso con data di IERI, e quel
-- movimento deve comunque entrare nel periodo corrente se inserito
-- dopo la chiusura. Verifichiamo che created_at esista già su incassi/uscite:

-- (Le colonne created_at sono già presenti su incassi, uscite e
--  movimenti_cassa nello schema originale — nessuna modifica necessaria.)
