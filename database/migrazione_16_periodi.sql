-- ============================================================
-- MIGRAZIONE 16: Chiusura periodo per CASSA e per SOCI (separate)
-- Sostituisce l'approccio "created_at > ultima chiusura" (fragile se poi
-- si modificano vecchie righe) con un sistema più solido a PERIODI:
-- ogni riga (movimento cassa / incasso / uscita / spesa socio) viene
-- assegnata al periodo APERTO al momento della sua creazione.
-- Il Master può chiudere un periodo (si congela, si fotografa il saldo)
-- e riaprirlo in qualsiasi momento per correggere errori, SENZA che
-- questo influisca sui totali del periodo corrente.
-- ============================================================

-- ============================================================
-- PARTE A — PERIODI CASSA
-- ============================================================

create table if not exists periodi_cassa (
  id uuid default uuid_generate_v4() primary key,
  numero serial,                          -- 1, 2, 3... solo per ordinamento leggibile
  data_apertura timestamptz not null default now(),
  data_chiusura timestamptz,              -- null = periodo ancora aperto
  -- fotografia del saldo al momento della chiusura
  contanti_eur numeric(10,2),
  contanti_egp numeric(10,2),
  contanti_usd numeric(10,2),
  saldo_pos_egp numeric(10,2),
  note text,
  chiuso_da uuid references profiles(id),
  created_at timestamptz default now()
);

-- Garantisce che esista sempre al massimo UN periodo aperto
create unique index if not exists idx_un_solo_periodo_cassa_aperto
  on periodi_cassa ((data_chiusura is null)) where (data_chiusura is null);

-- Crea il primo periodo aperto se non esiste ancora nessun periodo
insert into periodi_cassa (data_apertura)
  select now() where not exists (select 1 from periodi_cassa);

-- Colonna periodo_id sulle tabelle che alimentano il saldo cassa
alter table incassi add column if not exists periodo_cassa_id uuid references periodi_cassa(id);
alter table uscite add column if not exists periodo_cassa_id uuid references periodi_cassa(id);
alter table movimenti_cassa add column if not exists periodo_cassa_id uuid references periodi_cassa(id);

-- Funzione: ritorna l'id del periodo cassa attualmente aperto
create or replace function periodo_cassa_aperto_id()
returns uuid as $$
  select id from periodi_cassa where data_chiusura is null limit 1;
$$ language sql stable;

-- Trigger: assegna automaticamente il periodo aperto a ogni nuova riga
create or replace function assegna_periodo_cassa()
returns trigger as $$
begin
  if new.periodo_cassa_id is null then
    new.periodo_cassa_id := periodo_cassa_aperto_id();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_assegna_periodo_incassi on incassi;
create trigger trg_assegna_periodo_incassi before insert on incassi
  for each row execute function assegna_periodo_cassa();

drop trigger if exists trg_assegna_periodo_uscite on uscite;
create trigger trg_assegna_periodo_uscite before insert on uscite
  for each row execute function assegna_periodo_cassa();

drop trigger if exists trg_assegna_periodo_movimenti on movimenti_cassa;
create trigger trg_assegna_periodo_movimenti before insert on movimenti_cassa
  for each row execute function assegna_periodo_cassa();

-- Backfill: tutte le righe esistenti (create prima di questa migrazione)
-- vengono assegnate al periodo aperto corrente, così il saldo storico
-- continua a coincidere con quello attuale fino alla prima chiusura vera.
update incassi set periodo_cassa_id = periodo_cassa_aperto_id() where periodo_cassa_id is null;
update uscite set periodo_cassa_id = periodo_cassa_aperto_id() where periodo_cassa_id is null;
update movimenti_cassa set periodo_cassa_id = periodo_cassa_aperto_id() where periodo_cassa_id is null;

