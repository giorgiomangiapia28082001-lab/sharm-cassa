-- ============================================================
--  MIGRAZIONE 38 · L'operatore vede tutti gli incassi e le uscite
--
--  Prima l'operatore vedeva solo le righe inserite da lui in incassi,
--  incassi_chioschetto e uscite: i suoi totali (Riepilogo, Incassi,
--  Uscite) erano parziali. Deciso il 29/10/2026: visione comune, l'operatore
--  vede anche le righe inserite dagli altri.
--
--  Cambia SOLO la lettura. Inserire, modificare ed eliminare restano come
--  prima (modifiche ed eliminazioni solo master). Il proprietario ha già una
--  sua regola di lettura (proprietario_select) che non viene toccata.
--
--  Si può eseguire più volte senza danni.
--  Per tornare indietro: ricreare le tre regole senza 'operatore' nell'elenco.
-- ============================================================

drop policy if exists incassi_select on public.incassi;
create policy incassi_select on public.incassi
  for select
  using (get_my_role() in ('master', 'viewer', 'operatore') or inserito_da = auth.uid());

drop policy if exists incassi_chioschetto_select on public.incassi_chioschetto;
create policy incassi_chioschetto_select on public.incassi_chioschetto
  for select
  using (get_my_role() in ('master', 'viewer', 'operatore') or inserito_da = auth.uid());

drop policy if exists uscite_select on public.uscite;
create policy uscite_select on public.uscite
  for select
  using (get_my_role() in ('master', 'viewer', 'operatore') or inserito_da = auth.uid());
