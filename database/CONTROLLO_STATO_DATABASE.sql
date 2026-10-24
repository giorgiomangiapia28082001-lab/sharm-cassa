-- ============================================================
-- CONTROLLO STATO DATABASE  (versione sicura)
--
-- Incolla TUTTO e premi Run: esce una sola tabella.
-- NON MODIFICA NIENTE: legge soltanto.
--
-- Funziona anche se non hai eseguito tutte le migrazioni: le parti
-- mancanti vengono segnalate senza bloccare il controllo.
--
-- Come leggerlo: cerca "MANCA" o "ATTENZIONE" nella colonna esito.
-- Se non ce ne sono, il database e' integro.
-- ============================================================

with
attese(ordine, tabella, obbligatoria) as (
  values
    (1,'profiles',true), (2,'incassi',true), (3,'uscite',true),
    (4,'categorie_uscite',true), (5,'dipendenti',true), (6,'presenze',true),
    (7,'acconti',true), (8,'movimenti_cassa',true), (9,'tassi_cambio',true),
    (10,'soci',true), (11,'spese_socio',true),
    (12,'spese_fisse',true), (13,'pagamenti_spese_fisse',true),
    (14,'clienti_b2b',true), (15,'produzioni_b2b',true), (16,'pagamenti_b2b',true),
    (17,'periodi_cassa',true), (18,'periodi_soci',true),
    (19,'incassi_chioschetto',false),
    (20,'versamenti_socio',false)
),
conteggi as (
  select
    a.ordine, a.tabella, a.obbligatoria,
    case when to_regclass('public.' || a.tabella) is null then null
         else (xpath('/row/c/text()',
                 query_to_xml(format('select count(*) as c from public.%I', a.tabella),
                              false, true, '')))[1]::text::bigint
    end as righe
  from attese a
),
colonna_esiste as (
  select bool_or(table_name='profiles' and column_name='attivo') as profiles_attivo
  from information_schema.columns where table_schema='public'
)

select * from (

  select 0 as ord, '=== TABELLE ===' as voce, '' as esito
  union all
  select c.ordine, c.tabella,
    case
      when c.righe is null and c.obbligatoria then '*** MANCA - problema ***'
      when c.righe is null then 'non creata (migrazione non eseguita)'
      else c.righe::text || ' righe'
    end
  from conteggi c

  union all select 30, '=== FUNZIONI E VISTE ===', ''
  union all
  select 31, 'Vista saldo_cassa_attuale',
    case when to_regclass('public.saldo_cassa_attuale') is null
         then '*** MANCA - problema ***' else 'presente' end
  union all
  select 32, '  -> filtra per periodo?',
    case when to_regclass('public.saldo_cassa_attuale') is null then '-'
         when pg_get_viewdef('saldo_cassa_attuale'::regclass) like '%periodo_cassa_id%'
           then 'si (corretto)'
         else '*** ATTENZIONE: manca il filtro ***' end
  union all
  select 33, 'get_my_role (controllo permessi)',
    case when exists (select 1 from pg_proc where proname='get_my_role')
         then 'presente' else '*** MANCA - nessuno accede ***' end
  union all
  select 34, 'periodo_cassa_aperto_id',
    case when exists (select 1 from pg_proc where proname='periodo_cassa_aperto_id')
         then 'presente' else '*** MANCA - problema ***' end
  union all
  select 35, 'chiudi_periodo_cassa',
    case when exists (select 1 from pg_proc where proname='chiudi_periodo_cassa')
         then 'presente' else '*** MANCA ***' end
  union all
  select 36, 'annulla_chiusura_cassa (migr. 27)',
    case when exists (select 1 from pg_proc where proname='annulla_chiusura_cassa')
         then 'presente' else 'non eseguita' end
  union all
  select 37, 'Colonna profiles.attivo (migr. 30)',
    case when (select profiles_attivo from colonna_esiste)
         then 'presente' else 'non eseguita' end

  union all select 40, '=== SICUREZZA ===', ''
  union all
  select 41, 'Tabelle SENZA protezione',
    coalesce((select string_agg(cl.relname, ', ')
              from pg_class cl join pg_namespace n on n.oid=cl.relnamespace
              where n.nspname='public' and cl.relkind='r' and not cl.relrowsecurity),
             'nessuna - tutto protetto')
  union all
  select 42, 'Regole di accesso totali',
    (select count(*)::text from pg_policies where schemaname='public')

  union all select 50, '=== STATO OPERATIVO ===', ''
  union all
  select 51, 'Periodo cassa aperto',
    coalesce((select 'n.' || numero::text from periodi_cassa where data_chiusura is null limit 1),
             '*** NESSUNO - va sistemato ***')
  union all
  select 52, 'Righe orfane (senza periodo)',
    ((select count(*) from incassi where periodo_cassa_id is null)
   + (select count(*) from uscite where periodo_cassa_id is null)
   + (select count(*) from movimenti_cassa where periodo_cassa_id is null))::text
  union all
  select 53, 'Ultimo incasso',
    coalesce((select max(data)::text from incassi), 'nessuno')
  union all
  select 54, 'Ultima uscita',
    coalesce((select max(data)::text from uscite), 'nessuna')

  union all select 60, '=== TABELLE ESTRANEE ===', ''
  union all
  select 61, 'Create per sbaglio?',
    coalesce((select string_agg(tablename, ', ') from pg_tables
              where schemaname='public'
                and tablename not in (select tabella from attese)
                and tablename not in ('chiusure_cassa','delivery')),
             'nessuna - pulito')

) t order by ord;
