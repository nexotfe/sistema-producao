// DEC-007 §6.2 (correção de transparência obrigatória - achada em teste
// visual real, projeto 260011): antes desta correção, `SaidaPrevisaoComercial`
// só expunha TOTAIS agregados (capacidadeUtilizada.horaAdicionalHoras,
// custoAdicional.horaAdicional) - somados por CATEGORIA em todos os
// recursos ao mesmo tempo, nunca por recurso. A tela não conseguia
// responder "qual recurso consumiu as 0,7h" nem "por que 9h do Ajustador
// ficaram sem uso" - a falta de rastreabilidade em si já era um defeito
// funcional, independente de qualquer erro de cálculo (nenhum foi
// confirmado no motor - ver avaliarPrevisaoComercialFlexivel.monotonicidade.test.ts).
//
// Função pura: recebe exatamente o que montarPrevisaoComercialProjeto.ts
// já tem em mãos (resultadosPorOp da avaliação + as necessidades/cenário
// que a geraram) - nenhuma consulta nova, nenhuma fórmula de custo nova
// (reaproveita calcularCustoContratacoes, a mesma já usada por
// calcularCustoAdicional no módulo vizinho).
import type { ResultadoOpOrcamentoNovo } from "./avaliarPrevisaoComercialFlexivel";
import type { CapacidadeExtraDia } from "./capacidadeDia";
import type { NecessidadeCapacidadeFlexivel } from "./necessidadeCapacidadeFlexivel";
import { calcularCustoContratacoes, type Contratacao } from "./contratacao";

export type PapelRecursoPrevisaoComercial = "original" | "compativel" | "temporario";

export interface DetalhamentoRecursoPrevisaoComercial {
  readonly recursoId: string;
  /** "original" se este recurso é recursoOriginalId de QUALQUER necessidade (mesmo que também seja compatível de outra); "compativel" só quando nunca aparece como original; "temporario" para recursoId que só existe como candidato temporário (idTemporario), nunca um recurso_produtivo real. */
  readonly papel: PapelRecursoPrevisaoComercial;
  /**
   * Todo campo de horas abaixo está em horas-MÁQUINA (AlocacaoNecessidadeFlexivel.horasMaquina =
   * horasPadrao / produtividade, ver unidades.ts) - a mesma unidade de
   * `CapacidadeExtraDia.horasAdicionaisDisponiveis` (o que o usuário
   * autoriza em horas de calendário) e de
   * `SaidaPrevisaoComercial.capacidadeUtilizada`/`custoAdicional`
   * (montarPrevisaoComercialProjeto.ts) - nunca horasPadrao, que é uma
   * unidade interna da rede de fluxo e não bate com essas duas fontes
   * quando produtividade != 1.
   */
  readonly horasNormaisUtilizadas: number;
  readonly horasExtrasDisponibilizadas: number;
  readonly horasExtrasUtilizadas: number;
  /** max(0, disponibilizadas - utilizadas) - nunca negativo. Sempre 0 quando papel="temporario" (recurso temporário não tem tier "extra" separado do próprio candidato). */
  readonly horasExtrasDescartadas: number;
  readonly horasTemporariasUtilizadas: number;
  /**
   * Frase determinística e sempre presente quando horasExtrasDescartadas > 0 -
   * nunca "sem motivo" (pedido explícito de transparência). A ORDEM de
   * consumo (normal original -> normal compatíveis -> adicional ->
   * temporário, ver necessidadeCapacidadeFlexivel.ts) e a regra "nunca
   * usa mais que o necessário" (calcularCustoContratacoes só cobra horas
   * REALMENTE alocadas) são a única causa possível de sobra - não há
   * outra categoria de motivo no motor atual.
   */
  readonly motivoDescarte: string | null;
  /** null = não calculável (mesma regra de SaidaPrevisaoComercial.custoAdicional - nunca 0 fingido). */
  readonly custoExtraEfetivo: number | null;
}

