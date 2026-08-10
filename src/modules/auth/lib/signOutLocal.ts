import { supabase } from "@/lib/supabaseClient";

// Ponto unico da escolha de escopo do logout - "local" desloga so esta
// sessao/navegador, nunca revoga outros dispositivos. Usado pelo botao
// manual (UserMenu) e pelo logout automatico por inatividade
// (InactivityGuard) - a decisao de escopo nao deve ser duplicada.
export async function signOutLocal() {
  return supabase.auth.signOut({ scope: "local" });
}
