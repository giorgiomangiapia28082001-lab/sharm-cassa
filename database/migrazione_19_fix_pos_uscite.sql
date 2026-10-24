-- ============================================================
-- MIGRAZIONE 19: fix saldo cassa — uscite con metodo POS
-- Bug: le uscite pagate col POS venivano scalate dai contanti
-- invece che dal saldo POS.
-- Fix: distinguiamo metodo_pagamento nelle detrazioni:
--   - contanti / bonifico → scalato dai contanti
--   - pos → scalato dal saldo_pos_egp (solo EGP, unica valuta POS)
-- ============================================================

create or replace view saldo_cassa_attuale as
with periodo as (select id from periodi_cassa where data_chiusura is null limit 1)
select
  -- CONTANTI EUR: solo uscite EUR pagate in contanti o bonifico (non POS)
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
  ) as contanti_eur,

  -- CONTANTI EGP: solo uscite EGP pagate in contanti (non POS)
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
  ) as contanti_egp,

  -- CONTANTI USD: solo uscite USD pagate in contanti o bonifico
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
  ) as contanti_usd,

  -- SALDO POS EGP: incassi POS - prelievi - uscite pagate col POS (solo EGP)
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
  ) as saldo_pos_egp;
