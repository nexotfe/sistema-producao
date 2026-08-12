// DEC-007 §9 - Fase 5: snapshot legado (projeto aprovado antes desta
// entrega, sem alocação diária persistida - só o comprometido agregado
// por recurso, sem saber em quais dias específicos). Reconstrução real
// via ordens_producao/operacoes_producao (I/O) e o fluxo de confirmação
// do usuário ficam para a Fase 9 (RPC) - aqui só a ARITMÉTICA da
// estimativa FIFO explícita (DEC-007 §9: "nunca FIFO silencioso" -
// silencioso quer dizer sem confirmação do usuário, não que o cálculo em
// si seja proibido; este módulo produz o resultado a ser EXIBIDO para
// essa confirmação, não uma aprovação).
//
// Reaproveita alocarOperacaoDiaAdia (Fase 0) SEM modificação - mesmo
// núcleo de distribuição diária já usado por todo o resto do motor
// (DEC-007 §7, mesmo espírito do antigo Calculador Reverso: "MESMO
// núcleo de distribuição, sem cópia"). Tratar o comprometido legado como
// se fosse uma ocorrência comum, competindo pela capacidade real
// ATUALMENTE disponível (já líquida do que outros projetos já
// consomem), é exatamente a definição de "estimativa FIFO": o comprometido
// antigo é alocado dia a dia, cronologicamente, no recurso a que estava
// vinculado no snapshot.
//
// Ordem de processamento é EXPLÍCITA (`ordemFifo`), nunca a ordem
// incidental do array de entrada - dois comprometidos legados no MESMO
// recurso competem pela mesma capacidade (mesma instância mutável de
// candidato); se a ordem dependesse de como o chamador construiu o
// array (ex.: resultado de uma query sem ORDER BY), o resultado seria
// não determinístico sem nenhum aviso - mesma classe de bug já corrigida
// no escalonador conjunto (Fase 2, critério de prioridade sem empate por
// ordem de chegada).
import { chaveOcorrenciaParaString, type ChaveOcorrencia } from "./chaveOcorrencia";
import { alocarOperacaoDiaAdia, type AlocacaoDiaria, type CandidatoComCapacidadeDiaria } from "./alocarOperacaoDiaAdia";
import { validarHorasFinitasNaoNegativas } from "./validacoes";
import { tratarComoZero } from "../constantesNumericas";

export interface ComprometidoAgregadoLegado {
  chave: ChaveOcorrencia;
  /** Recurso ao qual o comprometido estava vinculado no snapshot legado - precisa existir em registroCandidatos. */
  recursoId: string;
  /** Comprometido total, agregado, sem data - exatamente o dado que o snapshot legado tem. */
  necessarioHorasPadrao: number;
  projetoId: string;
  /** Ordem EXPLÍCITA de processamento (menor = processa primeiro) - nunca inferida da posição no array. Empate resolvido pela chave completa (desempate estável, mesmo padrão do escalonador conjunto). */
  ordemFifo: number;
}

export type StatusEstimativaFifoLegada = "completa" | "parcial";

export interface ResultadoEstimativaFifoLegada {
  chave: ChaveOcorrencia;
  alocacoesEstimadas: AlocacaoDiaria[];
  /** > 0 se a capacidade real atual não é suficiente para acomodar todo o comprometido legado dentro da grade informada - nunca escondido. */
  deficitResidualHorasPadrao: number;
  /**
   * "parcial" sempre que deficitResidualHorasPadrao > 0 - status explícito,
   * nunca deixado para o chamador inferir comparando o número contra zero
   * (esquecer essa checagem trataria uma reconstrução incompleta como se
   * fosse a distribuição real completa).
   */
  status: StatusEstimativaFifoLegada;
}

export interface ResultadoEstimativaFifoLegadaGlobal {
  /**
   * Marca explícita e permanente da PROVENIÊNCIA deste resultado - nunca
   * omitida, presente em TODA saída (completa ou parcial). É o que DEC-007
   * §9 chama de "premissa (fonte + confirmação) congelada no ajuste_cenario"
   * (§12): sem esse campo, nada no valor em si (números de alocação,
   * deficit) distingue uma reconstrução ESTIMADA de um dado real vindo de
   * ordens_producao/operacoes_producao - a distinção precisa sobreviver
   * mesmo depois que o resultado for serializado/persistido.
   */
  fonte: "estimativa_fifo_legado";
  resultados: ResultadoEstimativaFifoLegada[];
  /**
   * "parcial" se QUALQUER resultado individual for "parcial" - sinaliza
   * no nível do LOTE inteiro que a reconstrução não pode ser aprovada sem
   * revisão manual (DEC-007 §9: "aprovação bloqueada até confirmação
   * explícita"), sem depender do chamador escanear item a item. Mesmo
   * raciocínio do `status` por item, um nível acima - só um número
   * (nenhum deficit agregado) já foi insuficiente uma vez nesta mesma
   * função antes da correção; um booleano/status agregado explícito é o
   * que efetivamente bloqueia a aprovação no chamador.
   *
   * DUAS CONFIRMAÇÕES DIFERENTES, NUNCA CONFUNDIDAS (decisão registrada no
   * DEC-007 §9.1 após a auditoria da Fase 5):
   * 1. o usuário aceitar que ESTA é uma reconstrução ESTIMADA (FIFO), não
   *    o dado real - uma confirmação sobre a PROVENIÊNCIA (`fonte`);
   * 2. a capacidade ser SUFICIENTE dentro do horizonte disponível - uma
   *    questão de FATO, medida por `statusGlobal`.
   * A confirmação (1) NUNCA torna (2) verdadeira. Se `statusGlobal ===
   * "parcial"`, a aprovação continua bloqueada por falta de horizonte,
   * mesmo que o usuário já tenha confirmado que aceita a origem FIFO -
   * aceitar a fonte da estimativa não é o mesmo que a estimativa caber.
   */
  statusGlobal: StatusEstimativaFifoLegada;
}

