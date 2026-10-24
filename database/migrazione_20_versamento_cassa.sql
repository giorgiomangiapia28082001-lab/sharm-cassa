-- ============================================================
-- MIGRAZIONE 20: Versamento in cassa
-- Nuovo tipo di movimento "versamento" — aggiunge liquidità
-- in cassa senza essere contato come incasso del ristorante.
-- Es. fondo cassa iniziale, soldi versati dai soci, ecc.
-- ============================================================

-- 1. Aggiorna il check sul tipo
alter table movimenti_cassa drop constraint if exists movimenti_cassa_tipo_check;
alter table movimenti_cassa add constraint movimenti_cassa_tipo_check
  check (tipo in ('cambio_valuta', 'prelievo_pos', 'incasso_b2b', 'versamento'));

-- 2. Aggiorna la vista saldo_cassa_attuale per includere i versamenti
create or replace view saldo_cassa_attuale as
with periodo as (select id from periodi_cassa where data_chiusura is null limit 1)
select
  -- CONTANTI EUR
  (
    coalesce((select sum(eur_contanti + fondo_cassa + bonifici + delivery_eur)
              from incassi where periodo_cassa_id = (select id from periodo)), 0)
    - coalesce((select sum(importo) from uscite
                where valuta = 'EUR'
                and coalesce(metodo_pagamento, 'contanti') in ('contanti', 'bonifico')
                and periodo_cassa_id = (select id from periodo)), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa
                where tipo = 'cambio_valuta' and valuta_da = 'EUR'
                and periodo_cassa_id = (select id from periodo)), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa
                where tipo = 'cambio_valuta' and valuta_a = 'EUR'
                and periodo_cassa_id = (select id from periodo)), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa
                where tipo = 'incasso_b2b' and valuta_a = 'EUR'
                and periodo_cassa_id = (select id from periodo)), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa
                where tipo = 'versamento' and valuta_a = 'EUR'
                and periodo_cassa_id = (select id from periodo)), 0)
  ) as contanti_eur,

  -- CONTANTI EGP
  (
    coalesce((select sum(egp_contanti + delivery_egp)
              from incassi where periodo_cassa_id = (select id from periodo)), 0)
    - coalesce((select sum(importo) from uscite
                where valuta = 'EGP'
                and coalesce(metodo_pagamento, 'contanti') in ('contanti', 'bonifico')
                and periodo_cassa_id = (select id from periodo)), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa
                where tipo = 'cambio_valuta' and valuta_da = 'EGP'
                and periodo_cassa_id = (select id from periodo)), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa
                where tipo = 'cambio_valuta' and valuta_a = 'EGP'
                and periodo_cassa_id = (select id from periodo)), 0)
    + coalesce((select sum(importo_pos) from movimenti_cassa
                where tipo = 'prelievo_pos'
                and periodo_cassa_id = (select id from periodo)), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa
                where tipo = 'versamento' and valuta_a = 'EGP'
                and periodo_cassa_id = (select id from periodo)), 0)
  ) as contanti_egp,

  -- CONTANTI USD
  (
    coalesce((select sum(usd_contanti)
              from incassi where periodo_cassa_id = (select id from periodo)), 0)
    - coalesce((select sum(importo) from uscite
                where valuta = 'USD'
                and coalesce(metodo_pagamento, 'contanti') in ('contanti', 'bonifico')
                and periodo_cassa_id = (select id from periodo)), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa
                where tipo = 'cambio_valuta' and valuta_da = 'USD'
                and periodo_cassa_id = (select id from periodo)), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa
                where tipo = 'cambio_valuta' and valuta_a = 'USD'
                and periodo_cassa_id = (select id from periodo)), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa
                where tipo = 'versamento' and valuta_a = 'USD'
                and periodo_cassa_id = (select id from periodo)), 0)
  ) as contanti_usd,

  -- SALDO POS EGP
  (
    coalesce((select sum(egp_pos)
              from incassi where periodo_cassa_id = (select id from periodo)), 0)
    - coalesce((select sum(importo_pos) from movimenti_cassa
                where tipo = 'prelievo_pos'
                and periodo_cassa_id = (select id from periodo)), 0)
    - coalesce((select sum(importo) from uscite
                where valuta = 'EGP'
                and metodo_pagamento = 'pos'
                and periodo_cassa_id = (select id from periodo)), 0)
    + coalesce((select sum(importo_pos) from movimenti_cassa
                where tipo = 'versamento'
                and importo_pos > 0
                and periodo_cassa_id = (select id from periodo)), 0)
  ) as saldo_pos_egp;
