-- ============================================================
-- MIGRAZIONE 12:
-- 1. Le presenze e gli acconti diventano visibili a TUTTI i ruoli
--    (non più filtrati per "chi li ha inseriti")
-- 2. Il Master può eliminare un pagamento di spesa fissa già
--    segnato, e questo elimina automaticamente anche l'uscita
--    generata, così la Cassa si aggiorna correttamente da sola.
-- ============================================================

-- 1. PRESENZE: tutti i ruoli autenticati vedono tutte le presenze
drop policy if exists "presenze_select" on presenze;
create policy "presenze_select" on presenze for select using (
  auth.uid() is not null
);

-- 2. ACCONTI: tutti i ruoli autenticati vedono tutti gli acconti
drop policy if exists "acconti_select" on acconti;
create policy "acconti_select" on acconti for select using (
  auth.uid() is not null
);

-- 3. Permettiamo al Master di eliminare un pagamento spesa fissa.
--    La policy "pagamenti_delete" esiste già (solo master) — qui ci
--    assicuriamo che l'eliminazione del pagamento elimini AUTOMATICAMENTE
--    anche l'uscita generata, così il saldo Cassa si aggiorna da solo.
--    (la foreign key generato_uscita_id ha già "on delete set null" sull'uscita,
--    quindi dobbiamo invertire la logica: quando elimino il PAGAMENTO,
--    deve sparire anche l'USCITA collegata)

create or replace function elimina_uscita_da_pagamento_eliminato()
returns trigger as $$
begin
  if old.generato_uscita_id is not null then
    delete from uscite where id = old.generato_uscita_id;
  end if;
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_elimina_uscita_da_pagamento on pagamenti_spese_fisse;

create trigger trg_elimina_uscita_da_pagamento
  after delete on pagamenti_spese_fisse
  for each row
  execute function elimina_uscita_da_pagamento_eliminato();