-- Vista saldo: ora filtra per il periodo APERTO (qualsiasi esso sia)
create or replace view saldo_cassa_attuale as
with periodo as (select id from periodi_cassa where data_chiusura is null limit 1)
select
  (
    coalesce((select sum(eur_contanti + fondo_cassa + bonifici + delivery_eur) from incassi where periodo_cassa_id = (select id from periodo)), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'EUR' and periodo_cassa_id = (select id from periodo)), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'EUR' and periodo_cassa_id = (select id from periodo)), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'EUR' and periodo_cassa_id = (select id from periodo)), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'incasso_b2b' and valuta_a = 'EUR' and periodo_cassa_id = (select id from periodo)), 0)
  ) as contanti_eur,
  (
    coalesce((select sum(egp_contanti + delivery_egp) from incassi where periodo_cassa_id = (select id from periodo)), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'EGP' and periodo_cassa_id = (select id from periodo)), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'EGP' and periodo_cassa_id = (select id from periodo)), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'EGP' and periodo_cassa_id = (select id from periodo)), 0)
    + coalesce((select sum(importo_pos) from movimenti_cassa where tipo = 'prelievo_pos' and periodo_cassa_id = (select id from periodo)), 0)
  ) as contanti_egp,
  (
    coalesce((select sum(usd_contanti) from incassi where periodo_cassa_id = (select id from periodo)), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'USD' and periodo_cassa_id = (select id from periodo)), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'USD' and periodo_cassa_id = (select id from periodo)), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'USD' and periodo_cassa_id = (select id from periodo)), 0)
  ) as contanti_usd,
  (
    coalesce((select sum(egp_pos) from incassi where periodo_cassa_id = (select id from periodo)), 0)
    - coalesce((select sum(importo_pos) from movimenti_cassa where tipo = 'prelievo_pos' and periodo_cassa_id = (select id from periodo)), 0)
  ) as saldo_pos_egp;

-- Funzione: CHIUDI il periodo cassa aperto (fotografa il saldo, lo blocca, ne apre uno nuovo)
create or replace function chiudi_periodo_cassa(p_note text, p_chiuso_da uuid)
returns uuid as $$
declare
  v_id uuid;
  v_saldo record;
  v_nuovo_id uuid;
begin
  select id into v_id from periodi_cassa where data_chiusura is null limit 1;
  if v_id is null then
    raise exception 'Nessun periodo cassa aperto trovato';
  end if;

  select * into v_saldo from saldo_cassa_attuale;

  update periodi_cassa set
    data_chiusura = now(),
    contanti_eur = v_saldo.contanti_eur,
    contanti_egp = v_saldo.contanti_egp,
    contanti_usd = v_saldo.contanti_usd,
    saldo_pos_egp = v_saldo.saldo_pos_egp,
    note = p_note,
    chiuso_da = p_chiuso_da
  where id = v_id;

  insert into periodi_cassa (data_apertura) values (now()) returning id into v_nuovo_id;

  return v_nuovo_id;
end;
$$ language plpgsql security definer;

-- Funzione: RIAPRI un periodo cassa già chiuso (per correggere errori).
-- Il periodo torna "aperto" temporaneamente SOLO per modifiche; il Master
-- dovrà richiuderlo manualmente per tornare al periodo corrente.
-- NB: per non perdere il periodo corrente in corso, questa funzione
-- richiede che tu richiuda subito il periodo riaperto prima di riprendere
-- il lavoro sul periodo corrente — l'interfaccia guiderà questo flusso.
create or replace function riapri_periodo_cassa(p_periodo_id uuid)
returns void as $$
begin
  if exists (select 1 from periodi_cassa where data_chiusura is null) then
    raise exception 'Chiudi prima il periodo corrente prima di riaprire un periodo passato';
  end if;
  update periodi_cassa set data_chiusura = null where id = p_periodo_id;
end;
$$ language plpgsql security definer;

alter table periodi_cassa enable row level security;
create policy "periodi_cassa_select" on periodi_cassa for select using (auth.uid() is not null);
create policy "periodi_cassa_insert" on periodi_cassa for insert with check (get_my_role() = 'master');
create policy "periodi_cassa_update" on periodi_cassa for update using (get_my_role() = 'master');


-- ============================================================
-- PARTE B — PERIODI SOCI
-- ============================================================

create table if not exists periodi_soci (
  id uuid default uuid_generate_v4() primary key,
  numero serial,
  data_apertura timestamptz not null default now(),
  data_chiusura timestamptz,
  -- fotografia totali per ciascun socio al momento della chiusura (json semplice)
  totali jsonb,                            -- es. [{"socio_id":"...","nome":"Gianluigi","eur":120.5,"egp":300}]
  note text,
  chiuso_da uuid references profiles(id),
  created_at timestamptz default now()
);

