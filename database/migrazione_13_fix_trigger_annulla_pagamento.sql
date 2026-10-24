-- ============================================================
-- MIGRAZIONE 13: correzione trigger annulla pagamento spesa fissa
-- L'errore "tuple to be deleted was already modified" succede perché
-- un trigger BEFORE DELETE che a sua volta elimina righe in un'altra
-- tabella può scontrarsi con i lock della transazione in corso.
-- Lo cambiamo in AFTER DELETE, il momento corretto per azioni a cascata.
-- ============================================================

drop trigger if exists trg_elimina_uscita_da_pagamento on pagamenti_spese_fisse;

create trigger trg_elimina_uscita_da_pagamento
  after delete on pagamenti_spese_fisse
  for each row
  execute function elimina_uscita_da_pagamento_eliminato();
