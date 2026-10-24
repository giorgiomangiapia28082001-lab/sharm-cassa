-- ============================================================
-- MIGRAZIONE 09: calcolo stipendio proporzionale
-- - Riferimento giorni lavorativi standard per mese:
--   30/31 giorni -> 26 di riferimento
--   Febbraio 28 giorni -> 24 di riferimento
--   Febbraio 29 giorni (bisestile) -> 25 di riferimento
-- - Stipendio dovuto = (giorni presenti / riferimento) * stipendio mensile
-- - I giorni "parziale" NON contano come presenza piena,
--   ma vengono segnalati a parte (gestiti via frontend)
-- ============================================================

-- Funzione: dato un mese (date, primo giorno), ritorna il numero
-- di giorni di riferimento da usare per quel mese
create or replace function giorni_riferimento_mese(p_mese date)
returns integer as $$
declare
  v_giorni_nel_mese integer;
begin
  v_giorni_nel_mese := extract(day from (date_trunc('month', p_mese) + interval '1 month - 1 day'));

  if v_giorni_nel_mese = 28 then
    return 24;
  elsif v_giorni_nel_mese = 29 then
    return 25;
  else
    return 26;
  end if;
end;
$$ language plpgsql immutable;

-- Vista: per ogni dipendente e ogni mese presente nei dati di presenza,
-- calcola giorni presenti, giorni parziali, riferimento, e stipendio dovuto
create or replace view stipendi_calcolati as
select
  d.id as dipendente_id,
  d.nome,
  date_trunc('month', p.data)::date as mese,
  count(*) filter (where p.stato = 'presente') as giorni_presenti,
  count(*) filter (where p.stato = 'parziale') as giorni_parziali,
  count(*) filter (where p.stato = 'assente') as giorni_assenti,
  giorni_riferimento_mese(date_trunc('month', p.data)::date) as riferimento,
  d.stipendio_eur,
  d.stipendio_egp,
  round(
    (count(*) filter (where p.stato = 'presente')::numeric
     / giorni_riferimento_mese(date_trunc('month', p.data)::date))
    * d.stipendio_eur, 2
  ) as stipendio_dovuto_eur,
  round(
    (count(*) filter (where p.stato = 'presente')::numeric
     / giorni_riferimento_mese(date_trunc('month', p.data)::date))
    * d.stipendio_egp, 2
  ) as stipendio_dovuto_egp
from dipendenti d
join presenze p on p.dipendente_id = d.id
group by d.id, d.nome, date_trunc('month', p.data), d.stipendio_eur, d.stipendio_egp;
