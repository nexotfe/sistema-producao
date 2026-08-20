// DEC-007 - previsão comercial por capacidade, incremento pós-FIFO
// (ver estimativaFifoComercial.ts): distribuição de 1 OP entre o
// recurso original e as alternativas AUTORIZADAS - nunca um segundo
// motor de compatibilidade. "Autorizada" = já resolvida pelo chamador
// (recurso_produtivo_compatibilidades, hoje); esta camada nunca deduz
// compatibilidade por grupo, nome ou semelhança.
//
// Ordem de consumo é uma regra de NEGÓCIO fixa (capacidade interna sem
// custo primeiro), nunca otimizada por "término mais rápido":
// 1. normal do recurso original;
// 2. normal dos compatíveis, na prioridade cadastrada;
// 3. capacidade adicional autorizada no cenário;
// 4. recursos temporários/máquinas alugadas/freelancers.
// Terceirização fica fora deste incremento (substitui o trabalho
// completo, não disputa capacidade hora a hora - integração separada).

export interface NecessidadeCapacidadeFlexivel {
  readonly empresaId: string;
  readonly projetoId: string;
  readonly projetoItemId: string;
  readonly chaveTrabalho: string;
  readonly recursoOriginalId: string;
  /** Em ordem de prioridade - nunca reordenada internamente. Sem duplicata, sem o próprio recursoOriginalId. */
  readonly recursosCompativeisPorPrioridade: readonly string[];
  readonly horasNecessariasPadrao: number;
  readonly disponivelAPartirDe: string;
}

export type TipoCapacidadeFlexivel = "normal_original" | "normal_compativel" | "adicional" | "temporario";

export interface AlocacaoNecessidadeFlexivel {
  readonly chaveTrabalho: string;
  readonly recursoId: string;
  readonly tipoCapacidade: TipoCapacidadeFlexivel;
  readonly data: string;
  readonly horasPadrao: number;
  readonly horasMaquina: number;
  /** null só para normal_original/normal_compativel (jornada cadastrada, não é contratação) - sempre preenchido para adicional/temporario. */
  readonly contratacaoId: string | null;
}

export interface ResultadoDistribuicaoFlexivel {
  readonly status: "concluida" | "capacidade_insuficiente";
  readonly horasNecessariasPadrao: number;
  readonly horasAlocadasPadrao: number;
  readonly deficitResidualHorasPadrao: number;
  readonly alocacoes: readonly AlocacaoNecessidadeFlexivel[];
  readonly recursosEfetivamenteUsados: readonly string[];
}

/** Capacidade normal (horas-máquina/dia, constante) e produtividade de 1 recurso - original ou compatível, mesmo formato para os dois. */
export interface CapacidadeNormalRecurso {
  readonly recursoId: string;
  readonly produtividade: number;
  readonly capacidadeHorasMaquinaDia: number;
}
