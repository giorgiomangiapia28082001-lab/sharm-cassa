-- ============================================================
-- PULIZIA — rimuovere le tabelle "garage" create per sbaglio
--
-- Il controllo ha mostrato che nel database del ristorante sono finite
-- 9 tabelle di un altro progetto (gestione veicoli/garage):
--   garage_beni, garage_scadenze, garage_interventi, garage_rifornimenti,
--   garage_pedaggi, garage_multe, garage_utenze, garage_documenti,
--   garage_officine
--
-- Non hanno fatto nessun danno: sono state solo AGGIUNTE, non hanno
-- toccato le tabelle del ristorante.
--
-- ============================================================
-- PASSO 1 — CONTROLLA PRIMA (esegui SOLO questa parte)
-- Serve a vedere se dentro c'e' gia' qualcosa che vuoi tenere.
-- Se sono tutte a 0 righe, puoi cancellarle tranquillamente.
-- ============================================================

select
  t.tablename as tabella,
  (xpath('/row/c/text()',
     query_to_xml(format('select count(*) as c from public.%I', t.tablename),
                  false, true, '')))[1]::text::bigint as righe
from pg_tables t
where t.schemaname = 'public'
  and t.tablename like 'garage_%'
order by t.tablename;


-- ============================================================
-- PASSO 2 — CANCELLA (esegui solo DOPO aver controllato il passo 1)
--
-- ATTENZIONE: e' definitivo. Togli i due trattini "--" davanti alle
-- righe qui sotto, poi selezionale ed esegui.
--
-- Se invece vuoi TENERE quel progetto, non cancellare niente: le
-- tabelle restano li' senza disturbare il gestionale del ristorante.
-- ============================================================

-- drop table if exists garage_documenti cascade;
-- drop table if exists garage_multe cascade;
-- drop table if exists garage_pedaggi cascade;
-- drop table if exists garage_rifornimenti cascade;
-- drop table if exists garage_interventi cascade;
-- drop table if exists garage_scadenze cascade;
-- drop table if exists garage_utenze cascade;
-- drop table if exists garage_officine cascade;
-- drop table if exists garage_beni cascade;


-- ============================================================
-- PASSO 3 — VERIFICA che siano sparite
-- ============================================================

-- select tablename from pg_tables
-- where schemaname='public' and tablename like 'garage_%';
