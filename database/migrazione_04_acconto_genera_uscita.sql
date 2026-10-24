-- ============================================================
-- MIGRAZIONE 04: acconto dipendente -> crea automaticamente
-- la/le righe corrispondenti in "uscite" (categoria Dipendenti)
-- Da eseguire dopo la migrazione 03.
-- ============================================================

-- 1. Aggiungo un riferimento opzionale "acconto_id" sulla tabella uscite,
--    per sapere quali uscite sono state generate automaticamente da un acconto
--    (utile in futuro se vorrai escluderle da modifiche manuali o duplicati)
alter table uscite add column if not exists generato_da_acconto_id uuid references acconti(id) on delete cascade;

-- 2. Mi assicuro che esista la categoria "Dipendenti" (dovrebbe già esserci da schema.sql)
insert into categorie_uscite (nome, ordine)
select 'Dipendenti', 2
where not exists (select 1 from categorie_uscite where nome = 'Dipendenti');

-- 3. Funzione trigger: alla creazione di un acconto, crea 1 o 2 righe in uscite
create or replace function crea_uscita_da_acconto()
returns trigger as $$
declare
  v_categoria_id uuid;
  v_nome_dipendente text;
begin
  select id into v_categoria_id from categorie_uscite where nome = 'Dipendenti' limit 1;
  select nome into v_nome_dipendente from dipendenti where id = new.dipendente_id;

  if coalesce(new.importo_eur, 0) > 0 then
    insert into uscite (data, descrizione, categoria_id, valuta, importo, metodo_pagamento, inserito_da, generato_da_acconto_id)
    values (
      new.data,
      'Acconto a ' || coalesce(v_nome_dipendente, 'dipendente'),
      v_categoria_id,
      'EUR',
      new.importo_eur,
      'contanti',
      new.inserito_da,
      new.id
    );
  end if;

  if coalesce(new.importo_egp, 0) > 0 then
    insert into uscite (data, descrizione, categoria_id, valuta, importo, metodo_pagamento, inserito_da, generato_da_acconto_id)
    values (
      new.data,
      'Acconto a ' || coalesce(v_nome_dipendente, 'dipendente'),
      v_categoria_id,
      'EGP',
      new.importo_egp,
      'contanti',
      new.inserito_da,
      new.id
    );
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_crea_uscita_da_acconto on acconti;

create trigger trg_crea_uscita_da_acconto
  after insert on acconti
  for each row
  execute function crea_uscita_da_acconto();

-- 4. Se in futuro un acconto venisse eliminato, eliminiamo anche le uscite
--    generate automaticamente da esso (grazie a "on delete cascade" già impostato sopra)
