// DEC-007 §6.2/Fase 8b (idempotência da aprovação de cenário comercial -
// migração 20260822195805) - único uso: depois de uma falha AMBÍGUA na
// chamada de aprovar_cenario_comercial_v2 (a chamada de rede em si
// falhou, sem resposta limpa - ver persistirViaRpcAprovacaoCenario.ts),
// o cliente precisa saber se a aprovação foi gravada antes de decidir
// entre "tratar como sucesso" (achou) ou "liberar nova tentativa com a
// MESMA chave" (não achou) - nunca decide sem essa consulta. RLS
// (cenarios_comerciais_aprovados_select_tenant) já restringe à empresa
// do usuário autenticado - não precisa de empresaId explícito aqui,
// mesmo padrão de buscarCenarioComercialAprovado.ts.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function buscarCenarioAprovadoPorChaveIdempotencia(
  client: SupabaseClient,
  projetoId: string,
  chaveIdempotencia: string,
): Promise<{ id: string } | null> {
  const { data, error } = await client
    .from("cenarios_comerciais_aprovados")
    .select("id")
    .eq("projeto_id", projetoId)
    .eq("chave_idempotencia", chaveIdempotencia)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return { id: data.id as string };
}
