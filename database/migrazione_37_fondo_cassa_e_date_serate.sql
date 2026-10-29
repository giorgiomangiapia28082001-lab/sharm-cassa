-- ============================================================
--  MIGRAZIONE 37 · Fondo cassa con una sola formula + controllo date serate
--
--  1. FONDO CASSA
--     Il fondo cassa € di una serata sono soldi che restano nel cassetto:
--     si contano nell'incasso di quella serata e si tolgono la serata
--     dopo (i contanti contati la sera dopo li comprendono già).
--     Le pagine (Riepilogo, Incassi, Archivio) facevano già così, mentre
--     saldo_periodo_cassa() sommava i fondi di tutte le sere senza mai
--     toglierli: la Cassa mostrava più euro del vero (118,50 € nel
--     periodo 7, controllato il 28/10/2026).
--     Ora il saldo usa la stessa regola. Il "fondo di ieri" è quello della
--     serata precedente anche se sta nel periodo prima: dopo una chiusura
--     il fondo resta nel cassetto e la prima serata del periodo nuovo lo
--     comprende già.
--     saldo_periodo_cassa() è riscritta UGUALE alla migrazione 36, cambia
--     solo la prima riga dei contanti EUR.
--
--  2. fondo_prima_del_periodo(id): il fondo dell'ultima serata prima del
--     periodo, per fare lo stesso calcolo nelle pagine.
--
--  3. controlla_data_serata(tabella, data): ultima serata registrata e se
--     quella data c'è già. Serve all'avviso "data insolita" quando si
--     inserisce una serata. Restituisce solo date, nessun importo, e vede
--     le serate di tutti (l'operatore da solo vede solo le sue).
--
--  Si può eseguire più volte senza danni.
--  Per tornare indietro: rieseguire la parte 1 della migrazione 36.
-- ============================================================


-- ── Il "fondo di ieri" di ogni serata (ordine: data, poi inserimento) ──
create or replace function public.fondo_prima_del_periodo(p_periodo_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select i.fondo_cassa
    from incassi i
    join (
      select data, created_at from incassi
      where periodo_cassa_id = p_periodo_id
      order by data, created_at, id
      limit 1
    ) prima on (i.data, i.created_at) < (prima.data, prima.created_at)
    order by i.data desc, i.created_at desc, i.id desc
    limit 1
  ), 0)
$$;

revoke execute on function public.fondo_prima_del_periodo(uuid) from public, anon;
grant execute on function public.fondo_prima_del_periodo(uuid) to authenticated;


-- ── 1 · Saldo ──
create or replace function public.saldo_periodo_cassa(p_periodo_id uuid)
returns table (
  contanti_eur numeric,
  contanti_egp numeric,
  contanti_usd numeric,
  saldo_pos_egp numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    -- ── CONTANTI EUR ──
    -- fondo di oggi in più, fondo della serata prima in meno
      coalesce((select sum(eur_contanti + bonifici + delivery_eur + fondo_cassa) from incassi where periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(fondo_ieri) from (
        select periodo_cassa_id, lag(fondo_cassa, 1, 0) over (order by data, created_at, id) as fondo_ieri from incassi
      ) f where periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(eur_contanti + bonifici) from incassi_chioschetto where periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'EUR' and coalesce(metodo_pagamento, 'contanti') in ('contanti', 'bonifico') and periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'EUR' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'EUR' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'incasso_b2b' and valuta_a = 'EUR' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'versamento' and valuta_a = 'EUR' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'rettifica' and valuta_a = 'EUR' and periodo_cassa_id = p_periodo_id), 0),

    -- ── CONTANTI EGP ──
      coalesce((select sum(egp_contanti + delivery_egp) from incassi where periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(egp_contanti) from incassi_chioschetto where periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'EGP' and coalesce(metodo_pagamento, 'contanti') in ('contanti', 'bonifico') and periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'EGP' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'EGP' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_pos) from movimenti_cassa where tipo = 'prelievo_pos' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'versamento' and valuta_a = 'EGP' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'rettifica' and valuta_a = 'EGP' and periodo_cassa_id = p_periodo_id), 0),

    -- ── CONTANTI USD ──
      coalesce((select sum(usd_contanti) from incassi where periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(usd_contanti) from incassi_chioschetto where periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'USD' and coalesce(metodo_pagamento, 'contanti') in ('contanti', 'bonifico') and periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'USD' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'USD' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'versamento' and valuta_a = 'USD' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'rettifica' and valuta_a = 'USD' and periodo_cassa_id = p_periodo_id), 0),

    -- ── SALDO POS (EGP) ──
      coalesce((select sum(egp_pos) from incassi where periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(egp_pos) from incassi_chioschetto where periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo_pos) from movimenti_cassa where tipo = 'prelievo_pos' and periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'EGP' and metodo_pagamento = 'pos' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_pos) from movimenti_cassa where tipo = 'versamento' and importo_pos > 0 and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_pos) from movimenti_cassa where tipo = 'rettifica' and valuta_a is null and periodo_cassa_id = p_periodo_id), 0)
$$;

revoke execute on function public.saldo_periodo_cassa(uuid) from public, anon;
grant execute on function public.saldo_periodo_cassa(uuid) to authenticated;


-- ── 3 · Controllo date delle serate ──
create or replace function public.controlla_data_serata(p_tabella text, p_data date)
returns table (ultima_data date, gia_presente boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_tabella = 'incassi' then
    return query select
      (select max(data) from incassi),
      exists (select 1 from incassi where data = p_data);
  elsif p_tabella = 'incassi_chioschetto' then
    return query select
      (select max(data) from incassi_chioschetto),
      exists (select 1 from incassi_chioschetto where data = p_data);
  else
    raise exception 'Tabella non ammessa: %', p_tabella;
  end if;
end;
$$;

revoke execute on function public.controlla_data_serata(text, date) from public, anon;
grant execute on function public.controlla_data_serata(text, date) to authenticated;
