-- ============================================================
-- MIGRAZIONE 07: Spese fisse ricorrenti (Fitto locale, Case dipendenti, ecc.)
-- - Il Master crea/modifica/elimina le voci fisse
-- - Master e Operatore possono segnare una voce come "pagata" per il mese
-- - Il pagamento genera automaticamente l'uscita corrispondente in "uscite"
-- ============================================================

-- 1. Tabella delle VOCI fisse (es. "Fitto locale", "Casa Ahmed")
create table if not exists spese_fisse (
  id uuid default uuid_generate_v4() primary key,
  nome text not null,                          -- es. "Fitto locale", "Casa Ahmed"
  tipo text not null check (tipo in ('fitto_locale', 'casa_dipendente')),
  importo numeric(10,2) not null default 0,
  valuta text not null default 'EGP' check (valuta in ('EUR', 'USD', 'EGP')),
  giorno_scadenza integer not null default 1 check (giorno_scadenza between 1 and 28),
  attiva boolean default true,
  note text,
  created_at timestamptz default now()
);

-- 2. Tabella dei PAGAMENTI effettivi, mese per mese
create table if not exists pagamenti_spese_fisse (
  id uuid default uuid_generate_v4() primary key,
  spesa_fissa_id uuid references spese_fisse(id) on delete cascade not null,
  mese date not null,                          -- sempre il primo giorno del mese, es. 2026-06-01
  data_pagamento date not null default current_date,
  importo numeric(10,2) not null,
  generato_uscita_id uuid,                     -- riferimento all'uscita generata
  inserito_da uuid references profiles(id) not null,
  created_at timestamptz default now(),
  unique(spesa_fissa_id, mese)                 -- non si può pagare due volte lo stesso mese
);

alter table pagamenti_spese_fisse
  add constraint pagamenti_uscita_fk foreign key (generato_uscita_id) references uscite(id) on delete set null;

create index if not exists idx_pagamenti_mese on pagamenti_spese_fisse(mese);

-- 3. RLS
alter table spese_fisse enable row level security;
alter table pagamenti_spese_fisse enable row level security;

create policy "spese_fisse_select" on spese_fisse for select using (auth.uid() is not null);
create policy "spese_fisse_insert" on spese_fisse for insert with check (get_my_role() = 'master');
create policy "spese_fisse_update" on spese_fisse for update using (get_my_role() = 'master');
create policy "spese_fisse_delete" on spese_fisse for delete using (get_my_role() = 'master');

create policy "pagamenti_select" on pagamenti_spese_fisse for select using (auth.uid() is not null);
create policy "pagamenti_insert" on pagamenti_spese_fisse for insert with check (get_my_role() in ('master', 'operatore'));
create policy "pagamenti_delete" on pagamenti_spese_fisse for delete using (get_my_role() = 'master');

-- 4. Funzione: quando si registra un pagamento, crea automaticamente
--    l'uscita corrispondente nella categoria giusta (Fitto o Case dipendenti)
create or replace function crea_uscita_da_pagamento_fisso()
returns trigger as $$
declare
  v_categoria_id uuid;
  v_nome_categoria text;
  v_nome_spesa text;
  v_valuta text;
  v_uscita_id uuid;
begin
  select nome, tipo, valuta into v_nome_spesa, v_nome_categoria, v_valuta
  from spese_fisse where id = new.spesa_fissa_id;

  v_nome_categoria := case v_nome_categoria
    when 'fitto_locale' then 'Fitto'
    when 'casa_dipendente' then 'Case dipendenti'
  end;

  select id into v_categoria_id from categorie_uscite where nome = v_nome_categoria limit 1;

  insert into uscite (data, descrizione, categoria_id, valuta, importo, metodo_pagamento, inserito_da)
  values (new.data_pagamento, v_nome_spesa, v_categoria_id, v_valuta, new.importo, 'contanti', new.inserito_da)
  returning id into v_uscita_id;

  update pagamenti_spese_fisse set generato_uscita_id = v_uscita_id where id = new.id;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_crea_uscita_da_pagamento_fisso on pagamenti_spese_fisse;

create trigger trg_crea_uscita_da_pagamento_fisso
  after insert on pagamenti_spese_fisse
  for each row
  execute function crea_uscita_da_pagamento_fisso();

-- 5. Ci assicuriamo che esista la categoria "Case dipendenti" (potrebbe già esserci)
insert into categorie_uscite (nome, ordine)
select 'Case dipendenti', 9
where not exists (select 1 from categorie_uscite where nome = 'Case dipendenti');
