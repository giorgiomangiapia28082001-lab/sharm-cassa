-- ============================================================
-- MIGRAZIONE: campi contatto dipendente + permessi operatore
-- Da eseguire nel SQL Editor di Supabase (dopo schema.sql)
-- ============================================================

-- 1. Nuovi campi sulla tabella dipendenti
alter table dipendenti add column if not exists telefono text;
alter table dipendenti add column if not exists note_operatore text;

-- 2. Permessi: l'operatore può AGGIORNARE un dipendente, ma il database
--    stesso impedisce di toccare i campi sensibili (vedi trigger sotto).
--    Prima rimuoviamo la vecchia policy di update (solo master) e la
--    sostituiamo con una che ammette anche l'operatore.
drop policy if exists "dipendenti_update" on dipendenti;

create policy "dipendenti_update" on dipendenti for update using (
  get_my_role() in ('master', 'operatore')
);

-- 3. Trigger di sicurezza: se chi modifica NON è master, blocchiamo
--    qualsiasi tentativo di cambiare nome, stipendio o data_inizio,
--    anche se qualcuno provasse a forzare la richiesta dal browser.
create or replace function blocca_campi_sensibili_dipendenti()
returns trigger as $$
begin
  if get_my_role() <> 'master' then
    if new.nome <> old.nome
       or coalesce(new.stipendio_eur, 0) <> coalesce(old.stipendio_eur, 0)
       or coalesce(new.stipendio_egp, 0) <> coalesce(old.stipendio_egp, 0)
       or coalesce(new.data_inizio, '1900-01-01') <> coalesce(old.data_inizio, '1900-01-01')
       or coalesce(new.ruolo_lavoro, '') <> coalesce(old.ruolo_lavoro, '')
       or coalesce(new.attivo, true) <> coalesce(old.attivo, true)
    then
      raise exception 'Solo il Master può modificare nome, ruolo, stipendio, data inizio o stato attivo.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_blocca_campi_sensibili on dipendenti;

create trigger trg_blocca_campi_sensibili
  before update on dipendenti
  for each row
  execute function blocca_campi_sensibili_dipendenti();
