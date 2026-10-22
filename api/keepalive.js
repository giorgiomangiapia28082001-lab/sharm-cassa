// Nel piano gratuito Supabase mette in pausa il progetto dopo 7 giorni senza
// attività. Vercel chiama questa funzione ogni giorno (vedi "crons" in
// vercel.json): una piccola lettura con la chiave pubblica tiene il database attivo.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://samrgkyvhfzpsujzfumw.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_cPFGKlX58RORCiKXSwBRsw_pjoKdLYe";

export default async function handler(req, res) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/tassi_cambio?select=*&limit=1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    res.status(r.ok ? 200 : 502).json({ ok: r.ok, stato: r.status, ora: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, errore: String(e) });
  }
}
