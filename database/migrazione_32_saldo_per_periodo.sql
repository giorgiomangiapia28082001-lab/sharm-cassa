-- ============================================================
--  MIGRAZIONE 32 · Saldo calcolabile per qualsiasi periodo
--
--  Serve alla nuova pagina "Archivio periodi": per ogni periodo
--  chiuso mostra il saldo ricalcolato dalle voci di quel periodo,
--  così se correggi un incasso o un'uscita di un mese passato
--  il riepilogo dell'archivio si aggiorna da solo.
--
--  La formula è IDENTICA a quella della vista saldo_cassa_attuale
--  com'era sul database il 24/10/2026 (migrazioni 08, 16, 19, 20,
--  22, 23). Ora la formula sta in un posto solo: la funzione
--  saldo_periodo_cassa(), e la vista saldo_cassa_attuale la usa
--  per il periodo aperto. Chi tocca il calcolo del saldo deve
--  modificare SOLO la funzione.
--
--  I numeri 29, 30 e 31 sono saltati di proposito: erano usati da
--  migrazioni di cui non si trovano più i file.
--
--  Si può eseguire più volte senza danni.
-- ============================================================

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
      coalesce((select sum(eur_contanti + fondo_cassa + bonifici + delivery_eur) from incassi where periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(eur_contanti + bonifici) from incassi_chioschetto where periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'EUR' and coalesce(metodo_pagamento, 'contanti') in ('contanti', 'bonifico') and periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'EUR' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'EUR' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'incasso_b2b' and valuta_a = 'EUR' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'versamento' and valuta_a = 'EUR' and periodo_cassa_id = p_periodo_id), 0),

    -- ── CONTANTI EGP ──
      coalesce((select sum(egp_contanti + delivery_egp) from incassi where periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(egp_contanti) from incassi_chioschetto where periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'EGP' and coalesce(metodo_pagamento, 'contanti') in ('contanti', 'bonifico') and periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'EGP' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'EGP' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_pos) from movimenti_cassa where tipo = 'prelievo_pos' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'versamento' and valuta_a = 'EGP' and periodo_cassa_id = p_periodo_id), 0),

    -- ── CONTANTI USD ──
      coalesce((select sum(usd_contanti) from incassi where periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(usd_contanti) from incassi_chioschetto where periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'USD' and coalesce(metodo_pagamento, 'contanti') in ('contanti', 'bonifico') and periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'USD' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'USD' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'versamento' and valuta_a = 'USD' and periodo_cassa_id = p_periodo_id), 0),

    -- ── SALDO POS (EGP) ──
      coalesce((select sum(egp_pos) from incassi where periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(egp_pos) from incassi_chioschetto where periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo_pos) from movimenti_cassa where tipo = 'prelievo_pos' and periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'EGP' and metodo_pagamento = 'pos' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_pos) from movimenti_cassa where tipo = 'versamento' and importo_pos > 0 and periodo_cassa_id = p_periodo_id), 0)
$$;

-- Solo chi ha fatto l'accesso può chiederla (di base Postgres la lascia
-- usare a chiunque, anche senza login).
revoke execute on function public.saldo_periodo_cassa(uuid) from public, anon;
grant execute on function public.saldo_periodo_cassa(uuid) to authenticated;


-- Indici sul periodo: ora tutte le pagine filtrano per periodo,
-- così le ricerche restano veloci anche con anni di dati.
create index if not exists idx_incassi_periodo             on public.incassi (periodo_cassa_id);
create index if not exists idx_incassi_chioschetto_periodo on public.incassi_chioschetto (periodo_cassa_id);
create index if not exists idx_uscite_periodo              on public.uscite (periodo_cassa_id);
create index if not exists idx_movimenti_cassa_periodo     on public.movimenti_cassa (periodo_cassa_id);
create index if not exists idx_acconti_periodo             on public.acconti (periodo_cassa_id);


-- La vista del periodo aperto ora usa la stessa funzione.
-- Stesse colonne, stesso ordine: chi la legge (pagina Cassa,
-- chiudi_periodo_cassa) non si accorge della differenza.
create or replace view public.saldo_cassa_attuale as
  select * from public.saldo_periodo_cassa(public.periodo_cassa_aperto_id());


-- Controllo (sola lettura, da eseguire dopo): per ogni periodo chiuso
-- confronta la fotografia salvata alla chiusura con il saldo ricalcolato.
-- select p.numero, p.contanti_eur, s.contanti_eur, p.contanti_egp, s.contanti_egp,
--        p.contanti_usd, s.contanti_usd, p.saldo_pos_egp, s.saldo_pos_egp
-- from periodi_cassa p, lateral public.saldo_periodo_cassa(p.id) s
-- order by p.numero;
