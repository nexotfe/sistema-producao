import "server-only";
// Client privilegiado (service_role) - usado exclusivamente para
// chamar aprovar_projeto_com_simulacao_v2 (PAD-008, secoes 7-8), depois
// que o calculo e a comparacao ja rodaram no servidor com o client de
// sessao do usuario (supabaseServerClient.ts). Nunca le dado de
// negocio diretamente, nunca decide autorizacao - so persiste um
// resultado ja validado.
//
// O import "server-only" acima faz o build falhar (nao so avisar) se
// este arquivo for importado, direta ou transitivamente, por qualquer
// Client Component - garantia em tempo de build, alem da garantia do
// Next.js de nunca expor ao bundle do navegador uma variavel de
// ambiente sem o prefixo NEXT_PUBLIC_.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function createSupabaseServiceClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (ou NEXT_PUBLIC_SUPABASE_URL) nao configurada - o client privilegiado nao pode ser criado sem falhar de forma clara, nunca cair silenciosamente para outra chave.",
    );
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
