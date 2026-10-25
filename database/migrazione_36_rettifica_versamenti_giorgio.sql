-- ============================================================
--  MIGRAZIONE 36 · Rettifica cassa, versamenti solo master, socio Giorgio
--
--  1. RETTIFICA CASSA
--     Nuovo tipo di movimento 'rettifica'. Quando il conteggio vero
--     dei soldi non torna con quello dell'app, il master scrive quanto
--     c'è realmente e l'app registra la DIFFERENZA come rettifica
--     (può essere anche negativa). Così il saldo diventa quello reale
--     e resta traccia di chi l'ha fatto, quando e di quanto.
--     Una riga per ogni voce corretta:
--       contanti  → valuta_a = EUR/EGP/USD, importo_a = differenza
--       POS       → importo_pos = differenza (valuta_a vuota)
--     saldo_periodo_cassa() le conta (unica formula del saldo,
--     migrazione 32): qui viene riscritta UGUALE con in più le rettifiche.
--
--  2. VERSAMENTI E RETTIFICHE SOLO MASTER
--     Le regole di accesso di movimenti_cassa ora impediscono a
--     operatore e proprietario di inserire versamenti e rettifiche.
--
--  3. GIORGIO TERZO SOCIO
--     Aggiunto alla tabella soci; gli acconti possono essere
--     "dati da Giorgio" (come Gianluigi e Luca) e in quel caso
--     finiscono anche nelle sue spese socio.
--
--  Si può eseguire più volte senza danni.
-- ============================================================


-- ── 1 · Rettifica ──
alter table public.movimenti_cassa drop constraint if exists movimenti_cassa_tipo_check;
alter table public.movimenti_cassa add constraint movimenti_cassa_tipo_check
  check (tipo in ('cambio_valuta', 'prelievo_pos', 'incasso_b2b', 'versamento', 'rettifica'));

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
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'versamento' and valuta_a = 'EUR' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'rettifica' and valuta_a = 'EUR' and periodo_cassa_id = p_periodo_id), 0),

    -- ── CONTANTI EGP ──
      coalesce((select sum(egp_contanti + delivery_egp) from incassi where periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(egp_contanti) from incassi_chioschetto where periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'EGP' and coalesce(metodo_pagamento, 'contanti') in ('contanti', 'bonifico') and periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'EGP' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'EGP' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_pos) from movimenti_cassa where tipo = 'prelievo_pos' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'versamento' and valuta_a = 'EGP' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'rettifica' and valuta_a = 'EGP' and periodo_cassa_id = p_periodo_id), 0),

    -- ── CONTANTI USD ──
      coalesce((select sum(usd_contanti) from incassi where periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(usd_contanti) from incassi_chioschetto where periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'USD' and coalesce(metodo_pagamento, 'contanti') in ('contanti', 'bonifico') and periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo_da) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_da = 'USD' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'cambio_valuta' and valuta_a = 'USD' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'versamento' and valuta_a = 'USD' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_a) from movimenti_cassa where tipo = 'rettifica' and valuta_a = 'USD' and periodo_cassa_id = p_periodo_id), 0),

    -- ── SALDO POS (EGP) ──
      coalesce((select sum(egp_pos) from incassi where periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(egp_pos) from incassi_chioschetto where periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo_pos) from movimenti_cassa where tipo = 'prelievo_pos' and periodo_cassa_id = p_periodo_id), 0)
    - coalesce((select sum(importo) from uscite where valuta = 'EGP' and metodo_pagamento = 'pos' and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_pos) from movimenti_cassa where tipo = 'versamento' and importo_pos > 0 and periodo_cassa_id = p_periodo_id), 0)
    + coalesce((select sum(importo_pos) from movimenti_cassa where tipo = 'rettifica' and valuta_a is null and periodo_cassa_id = p_periodo_id), 0)
$$;

revoke execute on function public.saldo_periodo_cassa(uuid) from public, anon;
grant execute on function public.saldo_periodo_cassa(uuid) to authenticated;


-- ── 2 · Versamenti e rettifiche solo master ──
drop policy if exists movimenti_cassa_insert on public.movimenti_cassa;
drop policy if exists proprietario_insert on public.movimenti_cassa;
drop policy if exists movimenti_cassa_insert_master on public.movimenti_cassa;
drop policy if exists movimenti_cassa_insert_altri on public.movimenti_cassa;

create policy movimenti_cassa_insert_master on public.movimenti_cassa
  for insert with check (public.get_my_role() = 'master');
create policy movimenti_cassa_insert_altri on public.movimenti_cassa
  for insert with check (
    public.get_my_role() in ('operatore', 'proprietario')
    and tipo not in ('versamento', 'rettifica')
  );


-- ── 3 · Giorgio ──
insert into public.soci (nome)
  select 'Giorgio' where not exists (select 1 from public.soci where lower(nome) = 'giorgio');

alter table public.acconti drop constraint if exists acconti_erogato_da_check;
alter table public.acconti add constraint acconti_erogato_da_check
  check (erogato_da in ('direttore', 'gianluigi', 'luca', 'giorgio'));

-- Uguale a prima (migrazione 05/06) con in più Giorgio
create or replace function public.crea_uscita_da_acconto()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_categoria_id uuid;
  v_nome_dipendente text;
  v_etichetta_erogante text;
  v_socio_id uuid;
begin
  select id into v_categoria_id from categorie_uscite where nome = 'Dipendenti' limit 1;
  select nome into v_nome_dipendente from dipendenti where id = new.dipendente_id;

  v_etichetta_erogante := case new.erogato_da
    when 'gianluigi' then ' (dato da Gianluigi)'
    when 'luca' then ' (dato da Luca)'
    when 'giorgio' then ' (dato da Giorgio)'
    else ''
  end;

  -- 1. Riga in USCITE (cassa generale del ristorante) — sempre creata
  if coalesce(new.importo_eur, 0) > 0 then
    insert into uscite (data, descrizione, categoria_id, valuta, importo, metodo_pagamento, inserito_da, generato_da_acconto_id)
    values (
      new.data,
      'Acconto a ' || coalesce(v_nome_dipendente, 'dipendente') || v_etichetta_erogante,
      v_categoria_id, 'EUR', new.importo_eur, 'contanti', new.inserito_da, new.id
    );
  end if;

  if coalesce(new.importo_egp, 0) > 0 then
    insert into uscite (data, descrizione, categoria_id, valuta, importo, metodo_pagamento, inserito_da, generato_da_acconto_id)
    values (
      new.data,
      'Acconto a ' || coalesce(v_nome_dipendente, 'dipendente') || v_etichetta_erogante,
      v_categoria_id, 'EGP', new.importo_egp, 'contanti', new.inserito_da, new.id
    );
  end if;

  -- 2. Se erogato da un socio, crea ANCHE la riga in spese_socio
  --    (spesa personale, da scalare dall'utile a fine mese)
  if new.erogato_da in ('gianluigi', 'luca', 'giorgio') then
    select id into v_socio_id from soci where lower(nome) = new.erogato_da limit 1;

    if v_socio_id is not null then
      insert into spese_socio (socio_id, data, descrizione, importo_eur, importo_egp)
      values (
        v_socio_id,
        new.data,
        'Acconto a ' || coalesce(v_nome_dipendente, 'dipendente'),
        coalesce(new.importo_eur, 0),
        coalesce(new.importo_egp, 0)
      );
    end if;
  end if;

  return new;
end;
$function$;

revoke execute on function public.crea_uscita_da_acconto() from public, anon;
grant execute on function public.crea_uscita_da_acconto() to authenticated;
