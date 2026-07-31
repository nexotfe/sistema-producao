// Client Supabase para uso em Server Actions/Route Handlers, com a
// sessao real do usuario (via cookie), respeitando RLS normalmente -
// nao e o client privilegiado (ver supabaseServiceClient.ts). Usa a
// chave anon, igual ao client do navegador (src/lib/supabaseClient.ts)
// - o que muda e a origem da sessao (cookie httpOnly assinado pelo
// Supabase, nao localStorage/window).
//
// auth.getUser() chamado a partir do client criado aqui revalida o
// token contra o servidor de autenticacao do Supabase, diferente de
// auth.getSession() (que so decodifica o cookie localmente) - por
// isso e o metodo exigido para decidir autorizacao no servidor.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Action pode escrever cookie normalmente; o catch
          // aqui e so para o caso deste client ser reaproveitado no
          // futuro a partir de um Server Component (que nao pode
          // escrever cookie) - nao ocorre no uso atual.
        }
      },
    },
  });
}
