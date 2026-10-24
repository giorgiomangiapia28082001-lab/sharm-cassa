-- ============================================================
-- MIGRAZIONE 11: per i dipendenti assunti a metà mese,
-- il conteggio giorni e il riferimento partono dalla loro
-- data di inizio, non dal 1° del mese.
-- ============================================================

drop view if exists stipendi_calcolati;

create view stipendi_calcolati as
with mesi_dipendenti as (
  select
    d.id as dipendente_id,
    d.nome,
    d.stipendio_eur,
    d.stipendio_egp,
    date_trunc('month', current_date)::date as mese,
    -- giorno di partenza per il conteggio: il più tardi tra inizio mese e data_inizio del dipendente
    greatest(
      date_trunc('month', current_date)::date,
      coalesce(d.data_inizio, date_trunc('month', current_date)::date)
    ) as giorno_partenza
  from dipendenti d
  where d.attivo = true
),
giorni_del_mese as (
  select
    md.dipendente_id,
    md.nome,
    md.stipendio_eur,
    md.stipendio_egp,
    md.mese,
    md.giorno_partenza,
    gs.giorno::date as giorno
  from mesi_dipendenti md
  cross join lateral generate_series(
    md.giorno_partenza,
    least((md.mese + interval '1 month - 1 day')::date, current_date),
    interval '1 day'
  ) as gs(giorno)
  -- se giorno_partenza è già dopo oggi (dipendente assunto nel futuro), niente righe
  where md.giorno_partenza <= current_date
),
giorni_con_stato as (
  select
    g.*,
    coalesce(p.stato, 'assente') as stato_effettivo
  from giorni_del_mese g
  left join presenze p on p.dipendente_id = g.dipendente_id and p.data = g.giorno
),
riferimento_calcolato as (
  select
    *,
    giorni_riferimento_mese(mese) as riferimento_pieno
  from giorni_con_stato
)
select
  dipendente_id,
  nome,
  mese,
  count(*) filter (where stato_effettivo = 'presente') as giorni_presenti,
  count(*) filter (where stato_effettivo = 'parziale') as giorni_parziali,
  count(*) filter (where stato_effettivo = 'assente') as giorni_assenti,
  array_agg(extract(day from giorno)::int order by giorno) filter (where stato_effettivo = 'assente') as elenco_giorni_assenti,
  array_agg(extract(day from giorno)::int order by giorno) filter (
    where stato_effettivo = 'assente'
    and not exists (select 1 from presenze p2 where p2.dipendente_id = riferimento_calcolato.dipendente_id and p2.data = riferimento_calcolato.giorno)
  ) as elenco_giorni_non_segnati,
  array_agg(extract(day from giorno)::int order by giorno) filter (where stato_effettivo = 'parziale') as elenco_giorni_parziali,
  -- il riferimento mostrato resta sempre quello PIENO del mese (26/24/25):
  -- rappresenta la tariffa giornaliera (stipendio / riferimento_pieno),
  -- non un valore scalato — altrimenti la paga finale risulterebbe sproporzionata
  riferimento_pieno as riferimento,
  stipendio_eur,
  stipendio_egp,
  -- stipendio dovuto = giorni presenti * (stipendio mensile / riferimento pieno del mese)
  round(
    (count(*) filter (where stato_effettivo = 'presente')::numeric / riferimento_pieno)
    * stipendio_eur, 2
  ) as stipendio_dovuto_eur,
  round(
    (count(*) filter (where stato_effettivo = 'presente')::numeric / riferimento_pieno)
    * stipendio_egp, 2
  ) as stipendio_dovuto_egp
from riferimento_calcolato
group by dipendente_id, nome, mese, stipendio_eur, stipendio_egp, riferimento_pieno;

grant select on stipendi_calcolati to authenticated;
