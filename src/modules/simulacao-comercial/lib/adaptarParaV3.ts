// Fase 2 do rollout da Entrega 2 (PAD-008 v2.0 §19): a persistência
// ainda vai pela RPC v3, que só representa 2 estados - déficit total
// (0 distribuições) ou atendimento integral por exatamente 1 recurso
// (1 distribuição cobrindo 100% da necessidade, deficit=0). A v3 NÃO
// representa: 1 recurso atendendo só parcialmente (deficit > 0, mesmo
// com 1 única distribuição), nem 2+ recursos. "1 distribuição" sozinho
// não é suficiente para decidir se cabe em v3 - precisa também checar
// se ela cobre 100% da operação.
//
// Função pura, extraída de aprovarSimulacaoComercialAction.ts (que é
// "use server" e só pode exportar funções assíncronas) para ficar
// testável sem sessão real do Supabase - mesmo motivo da extração de
// orquestrarAprovacaoAutoritativa.ts.
//
// Troca para a RPC v4 nativa (sem este adaptador, sem a limitação de
// "só 1 recurso por operação") é a Fase 3 do rollout - alteração
// separada, futura.
import type { ItemSimulacaoOperacao } from "./executarSimulacao";
import { numerosIguais } from "./constantesNumericas";

export type ItemAprovacaoV3 = {
  bom_operacao_id: string;
  recurso_original_id: string;
  recurso_considerado_id: string | null;
  motivo_consideracao: "ORIGINAL" | "COMPATIBILIDADE" | null;
  necessario: number;
  capacidade_bruta: number | null;
  capacidade_efetiva: number | null;
  capacidade_disponivel: number | null;
  comprometido: number | null;
  livre: number | null;
  deficit: number;
};

/**
 * Retorna o item no formato escalar da v3, ou `null` quando a operação
 * não é representável nesse formato (distribuição parcial real).
 */
export function adaptarItemParaV3(item: ItemSimulacaoOperacao): ItemAprovacaoV3 | null {
  if (item.distribuicoes.length === 0) {
    return {
      bom_operacao_id: item.bomOperacaoId,
      recurso_original_id: item.recursoOriginalId,
      recurso_considerado_id: null,
      motivo_consideracao: null,
      necessario: item.necessario,
      capacidade_bruta: null,
      capacidade_efetiva: null,
      capacidade_disponivel: null,
      comprometido: null,
      livre: null,
      deficit: item.deficit,
    };
  }

  if (item.distribuicoes.length === 1) {
    const [distribuicao] = item.distribuicoes;
    // Precisa cobrir 100% da necessidade - 1 distribuição sozinha não
    // basta se ela for parcial (deficit > 0).
    const atendeuIntegralmente =
      numerosIguais(distribuicao.horasPadraoAlocadas, item.necessario) && numerosIguais(item.deficit, 0);

    if (!atendeuIntegralmente) {
      return null;
    }

    return {
      bom_operacao_id: item.bomOperacaoId,
      recurso_original_id: item.recursoOriginalId,
      recurso_considerado_id: distribuicao.recursoId,
      motivo_consideracao: distribuicao.origem,
      necessario: item.necessario,
      capacidade_bruta: distribuicao.capacidadeBrutaPeriodo,
      // v3 chama de "capacidade_disponivel" o valor SEM desconto de
      // comprometido (= capacidadeEfetiva aqui) - "livre" é quem tem o
      // desconto. Nomenclatura antiga, preservada só nesta ponte.
      capacidade_efetiva: distribuicao.capacidadeEfetiva,
      capacidade_disponivel: distribuicao.capacidadeEfetiva,
      comprometido: distribuicao.comprometidoInicial,
      livre: distribuicao.capacidadeDisponivelInicial,
      deficit: 0,
    };
  }

  // 2+ distribuições - v3 não tem esse conceito.
  return null;
}

/**
 * Adapta todos os itens de uma vez - retorna os itens adaptados OU a
 * lista de operações não representáveis (nunca os dois juntos: se
 * qualquer operação falhar, a aprovação inteira é bloqueada, nada é
 * persistido parcialmente).
 */
export function adaptarItensParaV3(
  itens: ItemSimulacaoOperacao[],
): { ok: true; itens: ItemAprovacaoV3[] } | { ok: false; operacoesNaoRepresentaveis: string[] } {
  const itensAdaptados: ItemAprovacaoV3[] = [];
  const operacoesNaoRepresentaveis: string[] = [];

  for (const item of itens) {
    const adaptado = adaptarItemParaV3(item);
    if (adaptado === null) {
      operacoesNaoRepresentaveis.push(item.bomOperacaoId);
      continue;
    }
    itensAdaptados.push(adaptado);
  }

  if (operacoesNaoRepresentaveis.length > 0) {
    return { ok: false, operacoesNaoRepresentaveis };
  }

  return { ok: true, itens: itensAdaptados };
}
