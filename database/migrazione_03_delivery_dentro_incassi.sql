-- ============================================================
-- MIGRAZIONE 03: delivery torna dentro "incassi", come sezione
-- separata (non più tabella propria), divisa in EUR ed EGP.
-- Da eseguire dopo la migrazione 02.
-- ============================================================

-- 1. Aggiungo i due campi delivery dentro incassi
alter table incassi add column if not exists delivery_eur numeric(10,2) default 0;
alter table incassi add column if not exists delivery_egp numeric(10,2) default 0;

-- 2. Se nella tabella "delivery" separata avevi già inserito dei dati di test,
--    questo passaggio li riporta dentro "incassi" sulla stessa data
--    (se non hai inserito nulla, questa query semplicemente non fa nulla di visibile)
update incassi i
set delivery_eur = d.importo_eur,
    delivery_egp = d.importo_egp
from delivery d
where d.data = i.data;

-- 3. Rimuovo la tabella delivery separata, non serve più
drop table if exists delivery;
