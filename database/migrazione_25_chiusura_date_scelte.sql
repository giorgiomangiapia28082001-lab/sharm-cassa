-- ============================================================
-- MIGRAZIONE 25 — Chiusura periodo con DATE SCELTE DA TE
--
-- Prima, chiudendo un periodo, veniva chiuso "tutto quello che c'era dentro"
-- fino a quel momento. Ora puoi indicare "dal giorno" e "al giorno":
--
--   • le righe del periodo aperto che stanno DENTRO l'intervallo vengono
--     chiuse e fotografate nel periodo che stai chiudendo;
--   • le righe che stanno FUORI dall'intervallo (per esempio quelle di ieri
--     se chiudi solo fino all'altro ieri, o quelle già registrate per domani)
--     NON vengono chiuse: passano automaticamente al periodo nuovo.
--
-- Se lasci le date vuote, il comportamento resta identico a prima:
-- si chiude tutto quello che c'è nel periodo aperto.
--
-- Vale sia per la CASSA sia per i SOCI.
-- ============================================================

-- ============================================================
-- PARTE A — CHIUSURA CASSA
-- ============================================================

-- La vecchia versione aveva 2 parametri: va rimossa prima di ricrearla con 4.
drop function if exists chiudi_periodo_cassa(text, uuid);
drop function if exists chiudi_periodo_cassa(text, uuid, date, date);

create or replace function chiudi_periodo_cassa(
  p_note text,
  p_chiuso_da uuid,
  p_data_inizio date default null,
  p_data_fine date default null
)
returns uuid as $$
declare
  v_id uuid;
  v_saldo record;
  v_nuovo_id uuid;
  v_incassi uuid[] := '{}';
  v_chiosco uuid[] := '{}';
  v_uscite uuid[] := '{}';
  v_movimenti uuid[] := '{}';
