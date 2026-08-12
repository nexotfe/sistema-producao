// DEC-007 §3 - Fase 0: capacidade diária por recurso, com normal/extra/
// sobrecarga separadas. Capacidade negativa (comprometido > jornada)
// NÃO é erro de dado - é sobrecarga real, que precisa ficar visível,
// nunca escondida numa subtração única (normal + extra - comprometido
// permitiria que compromisso antigo "comesse" hora extra contratada
// especificamente para o cenário novo).
//
// Função pura: quem chama já resolveu jornadaNormalHorasMaquina/
// comprometidoHorasMaquina/capacidadeExtraAutorizadaHorasMaquina a
// partir do cadastro/calendário real (isso é I/O, fica para as fases
// seguintes) - aqui só a fórmula, sem nenhuma consulta.
import { validarHorasFinitasNaoNegativas } from "./validacoes";

export interface ResultadoCapacidadeDia {
  /** max(0, normal - comprometido) - nunca negativo. */
  normalDisponivel: number;
  /** max(0, comprometido - normal) - sobrecarga JÁ existente, real, reportada. */
  sobrecarga: number;
  /** Capacidade extra autorizada NESTE cenário - nunca reduzida pelo comprometido antigo. */
  extraDisponivel: number;
}

export function capacidadeDia(params: {
  jornadaNormalHorasMaquina: number;
  comprometidoHorasMaquina: number;
  capacidadeExtraAutorizadaHorasMaquina: number;
}): ResultadoCapacidadeDia {
  const { jornadaNormalHorasMaquina, comprometidoHorasMaquina, capacidadeExtraAutorizadaHorasMaquina } = params;
  validarHorasFinitasNaoNegativas(jornadaNormalHorasMaquina, "jornadaNormalHorasMaquina");
  validarHorasFinitasNaoNegativas(comprometidoHorasMaquina, "comprometidoHorasMaquina");
  validarHorasFinitasNaoNegativas(capacidadeExtraAutorizadaHorasMaquina, "capacidadeExtraAutorizadaHorasMaquina");

  return {
    normalDisponivel: Math.max(0, jornadaNormalHorasMaquina - comprometidoHorasMaquina),
    sobrecarga: Math.max(0, comprometidoHorasMaquina - jornadaNormalHorasMaquina),
    extraDisponivel: capacidadeExtraAutorizadaHorasMaquina,
  };
}

/**
 * DEC-007 §3 - a grade compartilhada precisa dizer quem pode consumir a
 * capacidade extra, senão um projeto antigo de prioridade maior pode
 * "roubar" hora extra contratada para viabilizar o orçamento novo.
 */
export type ElegibilidadeCapacidadeExtra =
  | { escopo: "somente_orcamento_novo" }
  | { escopo: "qualquer_projeto_do_cenario" }
  | { escopo: "projetos_especificos"; projetoIds: string[] };

export function projetoElegivelParaExtra(
  elegibilidade: ElegibilidadeCapacidadeExtra,
  projetoId: string,
  ehOrcamentoNovo: boolean,
): boolean {
  switch (elegibilidade.escopo) {
    case "somente_orcamento_novo":
      return ehOrcamentoNovo;
    case "qualquer_projeto_do_cenario":
      return true;
    case "projetos_especificos":
      return elegibilidade.projetoIds.includes(projetoId);
  }
}

/** DEC-007 §3 - contrato de capacidade extra por recurso e por data (substitui períodos simples e ajustes globais). */
export interface CapacidadeExtraDia {
  recursoId: string;
  data: string;
  horasAdicionaisDisponiveis: number;
  natureza: "hora_extra" | "sabado" | "domingo" | "feriado";
  elegibilidade: ElegibilidadeCapacidadeExtra;
  contratacaoId: string;
}