create unique index if not exists idx_un_solo_periodo_soci_aperto
  on periodi_soci ((data_chiusura is null)) where (data_chiusura is null);

insert into periodi_soci (data_apertura)
  select now() where not exists (select 1 from periodi_soci);

alter table spese_socio add column if not exists periodo_soci_id uuid references periodi_soci(id);

create or replace function periodo_soci_aperto_id()
returns uuid as $$
  select id from periodi_soci where data_chiusura is null limit 1;
$$ language sql stable;

create or replace function assegna_periodo_soci()
returns trigger as $$
begin
  if new.periodo_soci_id is null then
    new.periodo_soci_id := periodo_soci_aperto_id();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_assegna_periodo_soci on spese_socio;
create trigger trg_assegna_periodo_soci before insert on spese_socio
  for each row execute function assegna_periodo_soci();

update spese_socio set periodo_soci_id = periodo_soci_aperto_id() where periodo_soci_id is null;

-- Funzione: chiudi il periodo soci aperto
create or replace function chiudi_periodo_soci(p_note text, p_chiuso_da uuid)
returns uuid as $$
declare
  v_id uuid;
  v_totali jsonb;
  v_nuovo_id uuid;
begin
  select id into v_id from periodi_soci where data_chiusura is null limit 1;
  if v_id is null then
    raise exception 'Nessun periodo soci aperto trovato';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'socio_id', s.id,
    'nome', s.nome,
    'eur', coalesce(t.tot_eur, 0),
    'egp', coalesce(t.tot_egp, 0)
  )), '[]'::jsonb)
  into v_totali
  from soci s
  left join (
    select socio_id, sum(importo_eur) as tot_eur, sum(importo_egp) as tot_egp
    from spese_socio where periodo_soci_id = v_id
    group by socio_id
  ) t on t.socio_id = s.id;

  update periodi_soci set
    data_chiusura = now(),
    totali = v_totali,
    note = p_note,
    chiuso_da = p_chiuso_da
  where id = v_id;

  insert into periodi_soci (data_apertura) values (now()) returning id into v_nuovo_id;

  return v_nuovo_id;
end;
$$ language plpgsql security definer;

create or replace function riapri_periodo_soci(p_periodo_id uuid)
returns void as $$
begin
  if exists (select 1 from periodi_soci where data_chiusura is null) then
    raise exception 'Chiudi prima il periodo soci corrente prima di riaprire un periodo passato';
  end if;
  update periodi_soci set data_chiusura = null where id = p_periodo_id;
end;
$$ language plpgsql security definer;

alter table periodi_soci enable row level security;
create policy "periodi_soci_select" on periodi_soci for select using (auth.uid() is not null);
create policy "periodi_soci_insert" on periodi_soci for insert with check (get_my_role() = 'master');
create policy "periodi_soci_update" on periodi_soci for update using (get_my_role() = 'master');

-- ============================================================
-- NOTE D'USO IMPORTANTI
-- ============================================================
-- 1. "Chiudi periodo" (Cassa o Soci) -> fotografa i totali, blocca il
--    periodo, ne apre uno nuovo vuoto. Le nuove righe inserite da quel
--    momento vanno automaticamente nel periodo nuovo.
-- 2. "Riapri periodo" -> riporta un periodo passato allo stato "aperto"
--    per poterlo correggere (modificare/eliminare righe che gli
--    appartengono). Durante la riapertura, quel periodo torna ad essere
--    "il periodo aperto" e le nuove righe inserite andrebbero lì, quindi
--    l'interfaccia deve impedire di inserire nuovi incassi/uscite/spese
--    mentre un periodo passato è riaperto, oppure va richiuso subito
--    dopo la correzione per tornare al periodo corrente.
-- 3. I dati storici (fotografie nei campi contanti_*/totali) NON
--    cambiano automaticamente se correggi righe passate: vanno
--    risincronizzate richiudendo il periodo (la chiusura ricalcola
--    sempre i totali aggiornati al momento in cui la esegui).
