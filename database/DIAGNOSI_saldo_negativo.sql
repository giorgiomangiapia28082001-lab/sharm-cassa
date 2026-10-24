-- ============================================================
-- DIAGNOSI saldo negativo — QUERY UNICA
-- Incolla tutto e premi Run: esce una sola tabella "voce | valore".
-- Non modifica niente, legge soltanto.
-- ============================================================
with periodo as (
  select id, numero, data_apertura from periodi_cassa where data_chiusura is null limit 1
),
s as (select * from saldo_cassa_attuale)
select * from (
  select 1 as ord, 'PERIODO APERTO n.' as voce,
         coalesce((select numero::text from periodo), 'NESSUNO') as valore
  union all
  select 2, 'Aperto dal',
         coalesce((select to_char(data_apertura, 'DD/MM/YYYY HH24:MI') from periodo), '—')
  union all
  select 3, '--- ENTRATE DEL PERIODO ---', ''
  union all
  select 4, 'Numero incassi registrati',
         (select count(*)::text from incassi where periodo_cassa_id = (select id from periodo))
  union all
  select 5, 'Entrate EUR',
         coalesce((select sum(eur_contanti + fondo_cassa + bonifici + delivery_eur)
                   from incassi where periodo_cassa_id = (select id from periodo)), 0)::text
  union all
  select 6, 'Entrate EGP (LE)',
         coalesce((select sum(egp_contanti + delivery_egp)
                   from incassi where periodo_cassa_id = (select id from periodo)), 0)::text
  union all
  select 7, 'Entrate USD',
         coalesce((select sum(usd_contanti)
                   from incassi where periodo_cassa_id = (select id from periodo)), 0)::text
  union all
  select 8, 'Versamenti aggiunti a mano (EUR)',
         coalesce((select sum(importo_a) from movimenti_cassa
                   where tipo = 'versamento' and valuta_a = 'EUR'
                   and periodo_cassa_id = (select id from periodo)), 0)::text
  union all
  select 9, 'Versamenti aggiunti a mano (EGP)',
         coalesce((select sum(importo_a) from movimenti_cassa
                   where tipo = 'versamento' and valuta_a = 'EGP'
                   and periodo_cassa_id = (select id from periodo)), 0)::text
  union all
  select 10, '--- USCITE DEL PERIODO ---', ''
  union all
  select 11, 'Numero uscite registrate',
         (select count(*)::text from uscite where periodo_cassa_id = (select id from periodo))
  union all
  select 12, 'Uscite EUR (contanti/bonifico)',
         coalesce((select sum(importo) from uscite
                   where valuta = 'EUR' and coalesce(metodo_pagamento,'contanti') in ('contanti','bonifico')
                   and periodo_cassa_id = (select id from periodo)), 0)::text
  union all
  select 13, 'Uscite EGP (contanti/bonifico)',
         coalesce((select sum(importo) from uscite
                   where valuta = 'EGP' and coalesce(metodo_pagamento,'contanti') in ('contanti','bonifico')
                   and periodo_cassa_id = (select id from periodo)), 0)::text
  union all
  select 14, 'Uscite USD (contanti/bonifico)',
         coalesce((select sum(importo) from uscite
                   where valuta = 'USD' and coalesce(metodo_pagamento,'contanti') in ('contanti','bonifico')
                   and periodo_cassa_id = (select id from periodo)), 0)::text
  union all
  select 15, 'di cui acconti dipendenti (EUR)',
         coalesce((select sum(u.importo) from uscite u
                   left join categorie_uscite c on c.id = u.categoria_id
                   where u.valuta='EUR' and c.nome ilike '%acconto%'
                   and u.periodo_cassa_id = (select id from periodo)), 0)::text
  union all
  select 16, 'di cui acconti dipendenti (EGP)',
         coalesce((select sum(u.importo) from uscite u
                   left join categorie_uscite c on c.id = u.categoria_id
                   where u.valuta='EGP' and c.nome ilike '%acconto%'
                   and u.periodo_cassa_id = (select id from periodo)), 0)::text
  union all
  select 17, '--- SALDO RISULTANTE ---', ''
  union all
  select 18, 'Contanti EUR', (select contanti_eur::text from s)
  union all
  select 19, 'Contanti EGP', (select contanti_egp::text from s)
  union all
  select 20, 'Contanti USD', (select contanti_usd::text from s)
  union all
  select 21, 'Saldo POS EGP', (select saldo_pos_egp::text from s)
  union all
  select 22, '--- USCITA PIU'' GRANDE ---', ''
  union all
  select 23, 'Descrizione',
         coalesce((select descrizione from uscite
                   where periodo_cassa_id = (select id from periodo)
                   order by importo desc limit 1), '—')
  union all
  select 24, 'Importo',
         coalesce((select importo::text || ' ' || valuta from uscite
                   where periodo_cassa_id = (select id from periodo)
                   order by importo desc limit 1), '—')
) t order by ord;
