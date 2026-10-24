-- ============================================================
-- MIGRAZIONE 23 — CORREZIONE URGENTE della vista saldo cassa
--
-- PERCHÉ SERVE
-- La migrazione 22 (chioschetto) ha riscritto "saldo_cassa_attuale"
-- partendo da una versione VECCHIA della vista, perdendo per strada tre
-- cose importanti aggiunte dalle migrazioni 16, 19 e 20:
--
--   1. Il filtro sul PERIODO aperto  → il saldo mostrava il totale di
--      sempre invece che quello del periodo corrente (la chiusura
--      periodo risultava di fatto inutile).
--   2. La distinzione contanti/POS sulle uscite (migrazione 19)
--      → le uscite pagate col POS tornavano a essere scalate dai contanti.
--   3. I movimenti "versamento" (migrazione 20) e "incasso_b2b"
--      → non venivano più contati nel saldo.
--
-- Questa migrazione rimette la vista corretta: versione della migrazione 20
-- (completa) PIÙ il chioschetto. Va eseguita anche se hai già lanciato la 22.
--
-- Aggiunge inoltre al chioschetto il collegamento al periodo cassa, che
-- nella migrazione 22 mancava.
-- ============================================================

-- 1. Il chioschetto entra nel sistema dei periodi come le altre tabelle
alter table incassi_chioschetto
  add column if not exists periodo_cassa_id uuid references periodi_cassa(id);

drop trigger if exists trg_assegna_periodo_chioschetto on incassi_chioschetto;
create trigger trg_assegna_periodo_chioschetto before insert on incassi_chioschetto
  for each row execute function assegna_periodo_cassa();

-- Le righe già inserite finiscono nel periodo attualmente aperto
update incassi_chioschetto
  set periodo_cassa_id = periodo_cassa_aperto_id()
  where periodo_cassa_id is null;

-- 2. Vista saldo CORRETTA E COMPLETA
create or replace view saldo_cassa_attuale as
with periodo as (select id from periodi_cassa where data_chiusura is null limit 1)
select
  -- ---------- CONTANTI EUR ----------
  (
    coalesce((select sum(eur_contanti + fondo_cassa + bonifici + delivery_eur)
              from incassi where periodo_cassa_id = (select id from periodo)), 0)
    + coalesce((select sum(eur_contanti + bonifici)
                from incassi_chioschetto where periodo_cassa_id = (select id from periodo)), 0)
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

  -- ---------- CONTANTI EGP ----------
  (
    coalesce((select sum(egp_contanti + delivery_egp)
              from incassi where periodo_cassa_id = (select id from periodo)), 0)
    + coalesce((select sum(egp_contanti)
                from incassi_chioschetto where periodo_cassa_id = (select id from periodo)), 0)
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

  -- ---------- CONTANTI USD ----------
  (
    coalesce((select sum(usd_contanti)
              from incassi where periodo_cassa_id = (select id from periodo)), 0)
    + coalesce((select sum(usd_contanti)
                from incassi_chioschetto where periodo_cassa_id = (select id from periodo)), 0)
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

  -- ---------- SALDO POS (EGP) ----------
  (
    coalesce((select sum(egp_pos)
              from incassi where periodo_cassa_id = (select id from periodo)), 0)
    + coalesce((select sum(egp_pos)
                from incassi_chioschetto where periodo_cassa_id = (select id from periodo)), 0)
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

-- NOTA: le SPESE DEI SOCI non compaiono in questa vista, e non ci sono mai
-- state: la sezione Soci è già completamente separata dalla cassa del
-- direttore. Nessuna spesa socio tocca il saldo cassa.
