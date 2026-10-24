-- ============================================================
--  MIGRAZIONE 34 · Gli acconti seguono il periodo giusto alla chiusura
--
--  PROBLEMA (trovato il 24/10/2026): chiudendo un periodo "con le
--  date scelte", chiudi_periodo_cassa spostava nel periodo nuovo
--  incassi, chioschetto, uscite e movimenti datati fuori
--  dall'intervallo, ma NON gli acconti dei dipendenti.
--  Così 11 acconti dal 02/10 al 09/10/2026 (48.160 LE + 100 €)
--  sono rimasti nel periodo 6 (settembre) mentre le loro uscite
--  sono finite, giustamente, nel periodo 7 (ottobre).
--  Il saldo della cassa era giusto (conta le uscite), ma la pagina
--  Dipendenti non vedeva quegli acconti nel periodo in corso.
--
--  COSA FA:
--  1. Rimette ogni acconto nello stesso periodo della sua uscita.
--  2. Riscrive chiudi_periodo_cassa uguale a prima (migrazione 25)
--     con in più gli acconti, così non succede più.
--
--  Si può eseguire più volte senza danni.
-- ============================================================


-- 1 · Correzione dei dati: l'acconto va dove sta la sua uscita
update public.acconti a
set periodo_cassa_id = u.periodo_cassa_id
from public.uscite u
where u.generato_da_acconto_id = a.id
  and u.periodo_cassa_id is not null
  and a.periodo_cassa_id is distinct from u.periodo_cassa_id;


-- 2 · chiudi_periodo_cassa con gli acconti
create or replace function public.chiudi_periodo_cassa(
  p_note text,
  p_chiuso_da uuid,
  p_data_inizio date default null,
  p_data_fine date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id uuid;
  v_saldo record;
  v_nuovo_id uuid;
  v_incassi uuid[] := '{}';
  v_chiosco uuid[] := '{}';
  v_uscite uuid[] := '{}';
  v_movimenti uuid[] := '{}';
  v_acconti uuid[] := '{}';
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
    -- NOVITÀ (migrazione 34): anche gli acconti
    select coalesce(array_agg(id), '{}') into v_acconti from acconti
      where periodo_cassa_id = v_id
        and (data < coalesce(p_data_inizio, data) or data > coalesce(p_data_fine, data));

    update incassi             set periodo_cassa_id = null where id = any(v_incassi);
    update incassi_chioschetto set periodo_cassa_id = null where id = any(v_chiosco);
    update uscite              set periodo_cassa_id = null where id = any(v_uscite);
    update movimenti_cassa     set periodo_cassa_id = null where id = any(v_movimenti);
    update acconti             set periodo_cassa_id = null where id = any(v_acconti);
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
  update acconti             set periodo_cassa_id = v_nuovo_id where id = any(v_acconti);

  return v_nuovo_id;
end;
$function$;

-- Come per la migrazione 33: solo chi ha fatto l'accesso
revoke execute on function public.chiudi_periodo_cassa(text, uuid, date, date) from public, anon;
grant execute on function public.chiudi_periodo_cassa(text, uuid, date, date) to authenticated;


-- Controllo (sola lettura): deve restituire 0.
-- select count(*) from acconti a join uscite u on u.generato_da_acconto_id = a.id
-- where a.periodo_cassa_id is distinct from u.periodo_cassa_id;
