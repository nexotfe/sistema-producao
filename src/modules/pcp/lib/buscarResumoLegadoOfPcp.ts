// NEXOTFE — Etapa 58B: leitura do modelo LEGADO de CI/CE por material,
// para OFs em regime diferente de "pendente_momento_y" (ver Etapa 58A -
// achado central: vw_of_fluxo_operacional/vw_of_consumo_detalhado NÃO
// são código obsoleto, continuam sendo escritas por decidir_ci_ce_de_of
// dentro de aprovar_of hoje, e representam dado real e correto para
// toda OF que nunca passou pelo interruptor do Momento Y). Client de
// SESSÃO (as duas views têm security_invoker=true e GRANT SELECT para
// authenticated, confirmado por investigação + teste real com 2 contas
// - nunca service_role). Só leitura, nunca grava, nunca recalcula.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResumoLegadoOfPcp {
  readonly bomVersao: string | null;
  readonly totalDemandaBom: number | null;
  readonly totalEstoqueLivre: number | null;
  readonly totalConsumoInterno: number | null;
  readonly totalCompraExterna: number | null;
  readonly statusFluxo: string | null;
}

export interface ItemLegadoOfPcp {
  readonly materiaPrimaCodigo: string | null;
  readonly materiaPrimaDescricao: string | null;
  readonly componenteTipo: string | null;
  readonly bomQuantidade: number | null;
  readonly bomUnidade: string | null;
  readonly estoqueSaldoLivre: number | null;
  readonly quantidadeConsumoInterno: number | null;
  readonly quantidadeCompraExterna: number | null;
  readonly statusFluxo: string | null;
}

export type RespostaResumoLegadoOfPcp =
  | { readonly ok: true; readonly resumo: ResumoLegadoOfPcp | null; readonly itens: readonly ItemLegadoOfPcp[] }
  | { readonly ok: false; readonly motivo: "erro_desconhecido" };

function logErroTecnicoResumoLegadoOfPcp(origem: string, erro: { message: string; code?: string }): void {
  console.error(`buscarResumoLegadoOfPcp: falha tecnica em ${origem}`, { code: erro.code, message: erro.message });
}

export async function buscarResumoLegadoOfPcp(client: SupabaseClient, ofId: string): Promise<RespostaResumoLegadoOfPcp> {
  const [resumoResultado, itensResultado] = await Promise.all([
    client
      .from("vw_of_fluxo_operacional")
      .select("bom_versao, total_demanda_bom, total_estoque_livre, total_consumo_interno, total_compra_externa, status_fluxo")
      .eq("of_id", ofId)
      .maybeSingle(),
    client
      .from("vw_of_consumo_detalhado")
      .select(
        "materia_prima_codigo, materia_prima_descricao, componente_tipo, bom_quantidade, bom_unidade, estoque_saldo_livre, quantidade_consumo_interno, quantidade_compra_externa, status_fluxo",
      )
      .eq("of_id", ofId),
  ]);

  if (resumoResultado.error) {
    logErroTecnicoResumoLegadoOfPcp("vw_of_fluxo_operacional", resumoResultado.error);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (itensResultado.error) {
    logErroTecnicoResumoLegadoOfPcp("vw_of_consumo_detalhado", itensResultado.error);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  const linhaResumo = resumoResultado.data;
  const resumo: ResumoLegadoOfPcp | null = linhaResumo
    ? {
        bomVersao: linhaResumo.bom_versao as string | null,
        totalDemandaBom: linhaResumo.total_demanda_bom as number | null,
        totalEstoqueLivre: linhaResumo.total_estoque_livre as number | null,
        totalConsumoInterno: linhaResumo.total_consumo_interno as number | null,
        totalCompraExterna: linhaResumo.total_compra_externa as number | null,
        statusFluxo: linhaResumo.status_fluxo as string | null,
      }
    : null;

  const itens: ItemLegadoOfPcp[] = (itensResultado.data ?? []).map((linha) => ({
    materiaPrimaCodigo: linha.materia_prima_codigo as string | null,
    materiaPrimaDescricao: linha.materia_prima_descricao as string | null,
    componenteTipo: linha.componente_tipo as string | null,
    bomQuantidade: linha.bom_quantidade as number | null,
    bomUnidade: linha.bom_unidade as string | null,
    estoqueSaldoLivre: linha.estoque_saldo_livre as number | null,
    quantidadeConsumoInterno: linha.quantidade_consumo_interno as number | null,
    quantidadeCompraExterna: linha.quantidade_compra_externa as number | null,
    statusFluxo: linha.status_fluxo as string | null,
  }));

  return { ok: true, resumo, itens };
}
