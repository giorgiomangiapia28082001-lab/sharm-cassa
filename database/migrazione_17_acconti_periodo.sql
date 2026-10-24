-- ============================================================
-- MIGRAZIONE 17: Acconti dipendenti collegati al periodo cassa
-- Gli acconti vengono azzerati (visivamente) quando si chiude
-- il periodo cassa, esattamente come incassi e uscite.
-- ============================================================

-- 1. Aggiungi colonna periodo_cassa_id alla tabella acconti
alter table acconti add column if not exists periodo_cassa_id uuid references periodi_cassa(id);

-- 2. Trigger: assegna automaticamente il periodo cassa aperto a ogni nuovo acconto
create or replace function assegna_periodo_cassa_acconto()
returns trigger as $$
begin
  if new.periodo_cassa_id is null then
    new.periodo_cassa_id := periodo_cassa_aperto_id();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_assegna_periodo_acconti on acconti;
create trigger trg_assegna_periodo_acconti before insert on acconti
  for each row execute function assegna_periodo_cassa_acconto();

-- 3. Backfill: tutti gli acconti esistenti vanno nel periodo aperto corrente
update acconti set periodo_cassa_id = periodo_cassa_aperto_id() where periodo_cassa_id is null;