const MOTIVO_DESCARTE_PADRAO =
  "Não utilizada - a necessidade elegível já foi atendida por capacidade normal (própria ou de recurso compatível) ou por outro tier de menor custo antes deste ser necessário. O motor nunca usa mais hora extra do que o estritamente necessário para cumprir o prazo.";

function papelDoRecurso(recursoId: string, necessidades: readonly NecessidadeCapacidadeFlexivel[], ehTemporario: boolean): PapelRecursoPrevisaoComercial {
  if (ehTemporario) return "temporario";
  if (necessidades.some((n) => n.recursoOriginalId === recursoId)) return "original";
  return "compativel";
}

export function construirDetalhamentoPorRecurso(params: {
  resultadosPorOp: readonly ResultadoOpOrcamentoNovo[];
  necessidades: readonly NecessidadeCapacidadeFlexivel[];
  capacidadeExtraAutorizada: readonly CapacidadeExtraDia[];
  contratacoes: readonly Contratacao[];
}): readonly DetalhamentoRecursoPrevisaoComercial[] {
  const { resultadosPorOp, necessidades, capacidadeExtraAutorizada, contratacoes } = params;

  const recursosDeNecessidades = new Set<string>();
  for (const n of necessidades) {
    recursosDeNecessidades.add(n.recursoOriginalId);
    for (const id of n.recursosCompativeisPorPrioridade) recursosDeNecessidades.add(id);
  }

  const todosRecursoIds = new Set<string>(recursosDeNecessidades);
  for (const extra of capacidadeExtraAutorizada) todosRecursoIds.add(extra.recursoId);
  for (const { resultado } of resultadosPorOp) {
    for (const alocacao of resultado.alocacoes) todosRecursoIds.add(alocacao.recursoId);
  }

  const horasExtrasDisponibilizadasPorRecurso = new Map<string, number>();
  for (const extra of capacidadeExtraAutorizada) {
    horasExtrasDisponibilizadasPorRecurso.set(extra.recursoId, (horasExtrasDisponibilizadasPorRecurso.get(extra.recursoId) ?? 0) + extra.horasAdicionaisDisponiveis);
  }

  // Custo por contratacaoId - mesma fonte de calcularCustoAdicional
  // (montarPrevisaoComercialProjeto.ts), nunca uma segunda fórmula.
  // `null` (nunca 0 fingido) se a lista de contratações tiver uma
  // inconsistência real - mesma regra de custoAdicional.
  let custoPorContratacaoId: ReadonlyMap<string, number> | null;
  try {
    const horasPorContratacaoId = new Map<string, number>();
    for (const { resultado } of resultadosPorOp) {
      for (const alocacao of resultado.alocacoes) {
        if (alocacao.contratacaoId === null) continue;
        horasPorContratacaoId.set(alocacao.contratacaoId, (horasPorContratacaoId.get(alocacao.contratacaoId) ?? 0) + alocacao.horasMaquina);
      }
    }
    custoPorContratacaoId = calcularCustoContratacoes({ contratacoes: [...contratacoes], horasUsadasPorContratacaoId: horasPorContratacaoId }).custoPorContratacaoId;
  } catch {
    custoPorContratacaoId = null;
  }

  const horasNormaisPorRecurso = new Map<string, number>();
  const horasExtrasUtilizadasPorRecurso = new Map<string, number>();
  const horasTemporariasPorRecurso = new Map<string, number>();
  const contratacaoIdsAdicionalPorRecurso = new Map<string, Set<string>>();
  const recursosTemporarios = new Set<string>();

  // CORREÇÃO (achada em teste visual real, projeto 260011 - detalhamento
  // por recurso não batia com o total agregado de capacidadeUtilizada):
  // AlocacaoNecessidadeFlexivel carrega DUAS unidades - horasPadrao
  // (abstração usada internamente pela rede de fluxo) e horasMaquina
  // (horasPadrao / produtividade, ver unidades.ts) - e só horasMaquina é
  // comparável com `CapacidadeExtraDia.horasAdicionaisDisponiveis` (o
  // que o usuário autoriza em horas de calendário/máquina) e com
  // `capacidadeUtilizada.horaAdicionalHoras`/`calcularCustoAdicional`
  // (montarPrevisaoComercialProjeto.ts, ambos já em horasMaquina). Usar
  // horasPadrao aqui somava um número em unidade diferente do total já
  // exibido em outro lugar da tela - divergiam sempre que produtividade
  // != 1 (o caso comum; só passava despercebido em teste com
  // produtividade=1, onde as duas unidades coincidem por acidente).
  for (const { resultado } of resultadosPorOp) {
    for (const alocacao of resultado.alocacoes) {
      if (alocacao.tipoCapacidade === "normal_original" || alocacao.tipoCapacidade === "normal_compativel") {
        horasNormaisPorRecurso.set(alocacao.recursoId, (horasNormaisPorRecurso.get(alocacao.recursoId) ?? 0) + alocacao.horasMaquina);
      } else if (alocacao.tipoCapacidade === "adicional") {
        horasExtrasUtilizadasPorRecurso.set(alocacao.recursoId, (horasExtrasUtilizadasPorRecurso.get(alocacao.recursoId) ?? 0) + alocacao.horasMaquina);
        if (alocacao.contratacaoId !== null) {
          if (!contratacaoIdsAdicionalPorRecurso.has(alocacao.recursoId)) contratacaoIdsAdicionalPorRecurso.set(alocacao.recursoId, new Set());
          contratacaoIdsAdicionalPorRecurso.get(alocacao.recursoId)!.add(alocacao.contratacaoId);
        }
      } else if (alocacao.tipoCapacidade === "temporario") {
        horasTemporariasPorRecurso.set(alocacao.recursoId, (horasTemporariasPorRecurso.get(alocacao.recursoId) ?? 0) + alocacao.horasMaquina);
        recursosTemporarios.add(alocacao.recursoId);
        if (alocacao.contratacaoId !== null) {
          if (!contratacaoIdsAdicionalPorRecurso.has(alocacao.recursoId)) contratacaoIdsAdicionalPorRecurso.set(alocacao.recursoId, new Set());
          contratacaoIdsAdicionalPorRecurso.get(alocacao.recursoId)!.add(alocacao.contratacaoId);
        }
      }
    }
  }

  const linhas: DetalhamentoRecursoPrevisaoComercial[] = Array.from(todosRecursoIds)
    .sort()
    .map((recursoId) => {
      const horasExtrasDisponibilizadas = horasExtrasDisponibilizadasPorRecurso.get(recursoId) ?? 0;
      const horasExtrasUtilizadas = horasExtrasUtilizadasPorRecurso.get(recursoId) ?? 0;
      const horasExtrasDescartadasBruto = horasExtrasDisponibilizadas - horasExtrasUtilizadas;
      const horasExtrasDescartadas = horasExtrasDescartadasBruto > 0 ? horasExtrasDescartadasBruto : 0;

      const contratacaoIdsDoRecurso = contratacaoIdsAdicionalPorRecurso.get(recursoId);
      const custoExtraEfetivo =
        custoPorContratacaoId === null
          ? null
          : contratacaoIdsDoRecurso
            ? Array.from(contratacaoIdsDoRecurso).reduce((soma, id) => soma + (custoPorContratacaoId!.get(id) ?? 0), 0)
            : 0;

      return {
        recursoId,
        papel: papelDoRecurso(recursoId, necessidades, recursosTemporarios.has(recursoId)),
        horasNormaisUtilizadas: horasNormaisPorRecurso.get(recursoId) ?? 0,
        horasExtrasDisponibilizadas,
        horasExtrasUtilizadas,
        horasExtrasDescartadas,
        horasTemporariasUtilizadas: horasTemporariasPorRecurso.get(recursoId) ?? 0,
        motivoDescarte: horasExtrasDescartadas > 0 ? MOTIVO_DESCARTE_PADRAO : null,
        custoExtraEfetivo,
      };
    });

  return linhas;
}
