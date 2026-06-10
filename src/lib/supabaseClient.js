import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Se le variabili non sono configurate l'app gira in "modalità demo":
// tutto in locale (IndexedDB), nessuna autenticazione reale.
export const supabaseEnabled = Boolean(url && anonKey)

export const supabase = supabaseEnabled ? createClient(url, anonKey) : null

export const FOTO_BUCKET = 'foto-alberi'
