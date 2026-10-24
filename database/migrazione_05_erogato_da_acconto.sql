-- ============================================================
-- MIGRAZIONE 05: tracciare CHI ha materialmente dato l'acconto
-- (Direttore/cassa del ristorante, oppure uno dei due proprietari)
-- L'acconto resta comunque una spesa normale in "uscite",
-- questo campo è solo informativo su chi ha erogato i soldi.
-- ============================================================

alter table acconti add column if not exists erogato_da text default 'direttore'
  check (erogato_da in ('direttore', 'gianluigi', 'luca'));

-- Aggiorniamo anche la funzione che genera l'uscita automatica,
-- così la descrizione riporta anche chi ha dato i soldi,
-- e se erogato da un socio crea ANCHE la riga in spese_socio
create or replace function crea_uscita_da_acconto()
returns trigger as $$
declare
  v_categoria_id uuid;
  v_nome_dipendente text;
  v_etichetta_erogante text;
  v_socio_id uuid;
begin
  select id into v_categoria_id from categorie_uscite where nome = 'Dipendenti' limit 1;
  select nome into v_nome_dipendente from dipendenti where id = new.dipendente_id;

  v_etichetta_erogante := case new.erogato_da
    when 'gianluigi' then ' (dato da Gianluigi)'
    when 'luca' then ' (dato da Luca)'
    else ''
  end;

  -- 1. Riga in USCITE (cassa generale del ristorante) — sempre creata
  if coalesce(new.importo_eur, 0) > 0 then
    insert into uscite (data, descrizione, categoria_id, valuta, importo, metodo_pagamento, inserito_da, generato_da_acconto_id)
    values (
      new.data,
      'Acconto a ' || coalesce(v_nome_dipendente, 'dipendente') || v_etichetta_erogante,
      v_categoria_id, 'EUR', new.importo_eur, 'contanti', new.inserito_da, new.id
    );
  end if;

  if coalesce(new.importo_egp, 0) > 0 then
    insert into uscite (data, descrizione, categoria_id, valuta, importo, metodo_pagamento, inserito_da, generato_da_acconto_id)
    values (
      new.data,
      'Acconto a ' || coalesce(v_nome_dipendente, 'dipendente') || v_etichetta_erogante,
      v_categoria_id, 'EGP', new.importo_egp, 'contanti', new.inserito_da, new.id
    );
  end if;

  -- 2. Se erogato da un socio, crea ANCHE la riga in spese_socio
  --    (spesa personale, da scalare dall'utile a fine mese)
  if new.erogato_da in ('gianluigi', 'luca') then
    select id into v_socio_id from soci where lower(nome) = new.erogato_da limit 1;

    if v_socio_id is not null then
      insert into spese_socio (socio_id, data, descrizione, importo_eur, importo_egp)
      values (
        v_socio_id,
        new.data,
        'Acconto a ' || coalesce(v_nome_dipendente, 'dipendente'),
        coalesce(new.importo_eur, 0),
        coalesce(new.importo_egp, 0)
      );
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

