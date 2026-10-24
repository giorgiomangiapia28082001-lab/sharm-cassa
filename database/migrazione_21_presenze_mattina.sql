-- ============================================================
-- MIGRAZIONE 21: campo "mattina" sulla tabella presenze
-- Il turno mattina è un registro extra separato dal calcolo
-- stipendio. Non influenza giorni presenti né proporzionale.
-- ============================================================

alter table presenze add column if not exists mattina boolean default false;