/**
 * Estima, para cada item de comprometido legado, uma distribuição diária
 * FIFO plausível (cronológica, no único recurso a que o comprometido
 * estava vinculado) - explícita, para EXIBIÇÃO e confirmação do usuário
 * (Fase 9), nunca aplicada silenciosamente. `registroCandidatos` já deve
 * refletir a capacidade líquida real (mesma grade usada pelo cálculo
 * atual) - este módulo não subtrai nada por conta própria além do que o
 * candidato injetado já representa.
 */
export function estimarDistribuicaoFifoLegada(params: {
  comprometidos: ComprometidoAgregadoLegado[];
  registroCandidatos: ReadonlyMap<string, CandidatoComCapacidadeDiaria>;
  datasGradeCompartilhada: string[];
}): ResultadoEstimativaFifoLegadaGlobal {
  const { comprometidos, registroCandidatos, datasGradeCompartilhada } = params;

  const chavesVistas = new Set<string>();
  for (const comprometido of comprometidos) {
    const chaveStr = chaveOcorrenciaParaString(comprometido.chave);
    if (chavesVistas.has(chaveStr)) {
      throw new RangeError(`Comprometido legado duplicado: a chave "${chaveStr}" aparece mais de uma vez.`);
    }
    chavesVistas.add(chaveStr);

    validarHorasFinitasNaoNegativas(comprometido.necessarioHorasPadrao, `Comprometido legado "${chaveStr}" - necessarioHorasPadrao`);
    if (comprometido.necessarioHorasPadrao <= 0) {
      throw new RangeError(`Comprometido legado "${chaveStr}": necessarioHorasPadrao precisa ser > 0 - recebido: ${comprometido.necessarioHorasPadrao} (comprometido zero não é um comprometido real).`);
    }
    if (!registroCandidatos.has(comprometido.recursoId)) {
      throw new RangeError(`Comprometido legado "${chaveStr}": recursoId "${comprometido.recursoId}" não existe em registroCandidatos.`);
    }
    if (!Number.isFinite(comprometido.ordemFifo)) {
      throw new RangeError(`Comprometido legado "${chaveStr}": ordemFifo precisa ser finita - recebido: ${comprometido.ordemFifo}.`);
    }
  }

  // Ordenação total e determinística: ordemFifo (critério de negócio,
  // pode empatar) -> chave completa (desempate final estável, nunca a
  // ordem de chegada no array).
  const comprometidosOrdenados = [...comprometidos].sort((a, b) => {
    if (a.ordemFifo !== b.ordemFifo) return a.ordemFifo - b.ordemFifo;
    const chaveStrA = chaveOcorrenciaParaString(a.chave);
    const chaveStrB = chaveOcorrenciaParaString(b.chave);
    return chaveStrA < chaveStrB ? -1 : chaveStrA > chaveStrB ? 1 : 0;
  });

  const resultados: ResultadoEstimativaFifoLegada[] = comprometidosOrdenados.map((comprometido) => {
    const candidato = registroCandidatos.get(comprometido.recursoId)!;
    const resultado = alocarOperacaoDiaAdia({
      necessarioHorasPadrao: comprometido.necessarioHorasPadrao,
      candidatosPorPrioridade: [candidato],
      datasOrdenadas: datasGradeCompartilhada,
      projetoId: comprometido.projetoId,
      ehOrcamentoNovo: false,
    });

    return {
      chave: comprometido.chave,
      alocacoesEstimadas: resultado.alocacoes,
      deficitResidualHorasPadrao: resultado.deficitResidualHorasPadrao,
      status: tratarComoZero(resultado.deficitResidualHorasPadrao) ? "completa" : "parcial",
    };
  });

  const statusGlobal: StatusEstimativaFifoLegada = resultados.some((r) => r.status === "parcial") ? "parcial" : "completa";

  return { fonte: "estimativa_fifo_legado", resultados, statusGlobal };
}