begin
  select id into v_id from periodi_cassa where data_chiusura is null limit 1;
  if v_id is null then
    raise exception 'Nessun periodo cassa aperto trovato';
  end if;

  if p_data_inizio is not null and p_data_fine is not null and p_data_inizio > p_data_fine then
    raise exception 'La data di inizio è successiva a quella di fine';
  end if;

  -- Se sono state indicate delle date, mettiamo temporaneamente "da parte"
  -- (periodo_cassa_id = null) le righe fuori intervallo, così non finiscono
  -- nella fotografia del saldo. Alla fine le assegneremo al periodo nuovo.
  if p_data_inizio is not null or p_data_fine is not null then
    select coalesce(array_agg(id), '{}') into v_incassi from incassi
      where periodo_cassa_id = v_id
        and (data < coalesce(p_data_inizio, data) or data > coalesce(p_data_fine, data));
    select coalesce(array_agg(id), '{}') into v_chiosco from incassi_chioschetto
      where periodo_cassa_id = v_id
        and (data < coalesce(p_data_inizio, data) or data > coalesce(p_data_fine, data));
    select coalesce(array_agg(id), '{}') into v_uscite from uscite
      where periodo_cassa_id = v_id
        and (data < coalesce(p_data_inizio, data) or data > coalesce(p_data_fine, data));
    select coalesce(array_agg(id), '{}') into v_movimenti from movimenti_cassa
      where periodo_cassa_id = v_id
        and (data < coalesce(p_data_inizio, data) or data > coalesce(p_data_fine, data));

    update incassi            set periodo_cassa_id = null where id = any(v_incassi);
    update incassi_chioschetto set periodo_cassa_id = null where id = any(v_chiosco);
    update uscite             set periodo_cassa_id = null where id = any(v_uscite);
    update movimenti_cassa    set periodo_cassa_id = null where id = any(v_movimenti);
  end if;

  -- Fotografia del saldo (ora contiene solo le righe dentro l'intervallo)
  select * into v_saldo from saldo_cassa_attuale;

  update periodi_cassa set
    data_apertura = coalesce(p_data_inizio::timestamptz, data_apertura),
    data_chiusura = coalesce((p_data_fine + 1)::timestamptz - interval '1 second', now()),
    contanti_eur  = v_saldo.contanti_eur,
    contanti_egp  = v_saldo.contanti_egp,
    contanti_usd  = v_saldo.contanti_usd,
    saldo_pos_egp = v_saldo.saldo_pos_egp,
    note = p_note,
    chiuso_da = p_chiuso_da
  where id = v_id;

  -- Nuovo periodo: parte dal giorno dopo la fine scelta (o da adesso)
  insert into periodi_cassa (data_apertura)
    values (coalesce((p_data_fine + 1)::timestamptz, now()))
    returning id into v_nuovo_id;

  -- Le righe fuori intervallo passano al periodo nuovo
  update incassi             set periodo_cassa_id = v_nuovo_id where id = any(v_incassi);
  update incassi_chioschetto set periodo_cassa_id = v_nuovo_id where id = any(v_chiosco);
  update uscite              set periodo_cassa_id = v_nuovo_id where id = any(v_uscite);
  update movimenti_cassa     set periodo_cassa_id = v_nuovo_id where id = any(v_movimenti);

  return v_nuovo_id;
end;
$$ language plpgsql security definer;


-- ============================================================
-- PARTE B — CHIUSURA SOCI
-- ============================================================

drop function if exists chiudi_periodo_soci(text, uuid);
drop function if exists chiudi_periodo_soci(text, uuid, date, date);

create or replace function chiudi_periodo_soci(
  p_note text,
  p_chiuso_da uuid,
  p_data_inizio date default null,
  p_data_fine date default null
)
returns uuid as $$
declare
  v_id uuid;
  v_totali jsonb;
  v_nuovo_id uuid;
  v_spese uuid[] := '{}';
  v_versamenti uuid[] := '{}';
begin
  select id into v_id from periodi_soci where data_chiusura is null limit 1;
  if v_id is null then
    raise exception 'Nessun periodo soci aperto trovato';
  end if;

  if p_data_inizio is not null and p_data_fine is not null and p_data_inizio > p_data_fine then
    raise exception 'La data di inizio è successiva a quella di fine';
  end if;

  if p_data_inizio is not null or p_data_fine is not null then
    select coalesce(array_agg(id), '{}') into v_spese from spese_socio
      where periodo_soci_id = v_id
        and (data < coalesce(p_data_inizio, data) or data > coalesce(p_data_fine, data));
    update spese_socio set periodo_soci_id = null where id = any(v_spese);

    -- La tabella dei versamenti esiste solo dopo la migrazione 26:
    -- se non c'è ancora, saltiamo questa parte senza errori.
    if to_regclass('public.versamenti_socio') is not null then
      execute $q$
        select coalesce(array_agg(id), '{}') from versamenti_socio
          where periodo_soci_id = $1
            and (data < coalesce($2, data) or data > coalesce($3, data))
      $q$ into v_versamenti using v_id, p_data_inizio, p_data_fine;
      execute 'update versamenti_socio set periodo_soci_id = null where id = any($1)' using v_versamenti;
    end if;
  end if;

  -- Fotografia dei totali per socio (solo le righe dentro l'intervallo)
  select coalesce(jsonb_agg(jsonb_build_object(
    'socio_id', s.id,
    'nome', s.nome,
    'eur', coalesce(t.tot_eur, 0),
    'egp', coalesce(t.tot_egp, 0)
  )), '[]'::jsonb)
  into v_totali
  from soci s
  left join (
    select socio_id, sum(importo_eur) as tot_eur, sum(importo_egp) as tot_egp
    from spese_socio where periodo_soci_id = v_id
    group by socio_id
  ) t on t.socio_id = s.id;

  update periodi_soci set
    data_apertura = coalesce(p_data_inizio::timestamptz, data_apertura),
    data_chiusura = coalesce((p_data_fine + 1)::timestamptz - interval '1 second', now()),
    totali = v_totali,
    note = p_note,
    chiuso_da = p_chiuso_da
  where id = v_id;

  insert into periodi_soci (data_apertura)
    values (coalesce((p_data_fine + 1)::timestamptz, now()))
    returning id into v_nuovo_id;

  update spese_socio set periodo_soci_id = v_nuovo_id where id = any(v_spese);

  if to_regclass('public.versamenti_socio') is not null then
    execute 'update versamenti_socio set periodo_soci_id = $1 where id = any($2)'
      using v_nuovo_id, v_versamenti;
  end if;

  return v_nuovo_id;
end;
$$ language plpgsql security definer;
