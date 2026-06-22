-- ============================================================
-- SCHEMA DATABASE - Gestionale Ristorante Sharm
-- Da eseguire nel SQL Editor di Supabase
-- ============================================================

-- Estensione per UUID
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. PROFILI UTENTE (ruoli)
-- ============================================================
-- Si appoggia a auth.users di Supabase, aggiungiamo i ruoli
create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  nome text not null,
  ruolo text not null check (ruolo in ('master', 'operatore', 'viewer')),
  created_at timestamptz default now()
);

-- ============================================================
-- 2. TASSI DI CAMBIO (impostati dal Master, validi per periodo)
-- ============================================================
create table tassi_cambio (
  id uuid default uuid_generate_v4() primary key,
  data date not null default current_date,
  eur_usd numeric(10,4) not null default 1.08,
  eur_egp numeric(10,4) not null default 60,
  eur_gbp numeric(10,4) not null default 0.85,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- ============================================================
-- 3. INCASSI GIORNALIERI
-- ============================================================
create table incassi (
  id uuid default uuid_generate_v4() primary key,
  data date not null,
  eur_contanti numeric(10,2) default 0,
  fondo_cassa numeric(10,2) default 0,
  bonifici numeric(10,2) default 0,
  gbp_pos numeric(10,2) default 0,           -- Pound via POS
  gbp_contanti numeric(10,2) default 0,      -- eventuali pound contanti
  usd_contanti numeric(10,2) default 0,
  egp_contanti numeric(10,2) default 0,      -- Lire egiziane
  delivery numeric(10,2) default 0,
  numero_persone integer default 0,
  note text,
  inserito_da uuid references profiles(id) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- 4. CATEGORIE USCITE (predefinite, gestibili dal Master)
-- ============================================================
create table categorie_uscite (
  id uuid default uuid_generate_v4() primary key,
  nome text not null unique,
  attiva boolean default true,
  ordine integer default 0
);

insert into categorie_uscite (nome, ordine) values
  ('Materie Prime', 1),
  ('Dipendenti', 2),
  ('Case dipendenti', 3),
  ('Cibo staff', 4),
  ('Fitto', 5),
  ('Manutenzione', 6),
  ('Utenze', 7),
  ('Varie', 8);

-- ============================================================
-- 5. USCITE (singole spese)
-- ============================================================
create table uscite (
  id uuid default uuid_generate_v4() primary key,
  data date not null,
  descrizione text not null,
  categoria_id uuid references categorie_uscite(id) not null,
  valuta text not null check (valuta in ('EUR', 'USD', 'EGP', 'GBP')),
  importo numeric(10,2) not null,
  metodo_pagamento text default 'contanti' check (metodo_pagamento in ('contanti', 'pos', 'bonifico')),
  foto_url text,                              -- scontrino/fattura
  inserito_da uuid references profiles(id) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- 6. DIPENDENTI
-- ============================================================
create table dipendenti (
  id uuid default uuid_generate_v4() primary key,
  nome text not null,
  ruolo_lavoro text,                          -- es. "Chef", "Cameriere", "Lavapiatti"
  foto_url text,
  data_inizio date,
  stipendio_eur numeric(10,2) default 0,
  stipendio_egp numeric(10,2) default 0,
  attivo boolean default true,
  note text,
  created_at timestamptz default now()
);

-- ============================================================
-- 7. PRESENZE GIORNALIERE
-- ============================================================
create table presenze (
  id uuid default uuid_generate_v4() primary key,
  dipendente_id uuid references dipendenti(id) on delete cascade not null,
  data date not null,
  stato text not null check (stato in ('presente', 'assente', 'parziale')),
  note text,                                  -- es. "uscito alle 21:30"
  inserito_da uuid references profiles(id),
  created_at timestamptz default now(),
  unique(dipendente_id, data)
);

-- ============================================================
-- 8. ACCONTI DIPENDENTI
-- ============================================================
create table acconti (
  id uuid default uuid_generate_v4() primary key,
  dipendente_id uuid references dipendenti(id) on delete cascade not null,
  data date not null,
  importo_eur numeric(10,2) default 0,
  importo_egp numeric(10,2) default 0,
  note text,
  inserito_da uuid references profiles(id) not null,
  created_at timestamptz default now()
);

-- ============================================================
-- 9. SPESE PERSONALI SOCI (Gianluigi, Luca, ecc.)
-- ============================================================
create table soci (
  id uuid default uuid_generate_v4() primary key,
  nome text not null unique
);

insert into soci (nome) values ('Gianluigi'), ('Luca');

create table spese_socio (
  id uuid default uuid_generate_v4() primary key,
  socio_id uuid references soci(id) not null,
  data date not null,
  descrizione text,
  importo_eur numeric(10,2) default 0,
  importo_egp numeric(10,2) default 0,
  foto_url text,
  created_at timestamptz default now()
);

-- ============================================================
-- INDICI per le query più frequenti
-- ============================================================
create index idx_incassi_data on incassi(data);
create index idx_uscite_data on uscite(data);
create index idx_uscite_categoria on uscite(categoria_id);
create index idx_presenze_data on presenze(data);
create index idx_acconti_dipendente on acconti(dipendente_id);
create index idx_acconti_data on acconti(data);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — qui definiamo CHI vede/modifica COSA
-- ============================================================
alter table profiles enable row level security;
alter table incassi enable row level security;
alter table uscite enable row level security;
alter table dipendenti enable row level security;
alter table presenze enable row level security;
alter table acconti enable row level security;
alter table spese_socio enable row level security;
alter table tassi_cambio enable row level security;
alter table categorie_uscite enable row level security;

-- Funzione helper: ritorna il ruolo dell'utente corrente
create or replace function get_my_role() returns text as $$
  select ruolo from profiles where id = auth.uid();
$$ language sql security definer stable;

-- PROFILES: ognuno vede il proprio profilo + master vede tutti
create policy "profiles_select" on profiles for select using (
  id = auth.uid() or get_my_role() = 'master'
);

-- INCASSI: master vede tutto; operatore vede/inserisce solo i propri; viewer vede tutto in lettura
create policy "incassi_select" on incassi for select using (
  get_my_role() = 'master' or get_my_role() = 'viewer' or inserito_da = auth.uid()
);
create policy "incassi_insert" on incassi for insert with check (
  get_my_role() in ('master', 'operatore')
);
create policy "incassi_update" on incassi for update using (
  get_my_role() = 'master'
);
create policy "incassi_delete" on incassi for delete using (
  get_my_role() = 'master'
);

-- USCITE: stessa logica degli incassi
create policy "uscite_select" on uscite for select using (
  get_my_role() = 'master' or get_my_role() = 'viewer' or inserito_da = auth.uid()
);
create policy "uscite_insert" on uscite for insert with check (
  get_my_role() in ('master', 'operatore')
);
create policy "uscite_update" on uscite for update using (
  get_my_role() = 'master'
);
create policy "uscite_delete" on uscite for delete using (
  get_my_role() = 'master'
);

-- DIPENDENTI: tutti i ruoli autenticati possono leggere; solo master modifica
create policy "dipendenti_select" on dipendenti for select using (
  auth.uid() is not null
);
create policy "dipendenti_insert" on dipendenti for insert with check (
  get_my_role() = 'master'
);
create policy "dipendenti_update" on dipendenti for update using (
  get_my_role() = 'master'
);
create policy "dipendenti_delete" on dipendenti for delete using (
  get_my_role() = 'master'
);

-- PRESENZE: master vede tutto; operatore inserisce e vede le proprie; viewer legge
create policy "presenze_select" on presenze for select using (
  get_my_role() = 'master' or get_my_role() = 'viewer' or inserito_da = auth.uid()
);
create policy "presenze_insert" on presenze for insert with check (
  get_my_role() in ('master', 'operatore')
);
create policy "presenze_update" on presenze for update using (
  get_my_role() = 'master' or inserito_da = auth.uid()
);
create policy "presenze_delete" on presenze for delete using (
  get_my_role() = 'master'
);

-- ACCONTI: master vede tutto; operatore inserisce e vede i propri; viewer legge
create policy "acconti_select" on acconti for select using (
  get_my_role() = 'master' or get_my_role() = 'viewer' or inserito_da = auth.uid()
);
create policy "acconti_insert" on acconti for insert with check (
  get_my_role() in ('master', 'operatore')
);
create policy "acconti_update" on acconti for update using (
  get_my_role() = 'master'
);
create policy "acconti_delete" on acconti for delete using (
  get_my_role() = 'master'
);

-- SPESE SOCIO: solo master (sezione riservata proprietari)
create policy "spese_socio_select" on spese_socio for select using (
  get_my_role() in ('master', 'viewer')
);
create policy "spese_socio_insert" on spese_socio for insert with check (
  get_my_role() = 'master'
);
create policy "spese_socio_update" on spese_socio for update using (
  get_my_role() = 'master'
);
create policy "spese_socio_delete" on spese_socio for delete using (
  get_my_role() = 'master'
);

-- TASSI CAMBIO: tutti leggono, solo master scrive
create policy "tassi_select" on tassi_cambio for select using (
  auth.uid() is not null
);
create policy "tassi_insert" on tassi_cambio for insert with check (
  get_my_role() = 'master'
);

-- CATEGORIE USCITE: tutti leggono, solo master modifica
create policy "categorie_select" on categorie_uscite for select using (
  auth.uid() is not null
);
create policy "categorie_insert" on categorie_uscite for insert with check (
  get_my_role() = 'master'
);
create policy "categorie_update" on categorie_uscite for update using (
  get_my_role() = 'master'
);
