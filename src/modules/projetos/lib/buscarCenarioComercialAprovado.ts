// DEC-007 §6.2/Fase 8b (aprovação do cenário comercial) - leitura do
// cenário comercial VIGENTE de um projeto (cenarios_comerciais_aprovados,
// migration 202608180002). Fonte ÚNICA reutilizada por useOrcamento.ts e
// useProposta.ts - nunca uma segunda consulta paralela. RLS cuida do
// isolamento por empresa (empresa_atual_id()) - esta função nunca filtra
// por empresa_id explicitamente, mesmo padrão de outras leituras
// tenant-scoped do projeto. null = nenhum cenário aprovado vigente para
// este projeto (comportamento normal, não erro) - o Orçamento/Proposta
// preservam o comportamento atual nesse caso.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CenarioComercialAprovadoResumo {
  readonly id: string;
  readonly tipoCenario: "atual" | "ajustado";
  readonly dataSolicitadaCliente: string;
  readonly prazoProposto: string;
  readonly diferencaEmDias: number;
  /** "Valor atual do orçamento" no momento da aprovação - custo técnico, sem margem/imposto. */
  readonly custoTecnicoAtual: number;
  readonly custoAdicionalTotal: number;
  /** Valor-base congelado (custoTecnicoAtual + custoAdicionalTotal) - entrada do fluxo financeiro do Orçamento/Proposta, ainda sem margem/imposto. */
  readonly novoCustoTecnico: number;
  readonly aprovadoEm: string;
}

type LinhaCenarioComercialAprovado = {
  id: string;
  tipo_cenario: "atual" | "ajustado";
  data_solicitada_cliente: string;
  prazo_proposto: string;
  diferenca_em_dias: number;
  custo_tecnico_atual: number;
  custo_adicional_total: number;
  novo_custo_tecnico: number;
  aprovado_em: string;
};

export async function buscarCenarioComercialAprovado(
  client: SupabaseClient,
  projetoId: string,
): Promise<CenarioComercialAprovadoResumo | null> {
  const { data, error } = await client
    .from("cenarios_comerciais_aprovados")
    .select(
      "id,tipo_cenario,data_solicitada_cliente,prazo_proposto,diferenca_em_dias,custo_tecnico_atual,custo_adicional_total,novo_custo_tecnico,aprovado_em",
    )
    .eq("projeto_id", projetoId)
    .eq("vigente", true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const linha = data as LinhaCenarioComercialAprovado;

  return {
    id: linha.id,
    tipoCenario: linha.tipo_cenario,
    dataSolicitadaCliente: linha.data_solicitada_cliente,
    prazoProposto: linha.prazo_proposto,
    diferencaEmDias: linha.diferenca_em_dias,
    custoTecnicoAtual: Number(linha.custo_tecnico_atual),
    custoAdicionalTotal: Number(linha.custo_adicional_total),
    novoCustoTecnico: Number(linha.novo_custo_tecnico),
    aprovadoEm: linha.aprovado_em,
  };
}
