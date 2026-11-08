// Etapa 61 — leitura real de saldo livre por matéria-prima, para o
// preview da conferência de materiais (regime pendente_momento_y).
// Client de SESSÃO (RLS: estoque_saldos_select_tenant, empresa_id =
// empresa_atual_id() - confirmado via pg_policy contra produção) -
// nunca service_role.
//
// Fonte: public.estoque_saldos, coluna GERADA saldo_livre
// (saldo_disponivel - saldo_reservado). local_estoque fixo em
// 'principal' - o mesmo valor que confirmar_necessidades_momento_y usa
// para validar/reservar CI (confirmado via pg_get_functiondef contra
// produção). Nunca a mesma fonte das views legadas
// (vw_of_fluxo_operacional/vw_of_consumo_detalhado) - essas só
// representam dado pós-confirmação de OFs legadas, não saldo
// disponível agora para uma conferência pendente.
//
// Leitura em lote (um IN, nunca uma consulta por material). O valor
// devolvido é só um preview - a validação que decide de fato acontece
// dentro de confirmar_necessidades_momento_y, sob lock, no momento da
// confirmação real (ainda não conectada nesta etapa).
import type { SupabaseClient } from "@supabase/supabase-js";

const LOCAL_ESTOQUE_PRINCIPAL = "principal";

export type RespostaSaldoLivreMateriasPrimasPcp =
  | { readonly ok: true; readonly saldoLivrePorMaterial: ReadonlyMap<string, number> }
  | { readonly ok: false; readonly motivo: "erro_desconhecido" };

function logErroTecnicoSaldoLivreMateriasPrimasPcp(origem: string, erro: { message: string; code?: string }): void {
  console.error(`buscarSaldoLivreMateriasPrimasPcp: falha tecnica em ${origem}`, { code: erro.code, message: erro.message });
}

export async function buscarSaldoLivreMateriasPrimasPcp(
  client: SupabaseClient,
  materiaPrimaIds: readonly string[],
): Promise<RespostaSaldoLivreMateriasPrimasPcp> {
  const idsUnicos = Array.from(new Set(materiaPrimaIds));
  if (idsUnicos.length === 0) {
    return { ok: true, saldoLivrePorMaterial: new Map() };
  }

  const { data, error } = await client
    .from("estoque_saldos")
    .select("materia_prima_id, saldo_livre")
    .eq("local_estoque", LOCAL_ESTOQUE_PRINCIPAL)
    .in("materia_prima_id", idsUnicos);

  if (error) {
    logErroTecnicoSaldoLivreMateriasPrimasPcp("estoque_saldos", error);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  const saldoLivrePorMaterial = new Map<string, number>();
  for (const linha of data ?? []) {
    saldoLivrePorMaterial.set(linha.materia_prima_id as string, (linha.saldo_livre as number | null) ?? 0);
  }

  return { ok: true, saldoLivrePorMaterial };
}
