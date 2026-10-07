// Client Supabase ISOLADO para o fluxo de primeiro acesso (C2.4-I1A-4).
//
// NUNCA o client normal da aplicação (src/lib/supabaseClient.ts, que usa
// createBrowserClient de @supabase/ssr e persiste a sessão em COOKIE, por
// desenho - é assim que o servidor/proxy enxerga a sessão do usuário
// logado). Esse isolamento é o ponto central do desenho aprovado do
// primeiro acesso: verifyOtp/updateUser (fatias futuras) vão rodar neste
// client isolado, sem que a sessão temporária resultante jamais toque o
// cookie que o proxy lê - só depois da conclusão confirmada é que a
// sessão é transferida para o client normal (setSession, fatia futura).
//
// persistSession:false já garante armazenamento SÓ EM MEMÓRIA do
// processo JS - confirmado por leitura direta do código da lib
// (node_modules/@supabase/auth-js/dist/main/GoTrueClient.js: quando
// persistSession é false, o client usa memoryLocalStorageAdapter
// incondicionalmente, nunca localStorage/document.cookie). Não é preciso
// declarar um storage customizado - a própria lib já isola.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function criarClientePrimeiroAcesso(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
