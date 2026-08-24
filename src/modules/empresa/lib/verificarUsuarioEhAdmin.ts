import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Delega para a mesma função que a RLS usa para decidir permissão de
 * escrita (`usuario_e_admin()`), em vez de reimplementar a checagem de
 * nivel_acesso no cliente - mesmo raciocínio de buscarEmpresaIdAtual.ts
 * delegando para empresa_atual_id(). Isto é só sinal para decidir o que
 * RENDERIZAR (editar vs. somente leitura); a RLS continua sendo a
 * barreira real de permissão.
 */
export async function verificarUsuarioEhAdmin(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.rpc("usuario_e_admin");

  if (error) {
    throw new Error(`Erro ao verificar permissão do usuário: ${error.message}`);
  }

  return data === true;
}
