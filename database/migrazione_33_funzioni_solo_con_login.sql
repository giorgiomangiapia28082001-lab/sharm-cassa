-- ============================================================
--  MIGRAZIONE 33 · Le funzioni del database solo per chi ha fatto l'accesso
--
--  PROBLEMA (trovato il 24/10/2026 con il controllo di sicurezza
--  di Supabase): funzioni come chiudi_periodo_cassa e
--  annulla_chiusura_cassa si potevano chiamare SENZA login,
--  usando solo l'indirizzo del database e la chiave pubblica
--  (che è dentro l'app, quindi la può vedere chiunque).
--  Qualcuno da fuori poteva quindi chiudere o riaprire periodi.
--
--  COSA FA: toglie il permesso a chi non ha fatto l'accesso e lo
--  lascia agli utenti dell'app. Non cambia nessun calcolo e nessun
--  dato. I trigger continuano a funzionare (il permesso conta solo
--  quando una funzione viene chiamata direttamente).
--
--  get_my_role() resta com'è: la usano le regole di accesso delle
--  tabelle e non rivela niente a chi non ha fatto l'accesso.
--
--  Si può eseguire più volte senza danni.
-- ============================================================

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef                      -- solo le SECURITY DEFINER
      and p.proname <> 'get_my_role'
  loop
    execute format('revoke execute on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;


-- Controllo (sola lettura): deve restituire 0 righe.
-- select p.proname
-- from pg_proc p
-- where p.pronamespace = 'public'::regnamespace and p.prosecdef
--   and p.proname <> 'get_my_role'
--   and has_function_privilege('anon', p.oid, 'execute');
