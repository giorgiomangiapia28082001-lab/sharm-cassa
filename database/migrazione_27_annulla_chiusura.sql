-- ============================================================
-- MIGRAZIONE 27 — ANNULLA CHIUSURA (torna indietro dopo un "Chiudi periodo")
--
-- IL PROBLEMA
-- La funzione "riapri_periodo" scritta nella migrazione 16 non ha mai potuto
-- funzionare. Il motivo:
--   • quando chiudi un periodo, il sistema ne apre subito uno nuovo;
--   • ma "riapri_periodo" si rifiuta di lavorare se esiste un periodo aperto.
-- Siccome dopo ogni chiusura c'è SEMPRE un periodo aperto, il pulsante
-- "Riapri" restituiva sempre l'errore "Chiudi prima il periodo corrente",
-- e non c'era modo di tornare indietro. Da qui il blocco.
--
-- LA SOLUZIONE
-- Una funzione "annulla_chiusura" che fa davvero quello che serve:
--   1. prende il periodo chiuso da annullare (l'ultimo, se non ne indichi uno);
--   2. sposta dentro di lui tutto ciò che è finito nel periodo nuovo;
--   3. elimina il periodo nuovo ormai vuoto;
--   4. riapre il periodo, cancellando la fotografia del saldo.
-- Il risultato è esattamente la situazione di prima della chiusura:
-- tutto torna modificabile e nessun dato viene perso.
--
-- Vale sia per la CASSA sia per i SOCI.
-- ============================================================

-- ============================================================
-- PARTE A — ANNULLA CHIUSURA CASSA
-- ============================================================
create or replace function annulla_chiusura_cassa(p_periodo_id uuid default null)
returns uuid as $$
declare
  v_target uuid;
  v_aperto uuid;
begin
  -- Quale periodo chiuso vogliamo riaprire?
  if p_periodo_id is not null then
    select id into v_target from periodi_cassa
      where id = p_periodo_id and data_chiusura is not null;
    if v_target is null then
      raise exception 'Il periodo indicato non esiste o non è chiuso';
    end if;
  else
    select id into v_target from periodi_cassa
      where data_chiusura is not null
      order by data_chiusura desc limit 1;
    if v_target is null then
      raise exception 'Non c''è nessun periodo chiuso da annullare';
    end if;
  end if;

  -- Il periodo attualmente aperto (quello creato dalla chiusura)
  select id into v_aperto from periodi_cassa where data_chiusura is null limit 1;

  if v_aperto is not null and v_aperto <> v_target then
    -- Tutto ciò che è stato registrato dopo la chiusura torna nel periodo riaperto
    update incassi             set periodo_cassa_id = v_target where periodo_cassa_id = v_aperto;
    update uscite              set periodo_cassa_id = v_target where periodo_cassa_id = v_aperto;
    update movimenti_cassa     set periodo_cassa_id = v_target where periodo_cassa_id = v_aperto;
    update acconti             set periodo_cassa_id = v_target where periodo_cassa_id = v_aperto;
    if to_regclass('public.incassi_chioschetto') is not null then
      execute 'update incassi_chioschetto set periodo_cassa_id = $1 where periodo_cassa_id = $2'
        using v_target, v_aperto;
    end if;

    -- Il periodo nuovo ora è vuoto: lo eliminiamo
    delete from periodi_cassa where id = v_aperto;
  end if;

  -- Riapriamo il periodo e cancelliamo la fotografia del saldo
  update periodi_cassa set
    data_chiusura = null,
    contanti_eur = null,
    contanti_egp = null,
    contanti_usd = null,
    saldo_pos_egp = null,
    chiuso_da = null
  where id = v_target;

  return v_target;
end;
$$ language plpgsql security definer;


-- ============================================================
-- PARTE B — ANNULLA CHIUSURA SOCI
-- ============================================================
create or replace function annulla_chiusura_soci(p_periodo_id uuid default null)
returns uuid as $$
declare
  v_target uuid;
  v_aperto uuid;
begin
  if p_periodo_id is not null then
    select id into v_target from periodi_soci
      where id = p_periodo_id and data_chiusura is not null;
    if v_target is null then
      raise exception 'Il periodo indicato non esiste o non è chiuso';
    end if;
  else
    select id into v_target from periodi_soci
      where data_chiusura is not null
      order by data_chiusura desc limit 1;
    if v_target is null then
      raise exception 'Non c''è nessun periodo soci chiuso da annullare';
    end if;
  end if;

  select id into v_aperto from periodi_soci where data_chiusura is null limit 1;

  if v_aperto is not null and v_aperto <> v_target then
    update spese_socio set periodo_soci_id = v_target where periodo_soci_id = v_aperto;
    if to_regclass('public.versamenti_socio') is not null then
      execute 'update versamenti_socio set periodo_soci_id = $1 where periodo_soci_id = $2'
        using v_target, v_aperto;
    end if;

    delete from periodi_soci where id = v_aperto;
  end if;

  update periodi_soci set
    data_chiusura = null,
    totali = null,
    chiuso_da = null
  where id = v_target;

  return v_target;
end;
$$ language plpgsql security definer;


-- ============================================================
-- PARTE C — Le vecchie funzioni "riapri" ora rimandano a queste
-- (così anche i pulsanti già esistenti smettono di dare errore)
-- ============================================================
create or replace function riapri_periodo_cassa(p_periodo_id uuid)
returns void as $$
begin
  perform annulla_chiusura_cassa(p_periodo_id);
end;
$$ language plpgsql security definer;

create or replace function riapri_periodo_soci(p_periodo_id uuid)
returns void as $$
begin
  perform annulla_chiusura_soci(p_periodo_id);
end;
$$ language plpgsql security definer;
