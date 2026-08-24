import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve o empresa_id do usuário logado chamando a função de banco
 * `empresa_atual_id()` via RPC - a MESMA função autoritativa usada por
 * praticamente toda policy de RLS do sistema (confirmado via
 * introspecção: SECURITY DEFINER, EXECUTE concedido a `authenticated`).
 *
 * Não reproduzir essa lógica em TypeScript: a função real consulta
 * `profiles` (só ativo=true) primeiro e cai para `usuarios` só se
 * `profiles` não tiver linha - duas cópias já existentes no código
 * (usePrevisaoComercialCapacidade.ts, GeradorComparadorCenarios.tsx)
 * consultam só `usuarios` diretamente, o que é uma reprodução PARCIAL
 * desse contrato (diverge se profiles.ativo=false ou se as duas tabelas
 * tiverem empresa_id diferente para o mesmo usuário). Chamar a função
 * real elimina esse risco de divergência - não corrigimos as 2 cópias
 * existentes aqui (fora de escopo), só não repetimos o mesmo atalho.
 */
export async function buscarEmpresaIdAtual(client: SupabaseClient): Promise<string | null> {
  const { data: userData, error: erroUsuarioLogado } = await client.auth.getUser();

  if (erroUsuarioLogado) {
    throw new Error(`Erro ao obter o usuário logado: ${erroUsuarioLogado.message}`);
  }

  if (!userData.user) {
    return null;
  }

  const { data: empresaId, error } = await client.rpc("empresa_atual_id");

  if (error) {
    throw new Error(`Erro ao resolver a empresa do usuário logado: ${error.message}`);
  }

  return empresaId ?? null;
}
