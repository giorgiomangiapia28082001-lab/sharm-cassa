-- ============================================================
-- MIGRAZIONE 18: aggiornamento giorni di riferimento stipendio
-- Nuova logica:
--   mese 28 giorni -> 25 lavorativi (3 feste)
--   mese 29 giorni -> 25 lavorativi (4 feste)
--   mese 30 giorni -> 25 lavorativi (5 feste)
--   mese 31 giorni -> 25 lavorativi (6 feste)
-- I giorni lavorativi di riferimento sono SEMPRE 25,
-- indipendentemente dalla lunghezza del mese.
-- ============================================================

create or replace function giorni_riferimento_mese(p_mese date)
returns integer as $$
begin
  -- Sempre 25 giorni lavorativi di riferimento, per qualsiasi mese
  return 25;
end;
$$ language plpgsql immutable;

-- La vista stipendi_calcolati usa già questa funzione — si aggiorna in automatico.
