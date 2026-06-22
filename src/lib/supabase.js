import { createClient } from '@supabase/supabase-js'

// Queste due variabili vanno impostate nel file .env (vedi .env.example)
// Le trovi nella dashboard Supabase: Project Settings > API
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
