// DEC-007 §6.2/Fase 8b (redesenho: recurso temporário na planilha) -
// monta o fragmento de DecisoesCenario (avaliarCenario.ts) a partir dos
// recursos temporários criados pelo usuário - 1 recurso temporário = 1
// DecisaoRecursoTemporario + 1 Contratacao própria (custo contabilizado
// uma única vez, mesma garantia de calcularCustoContratacoes/
// contratacao.ts, reaproveitada sem alteração). `tipo` da Contratacao é
// sempre o mesmo `RecursoTemporarioCenario.tipo` (inclusive
// "equipamento_adicional") - o custo real depende só de
// abrangencia/valor/uso, nunca do tipo (ver contratacao.ts).
import type { DecisoesCenario, DecisaoRecursoTemporario } from "./avaliarCenario";
import type { AbrangenciaContratacao, Contratacao } from "./contratacao";
import type { RecursoTemporarioCenario } from "./recursoTemporario";

export interface RecursoTemporarioParaConstruir {
  /** Já com `contratacaoId`/`justificativa`/`disponibilidade`/`aplicavelAsOperacoes` resolvidos pelo chamador. */
  recursoTemporario: RecursoTemporarioCenario;
  /** Resolvida via resolverProdutividadeRecurso.ts a partir de recursoTemporario.recursoReferenciaId. */
  produtividadeReferencia: number;
  abrangencia: AbrangenciaContratacao;
  valor: number;
  fornecedorOuObservacao: string;
}

export function construirDecisoesRecursoTemporario(itens: readonly RecursoTemporarioParaConstruir[]): DecisoesCenario {
  const recursosTemporarios: DecisaoRecursoTemporario[] = [];
  const contratacoes: Contratacao[] = [];

  for (const item of itens) {
    recursosTemporarios.push({
      recursoTemporario: item.recursoTemporario,
      produtividadeReferencia: item.produtividadeReferencia,
    });

    contratacoes.push({
      id: item.recursoTemporario.contratacaoId,
      tipo: item.recursoTemporario.tipo,
      abrangencia: item.abrangencia,
      valor: item.valor,
      moeda: "BRL",
      fornecedorOuContratado: item.fornecedorOuObservacao.trim() || "Não informado",
      referenciaProposta: null,
      justificativa: item.recursoTemporario.justificativa,
      datas: item.recursoTemporario.disponibilidade.map((dia) => dia.data),
    });
  }

  return { capacidadeExtra: [], contratacoes, terceirizacoes: [], recursosTemporarios, antecipacoesMaterial: [] };
}
