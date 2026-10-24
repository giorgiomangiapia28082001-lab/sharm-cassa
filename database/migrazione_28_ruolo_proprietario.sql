-- ============================================================
-- MIGRAZIONE 28 — Nuovo ruolo "proprietario"
--
-- Serve un account che possa VEDERE e AGGIUNGERE tutto, ma che non possa
-- MODIFICARE né CANCELLARE nulla: solo il master può correggere.
--
-- I ruoli esistenti non andavano bene:
--   • "operatore" non può aggiungere dipendenti, spese soci, clienti Sadiki
--     o spese fisse, e non vede nemmeno la sezione Soci;
--   • "viewer" può solo guardare, non inserisce niente.
--
-- Da qui il ruolo "proprietario":
--   ✓ vede tutto          ✓ aggiunge tutto
--   ✗ non modifica        ✗ non cancella
-- ============================================================

-- 1. Permettiamo il nuovo valore nella colonna "ruolo"
do $$
declare v_nome text;
begin
  select conname into v_nome
  from pg_constraint
  where conrelid = 'profiles'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%ruolo%';

  if v_nome is not null then
    execute format('alter table profiles drop constraint %I', v_nome);
  end if;

  alter table profiles add constraint profiles_ruolo_check
    check (ruolo in ('master', 'operatore', 'viewer', 'proprietario'));
end $$;


-- 2. Diamo al proprietario il permesso di LEGGERE e AGGIUNGERE su tutte
--    le tabelle. Non creiamo policy di modifica o cancellazione: quelle
--    restano riservate al master, che le ha già.
do $$
declare
  v_tabella text;
  v_elenco text[] := array[
    'incassi', 'incassi_chioschetto', 'uscite', 'categorie_uscite',
    'dipendenti', 'presenze', 'acconti',
    'spese_socio', 'versamenti_socio', 'soci',
    'spese_fisse', 'pagamenti_spese_fisse',
    'clienti_b2b', 'produzioni_b2b', 'pagamenti_b2b',
    'movimenti_cassa', 'tassi_cambio',
    'periodi_cassa', 'periodi_soci', 'chiusure_cassa',
    'profiles'
  ];
begin
  foreach v_tabella in array v_elenco loop
    -- saltiamo le tabelle che non esistono in questo database
    if to_regclass('public.' || v_tabella) is null then
      continue;
    end if;

    execute format('drop policy if exists "proprietario_select" on %I', v_tabella);
    execute format(
      'create policy "proprietario_select" on %I for select using (get_my_role() = ''proprietario'')',
      v_tabella);

    -- Sui periodi e sui profili il proprietario può solo guardare:
    -- aprire/chiudere periodi e creare utenti resta compito del master.
    if v_tabella not in ('periodi_cassa', 'periodi_soci', 'chiusure_cassa', 'profiles') then
      execute format('drop policy if exists "proprietario_insert" on %I', v_tabella);
      execute format(
        'create policy "proprietario_insert" on %I for insert with check (get_my_role() = ''proprietario'')',
        v_tabella);
    end if;
  end loop;
end $$;


-- ============================================================
-- COME CREARE L'ACCOUNT (due passaggi, dalla dashboard Supabase)
--
-- PASSO 1 — Crea l'utente
--   Authentication → Users → "Add user" → "Create new user"
--   Inserisci email e password, e spunta "Auto Confirm User"
--   (senza quella spunta l'utente non riesce ad accedere).
--   Poi COPIA l'ID dell'utente appena creato.
--
-- PASSO 2 — Assegna il ruolo
--   Torna qui nel SQL Editor, incolla la riga qui sotto mettendo l'ID
--   copiato e il nome della persona, e premi Run:
--
--   insert into profiles (id, nome, ruolo)
--   values ('INCOLLA-QUI-L-ID', 'Nome del proprietario', 'proprietario');
--
-- Se il profilo esiste già e vuoi solo cambiargli il ruolo:
--
--   update profiles set ruolo = 'proprietario' where id = 'INCOLLA-QUI-L-ID';
--
-- Per vedere tutti gli account e i loro ruoli:
--
--   select id, nome, ruolo from profiles order by ruolo, nome;
-- ============================================================
