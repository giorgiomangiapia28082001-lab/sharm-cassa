-- ============================================================
-- MIGRAZIONE 22: Chioschetto
--
-- Il chioschetto è una cassa separata degli stessi proprietari.
-- Vogliamo:
--   1. Una contabilità SEPARATA (tabella propria), così nel Riepilogo si
--      vede quanto rende il chioschetto da solo.
--   2. Che i suoi CONTANTI confluiscano nella cassa del ristorante
--      (a fine giornata i soldi finiscono nello stesso cassetto), quindi la
--      vista "saldo_cassa_attuale" deve includerli.
--
-- Struttura entrate identica agli incassi serali del ristorante:
-- una riga al giorno con le tre valute (EUR / EGP / USD) e il POS in LE.
-- Niente delivery e niente "numero persone": non servono per il chioschetto.
-- ============================================================

create table if not exists incassi_chioschetto (
  id uuid default uuid_generate_v4() primary key,
  data date not null,
  eur_contanti numeric(10,2) default 0,
  bonifici numeric(10,2) default 0,
  egp_pos numeric(10,2) default 0,        -- pagamenti POS, in Lire egiziane
  egp_contanti numeric(10,2) default 0,   -- Lire egiziane contanti
  usd_contanti numeric(10,2) default 0,
  note text,
  inserito_da uuid references profiles(id) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_incassi_chioschetto_data on incassi_chioschetto(data);

-- --- Sicurezza (RLS): stesse regole degli incassi del ristorante ---
alter table incassi_chioschetto enable row level security;

create policy "incassi_chioschetto_select" on incassi_chioschetto for select using (
  get_my_role() = 'master' or get_my_role() = 'viewer' or inserito_da = auth.uid()
);
create policy "incassi_chioschetto_insert" on incassi_chioschetto for insert with check (
  get_my_role() in ('master', 'operatore')
);
create policy "incassi_chioschetto_update" on incassi_chioschetto for update using (
  get_my_role() = 'master'
);
create policy "incassi_chioschetto_delete" on incassi_chioschetto for delete using (
  get_my_role() = 'master'
);

-- ============================================================
-- Aggiorna la vista del saldo cassa per includere i contanti e il POS del
-- chioschetto. È la STESSA vista della migrazione 08, con in più le righe
-- marcate "-- CHIOSCHETTO". Il chioschetto NON ha "fondo_cassa" né "delivery",
-- quindi si somma solo ciò che ha davvero.
-- ============================================================
create or replace view saldo_cassa_attuale as
select
  -- CONTANTI EUR
  (
    coalesce((select sum(eur_contanti + fondo_cassa + bonifici + delivery_eur) from incassi), 0)
    + coalesce((select sum(eur_contanti + bonifici) from incassi_chioschetto), 0)   -- CHIOSCHETTO
    - coalesce((select sum(importo) from uscite where valuta = 'EUR'), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'EUR'), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'EUR'), 0)
  ) as contanti_eur,

  -- CONTANTI EGP
  (
    coalesce((select sum(egp_contanti + delivery_egp) from incassi), 0)
    + coalesce((select sum(egp_contanti) from incassi_chioschetto), 0)              -- CHIOSCHETTO
    - coalesce((select sum(importo) from uscite where valuta = 'EGP'), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'EGP'), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'EGP'), 0)
    + coalesce((select sum(importo_pos) from movimenti_cassa where tipo = 'prelievo_pos'), 0)
  ) as contanti_egp,

  -- CONTANTI USD
  (
    coalesce((select sum(usd_contanti) from incassi), 0)
    + coalesce((select sum(usd_contanti) from incassi_chioschetto), 0)              -- CHIOSCHETTO
    - coalesce((select sum(importo) from uscite where valuta = 'USD'), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'USD'), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'USD'), 0)
  ) as contanti_usd,

  -- SALDO POS (EGP)
  (
    coalesce((select sum(egp_pos) from incassi), 0)
    + coalesce((select sum(egp_pos) from incassi_chioschetto), 0)                   -- CHIOSCHETTO
    - coalesce((select sum(importo_pos) from movimenti_cassa where tipo = 'prelievo_pos'), 0)
  ) as saldo_pos_egp;
