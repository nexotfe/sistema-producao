import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// createBrowserClient (em vez de createClient puro) guarda a sessao em
// cookie, nao so em localStorage - sem isso, o servidor (Server
// Actions, Route Handlers via createSupabaseServerClient) nunca ve a
// sessao criada pelo login, mesmo com o usuario autenticado de verdade
// do lado do navegador. autoRefreshToken/detectSessionInUrl/persistSession
// ja saem como true por padrao em ambiente de navegador - nao precisam
// ser passados explicitamente.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);