-- ============================================================
-- MIGRAZIONE 06: sincronizzazione Uscite <-> Acconti
-- Se una riga di "uscite" generata da un acconto viene modificata
-- o eliminata, aggiorna/azzera la valuta corrispondente
-- nell'acconto originale.
-- ============================================================

-- Aggiungo una colonna "valuta_origine" implicita: la sappiamo già
-- dalla colonna "valuta" della riga uscita stessa, quindi non serve
-- una colonna nuova. Usiamo solo generato_da_acconto_id (già esiste).

-- 1. Disabilitiamo temporaneamente il trigger di creazione mentre
--    aggiorniamo un'uscita generata, per evitare loop infiniti
--    (lo facciamo controllando, dentro il trigger su acconti,
--    se la riga uscita è già aggiornata — in pratica usiamo un flag
--    di sessione per evitare la ricorsione)

-- Funzione: quando un'uscita generata da acconto viene AGGIORNATA,
-- riportiamo il nuovo importo sull'acconto originale (stessa valuta)
create or replace function sincronizza_acconto_da_uscita()
returns trigger as $$
begin
  if new.generato_da_acconto_id is not null then
    if new.valuta = 'EUR' then
      update acconti set importo_eur = new.importo
      where id = new.generato_da_acconto_id
        and importo_eur is distinct from new.importo;
    elsif new.valuta = 'EGP' then
      update acconti set importo_egp = new.importo
      where id = new.generato_da_acconto_id
        and importo_egp is distinct from new.importo;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_sincronizza_acconto_da_uscita on uscite;

create trigger trg_sincronizza_acconto_da_uscita
  after update of importo on uscite
  for each row
  when (new.generato_da_acconto_id is not null)
  execute function sincronizza_acconto_da_uscita();

-- Funzione: quando un'uscita generata da acconto viene ELIMINATA,
-- azzeriamo SOLO quella valuta sull'acconto originale (l'altra resta intatta)
create or replace function azzera_acconto_da_uscita_eliminata()
returns trigger as $$
begin
  if old.generato_da_acconto_id is not null then
    if old.valuta = 'EUR' then
      update acconti set importo_eur = 0 where id = old.generato_da_acconto_id;
    elsif old.valuta = 'EGP' then
      update acconti set importo_egp = 0 where id = old.generato_da_acconto_id;
    end if;
  end if;
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_azzera_acconto_da_uscita_eliminata on uscite;

create trigger trg_azzera_acconto_da_uscita_eliminata
  before delete on uscite
  for each row
  execute function azzera_acconto_da_uscita_eliminata();

-- 2. Permessi: il Master deve poter aggiornare/eliminare uscite, incassi, spese_socio
--    (le policy di update/delete "solo master" esistono già da schema.sql,
--    quindi qui non serve aggiungere nulla — sono già pronte)
