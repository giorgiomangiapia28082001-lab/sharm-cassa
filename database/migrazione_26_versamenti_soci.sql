-- ============================================================
-- MIGRAZIONE 26 — Versamenti dei soci (separati dalla cassa)
--
-- I soci a volte mettono contanti di tasca propria. Finora l'unico modo di
-- registrarli era il "Versamento" dentro la Cassa, che però fa aumentare
-- subito il saldo del direttore.
--
-- Con questa tabella i soci segnano i propri versamenti NELLA LORO SEZIONE,
-- con tanto di foto/PDF allegato. Questi movimenti:
--   • NON entrano nel saldo cassa del direttore;
--   • NON compaiono nella sezione Cassa;
--   • restano nella contabilità soci, con il loro periodo.
--
-- Quando vorrai, sarai TU a inserirli manualmente in Cassa come
-- "Versamento", così resta traccia di chi ha deciso e quando.
-- ============================================================

create table if not exists versamenti_socio (
  id uuid default uuid_generate_v4() primary key,
  socio_id uuid references soci(id) not null,
  data date not null,
  descrizione text,
  importo_eur numeric(10,2) default 0,
  importo_egp numeric(10,2) default 0,
  foto_url text,                     -- foto o PDF della ricevuta
  periodo_soci_id uuid references periodi_soci(id),
  -- Segna se hai già riportato a mano questo versamento nella Cassa.
  -- Serve solo come promemoria per te: non ha nessun effetto sul saldo.
  riportato_in_cassa boolean default false,
  inserito_da uuid references profiles(id),
  created_at timestamptz default now()
);

create index if not exists idx_versamenti_socio_data on versamenti_socio(data);
create index if not exists idx_versamenti_socio_socio on versamenti_socio(socio_id);

-- Assegnazione automatica al periodo soci aperto (come le spese)
drop trigger if exists trg_assegna_periodo_versamenti on versamenti_socio;
create trigger trg_assegna_periodo_versamenti before insert on versamenti_socio
  for each row execute function assegna_periodo_soci();

-- Sicurezza: sezione riservata ai proprietari, come le spese socio
alter table versamenti_socio enable row level security;

drop policy if exists "versamenti_socio_select" on versamenti_socio;
drop policy if exists "versamenti_socio_insert" on versamenti_socio;
drop policy if exists "versamenti_socio_update" on versamenti_socio;
drop policy if exists "versamenti_socio_delete" on versamenti_socio;

create policy "versamenti_socio_select" on versamenti_socio for select using (
  get_my_role() in ('master', 'viewer')
);
create policy "versamenti_socio_insert" on versamenti_socio for insert with check (
  get_my_role() = 'master'
);
create policy "versamenti_socio_update" on versamenti_socio for update using (
  get_my_role() = 'master'
);
create policy "versamenti_socio_delete" on versamenti_socio for delete using (
  get_my_role() = 'master'
);

-- ============================================================
-- PROMEMORIA
-- Questa tabella NON compare in "saldo_cassa_attuale": è voluto.
-- La cassa del direttore resta indipendente dalla contabilità soci.
-- ============================================================
