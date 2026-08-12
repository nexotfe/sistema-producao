// DEC-007 §10 - Fase 4: recurso temporário (máquina alugada, freelancer)
// herda produtividade de referência, NUNCA digitada (a interface não tem
// campo próprio para isso - a única forma de fornecê-la é o parâmetro
// `produtividadeReferencia`, que o chamador precisa ler do cadastro real
// do recurso de referência, I/O fora desta fase pura), e tem
// disponibilidade DIÁRIA explícita (não período simples início/fim - um
// recurso temporário não trabalha implicitamente sábado/domingo/feriado
// só porque está "no período"; ausência de uma data em `disponibilidade`
// é SEMPRE zero, nunca presumida).
//
// Este módulo produz a primeira implementação de PRODUÇÃO de
// CandidatoComCapacidadeDiaria deste conjunto (Fases 0-3 só tinham
// implementações de teste) - consumida diretamente pelo
// `registroCandidatos` do escalonador conjunto (Fase 2), sem adaptação.
import { chaveOcorrenciaParaString, type ChaveOcorrencia } from "./chaveOcorrencia";
import type { CandidatoComCapacidadeDiaria, FaixaCapacidadeDia } from "./alocarOperacaoDiaAdia";
import { validarDataIso, validarHorasFinitasNaoNegativas, validarProdutividade } from "./validacoes";

export type TipoRecursoTemporario = "maquina_alugada" | "freelancer";

export interface DisponibilidadeDiaRecursoTemporario {
  data: string;
  horasDisponiveis: number;
}

export interface RecursoTemporarioCenario {
  idTemporario: string;
  tipo: TipoRecursoTemporario;
  /** Produtividade herdada DESTE recurso - nunca digitada (ver comentário do módulo). */
  recursoReferenciaId: string;
  /** Disponibilidade explícita por data - datas ausentes têm ZERO capacidade, nunca presumida a partir de um período. */
  disponibilidade: DisponibilidadeDiaRecursoTemporario[];
  contratacaoId: string;
  justificativa: string;
  aplicavelAsOperacoes: ChaveOcorrencia[];
}

/**
 * Constrói o candidato consumível pelo escalonador conjunto (Fase 2) a
 * partir de um RecursoTemporarioCenario - produtividade SEMPRE a
 * herdada (`produtividadeReferencia`, lida pelo chamador do cadastro real
 * de `recursoReferenciaId`), nunca um valor à parte informado aqui.
 * Faixas natureza="normal" (sem contratacaoId/elegibilidade próprios,
 * mesma invariante de alocarOperacaoDiaAdia.ts) - o vínculo com o custo
 * da contratação é feito por FORA deste candidato, cruzando
 * AlocacaoDiaria.recursoId (=idTemporario) com
 * RecursoTemporarioCenario.contratacaoId (ver contratacao.ts) - nunca
 * embutido na faixa, que é reservada para capacidade extra em recursos
 * REAIS (DEC-007 §3).
 */
export function criarCandidatoRecursoTemporario(
  recursoTemporario: RecursoTemporarioCenario,
  produtividadeReferencia: number,
): CandidatoComCapacidadeDiaria {
  validarProdutividade(produtividadeReferencia, `produtividadeReferencia (recurso temporário "${recursoTemporario.idTemporario}")`);

  const datasVistas = new Set<string>();
  const restantePorData = new Map<string, number>();
  for (const dia of recursoTemporario.disponibilidade) {
    validarDataIso(dia.data, `disponibilidade (recurso temporário "${recursoTemporario.idTemporario}") - data`);
    if (datasVistas.has(dia.data)) {
      throw new RangeError(`Recurso temporário "${recursoTemporario.idTemporario}": data "${dia.data}" duplicada em disponibilidade.`);
    }
    datasVistas.add(dia.data);
    validarHorasFinitasNaoNegativas(dia.horasDisponiveis, `disponibilidade (recurso temporário "${recursoTemporario.idTemporario}", data "${dia.data}") - horasDisponiveis`);
    restantePorData.set(dia.data, dia.horasDisponiveis);
  }

  return {
    id: recursoTemporario.idTemporario,
    produtividade: produtividadeReferencia,
    faixasDoDia: (data): FaixaCapacidadeDia[] => {
      const horasDisponiveis = restantePorData.get(data);
      if (horasDisponiveis === undefined || horasDisponiveis <= 0) return [];
      return [{ natureza: "normal", horasDisponiveis, contratacaoId: null, elegibilidade: null }];
    },
    consumir: (data, _natureza, horasMaquina) => {
      const atual = restantePorData.get(data) ?? 0;
      restantePorData.set(data, atual - horasMaquina);
    },
  };
}

/**
 * Verdadeiro se a ocorrência está entre as declaradas como aplicáveis a
 * este recurso temporário - responsabilidade do CHAMADOR ao montar
 * `candidatoIdsPorPrioridade` de cada OcorrenciaEscalonavel (este módulo
 * não filtra sozinho; expõe a checagem pura para quem monta essa lista).
 */
export function recursoTemporarioAplicavelA(recursoTemporario: RecursoTemporarioCenario, chave: ChaveOcorrencia): boolean {
  const chaveStr = chaveOcorrenciaParaString(chave);
  return recursoTemporario.aplicavelAsOperacoes.some((c) => chaveOcorrenciaParaString(c) === chaveStr);
}
