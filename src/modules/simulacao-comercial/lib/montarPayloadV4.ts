// Fase 3 do rollout da Entrega 2 (PAD-008 v2.0 §19): mapeia
// ItemSimulacaoOperacao[] (já recalculado no servidor) para o formato
// nativo aninhado que aprovar_projeto_com_simulacao_v4 espera - 0..N
// distribuições por operação, sem a limitação de "só 1 recurso" da
// ponte v3 usada na Fase 2 (removida junto com esta troca).
//
// Função pura, extraída para lib/ (em vez de inline em
// aprovarSimulacaoComercialAction.ts, que é "use server" e só pode
// exportar funções assíncronas) para ficar testável sem sessão real do
// Supabase - mesmo motivo de extração de orquestrarAprovacaoAutoritativa.ts
// e do extinto adaptarParaV3.ts.
//
// versao_resultado_motor NÃO é enviado aqui - a RPC v4 grava 2
// diretamente no INSERT (migration 202608020001), não é parâmetro.
import type { DistribuicaoParaPersistencia, ItemSimulacaoOperacao } from "./executarSimulacao";

export type DistribuicaoAprovacaoV4 = {
  recurso_id: string;
  origem: "ORIGINAL" | "COMPATIBILIDADE";
  ordem_consideracao: number;
  capacidade_bruta_periodo: number;
  produtividade_considerada: number;
  capacidade_efetiva: number;
  comprometido_inicial: number;
  capacidade_disponivel_inicial: number;
  capacidade_disponivel_antes: number;
  horas_padrao_alocadas: number;
  horas_maquina_estimadas: number;
  capacidade_disponivel_depois: number;
};

export type ItemAprovacaoV4 = {
  bom_operacao_id: string;
  recurso_original_id: string;
  necessario: number;
  deficit: number;
  distribuicoes: DistribuicaoAprovacaoV4[];
};

function montarDistribuicaoV4(distribuicao: DistribuicaoParaPersistencia): DistribuicaoAprovacaoV4 {
  return {
    recurso_id: distribuicao.recursoId,
    origem: distribuicao.origem,
    ordem_consideracao: distribuicao.ordemConsideracao,
    capacidade_bruta_periodo: distribuicao.capacidadeBrutaPeriodo,
    produtividade_considerada: distribuicao.produtividadeConsiderada,
    capacidade_efetiva: distribuicao.capacidadeEfetiva,
    comprometido_inicial: distribuicao.comprometidoInicial,
    capacidade_disponivel_inicial: distribuicao.capacidadeDisponivelInicial,
    capacidade_disponivel_antes: distribuicao.capacidadeDisponivelAntes,
    horas_padrao_alocadas: distribuicao.horasPadraoAlocadas,
    horas_maquina_estimadas: distribuicao.horasMaquinaEstimadas,
    capacidade_disponivel_depois: distribuicao.capacidadeDisponivelDepois,
  };
}

/**
 * Mapeamento integral, sem perda: cada operação vira um item com 0..N
 * distribuições (déficit total = array vazio; 1 recurso; 2+ recursos -
 * todos representáveis nativamente, ao contrário da ponte v3 da Fase 2).
 */
export function montarItensParaV4(itens: ItemSimulacaoOperacao[]): ItemAprovacaoV4[] {
  return itens.map((item) => ({
    bom_operacao_id: item.bomOperacaoId,
    recurso_original_id: item.recursoOriginalId,
    necessario: item.necessario,
    deficit: item.deficit,
    distribuicoes: item.distribuicoes.map(montarDistribuicaoV4),
  }));
}
