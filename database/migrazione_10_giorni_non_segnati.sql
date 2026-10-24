-- ============================================================
-- MIGRAZIONE 10: i giorni SENZA alcun record di presenza
-- contano come ASSENZA nel calcolo dello stipendio.
-- Sostituiamo la vista "stipendi_calcolati" con una versione che,
-- per ogni dipendente e mese, genera tutti i giorni del mese
-- trascorsi finora (non quelli futuri) e calcola presenze/assenze
-- includendo i giorni senza record come assenti.
-- ============================================================

-- Eliminiamo prima la vista esistente: Postgres non permette di
-- "sostituire sul posto" una vista se cambia la struttura/ordine delle colonne
drop view if exists stipendi_calcolati;

create view stipendi_calcolati as
with mesi_dipendenti as (
  -- Tutti i mesi in cui un dipendente esiste, dal mese di inizio (o oggi se non specificato) fino al mese corrente
  select
    d.id as dipendente_id,
    d.nome,
    d.stipendio_eur,
    d.stipendio_egp,
    date_trunc('month', current_date)::date as mese
  from dipendenti d
  where d.attivo = true
),
giorni_del_mese as (
  -- Genera un giorno per ogni data dal 1° del mese a oggi (non oltre oggi)
  select
    md.dipendente_id,
    md.nome,
    md.stipendio_eur,
    md.stipendio_egp,
    md.mese,
    gs.giorno::date as giorno
  from mesi_dipendenti md
  cross join lateral generate_series(
    md.mese,
    least((md.mese + interval '1 month - 1 day')::date, current_date),
    interval '1 day'
  ) as gs(giorno)
),
giorni_con_stato as (
  select
    g.*,
    coalesce(p.stato, 'assente') as stato_effettivo
    -- se non c'è nessun record per quel giorno, viene trattato come assente
  from giorni_del_mese g
  left join presenze p on p.dipendente_id = g.dipendente_id and p.data = g.giorno
)
select
  dipendente_id,
  nome,
  mese,
  count(*) filter (where stato_effettivo = 'presente') as giorni_presenti,
  count(*) filter (where stato_effettivo = 'parziale') as giorni_parziali,
  count(*) filter (where stato_effettivo = 'assente') as giorni_assenti,
  -- elenco dei giorni assenti (numero del giorno nel mese), per la visualizzazione
  array_agg(extract(day from giorno)::int order by giorno) filter (where stato_effettivo = 'assente') as elenco_giorni_assenti,
  -- elenco dei giorni assenti che NON avevano nessun record inserito (vera "dimenticanza")
  array_agg(extract(day from giorno)::int order by giorno) filter (
    where stato_effettivo = 'assente'
    and not exists (select 1 from presenze p2 where p2.dipendente_id = giorni_con_stato.dipendente_id and p2.data = giorni_con_stato.giorno)
  ) as elenco_giorni_non_segnati,
  array_agg(extract(day from giorno)::int order by giorno) filter (where stato_effettivo = 'parziale') as elenco_giorni_parziali,
  giorni_riferimento_mese(mese) as riferimento,
  stipendio_eur,
  stipendio_egp,
  round(
    (count(*) filter (where stato_effettivo = 'presente')::numeric
     / giorni_riferimento_mese(mese))
    * stipendio_eur, 2
  ) as stipendio_dovuto_eur,
  round(
    (count(*) filter (where stato_effettivo = 'presente')::numeric
     / giorni_riferimento_mese(mese))
    * stipendio_egp, 2
  ) as stipendio_dovuto_egp
from giorni_con_stato
group by dipendente_id, nome, mese, stipendio_eur, stipendio_egp;

grant select on stipendi_calcolati to authenticated;
