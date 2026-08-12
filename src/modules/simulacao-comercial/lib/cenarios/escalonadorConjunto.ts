// DEC-007 §7 - Fase 2: escalonador conjunto (fila de prontos, Kahn), a
// grade de capacidade REALMENTE compartilhada entre todos os projetos.
//
// Grade compartilhada por construção, não por convenção do chamador: as
// ocorrências NUNCA embutem objetos CandidatoComCapacidadeDiaria - só
// referenciam candidatoId (string). A única instância de estado por
// recurso vive em `registroCandidatos`, resolvida aqui. Duas ocorrências
// que referenciam o mesmo candidatoId sempre disputam a MESMA instância
// mutável (mesmo mecanismo de `consumir` de alocarOperacaoDiaAdia) -
// estruturalmente impossível recriar dupla reserva injetando dois objetos
// diferentes para o mesmo recurso, porque não há como um objeto entrar no
// cálculo sem passar por este registro único.
//
// Nenhum calendário genérico (produtivo/não-produtivo por dia da semana)
// participa nem da alocação nem da ORDENAÇÃO da fila de prontos - só a
// data civil bruta (dataInicioJanela, ou o dia seguinte ao fim da maior
// predecessora). Um calendário genérico não sabe se um dia "não
// produtivo" tem capacidade extra autorizada especificamente para o
// candidato/projeto desta ocorrência (informação de
// CapacidadeExtraDia/elegibilidade); usá-lo para AVANÇAR a data, mesmo só
// para desempate, pode empatar artificialmente duas ocorrências (uma que
// só consegue começar numa data posterior de verdade, outra que consegue
// começar antes via capacidade extra que o calendário desconhece) e
// deixar a chave decidir - alterando quem reserva a capacidade primeiro.
// A disponibilidade real (normal×extra, por natureza) continua sendo
// decidida inteiramente por alocarOperacaoDiaAdia, dia a dia.
//
// Erro estrutural (ciclo, chave ausente, candidatoId sem registro,
// prioridade não-finita para QUALQUER ocorrência, grade vazia com
// ocorrências pendentes) aborta o cenário INTEIRO (lança exceção) ANTES
// de qualquer mutação de capacidade - nunca vira um resultado parcial por
// ocorrência, e nunca é descoberto só depois de outras ocorrências já
// terem consumido capacidade real. Em particular, a prioridade de TODAS
// as ocorrências (inclusive sucessoras que só ficam prontas depois) é
// calculada e validada num único passo, antes do laço principal começar -
// uma sucessora com prioridade inválida aborta o cenário antes de
// qualquer `candidato.consumir` ser chamado. Só depois dessa validação
// completa é que o grafo é garantidamente acíclico e com referências
// íntegras; a partir daí, qualquer ocorrência que sobre sem resultado ao
// final do laço só pode ser por predecessora não concluída (bloqueada de
// verdade ou nunca processada) - nunca mais um "ciclo_ou_erro_estrutural"
// residual, que misturaria erro de dado com resultado de negócio.
//
// necessarioHorasPadrao <= 0 é rejeitado (nunca 0 "concluído
// automaticamente") - uma operação produtiva sem esforço não tem
// início/fim real coerente para se propagar às sucessoras.
import { chaveOcorrenciaParaString, type ChaveOcorrencia } from "./chaveOcorrencia";
import {
  detectarCiclo,
  resolverOcorrenciasLiberadas,
  type DependenciaOcorrencia,
} from "./grafoPrecedencia";
import { resolverDataInicioMinima } from "./datasPrecedencia";
import {
  alocarOperacaoDiaAdia,
  type AlocacaoDiaria,
  type CandidatoComCapacidadeDiaria,
} from "./alocarOperacaoDiaAdia";
import { validarDataIso, validarDatasEstritamenteCrescentes } from "./validacoes";

export interface OcorrenciaEscalonavel {
  chave: ChaveOcorrencia;
  projetoId: string;
  necessarioHorasPadrao: number;
  /** IDs resolvidos contra `registroCandidatos` - nunca objetos embutidos (ver comentário do módulo). */
  candidatoIdsPorPrioridade: string[];
  ehOrcamentoNovo: boolean;
  dataInicioJanela: string;
}

export type StatusOcorrenciaEscalonada = "concluida" | "bloqueada_por_deficit" | "bloqueada_por_predecessora";

export interface ResultadoOcorrenciaEscalonada {
  chave: ChaveOcorrencia;
  status: StatusOcorrenciaEscalonada;
  /** Primeiro dia com alguma alocação real - null se nenhuma alocação ocorreu. */
  dataInicioReal: string | null;
  /**
   * Último dia com alguma alocação real - populada sempre que houve
   * alocação, INDEPENDENTE do status (informativo: "até onde chegou",
   * mesmo bloqueada_por_deficit - NÃO é um término real nesse caso).
   * A distinção concluída×bloqueada é inteiramente responsabilidade de
   * `status`/`deficitResidualHorasPadrao` - nenhum consumidor deste
   * resultado (ex.: compararProgramacoes) pode tratar dataFimReal como
   * "terminou" sem checar `status === "concluida"` primeiro.
   */
  dataFimReal: string | null;
  alocacoes: AlocacaoDiaria[];
  deficitResidualHorasPadrao: number;
}

/**
 * Critério de prioridade de NEGÓCIO - um EXTRATOR DE CHAVE (menor valor =
 * maior prioridade), não um comparador binário. Essa é a API
 * deliberadamente: um comparador binário `(a,b) => number` fornecido pelo
 * chamador pode ser mal formado (não-transitivo, assimétrico -
 * ex.: prioridade(A,B)>0, prioridade(B,C)>0, prioridade(C,A)>0
 * simultaneamente) sem que nenhuma validação pontual capture isso, e um
 * `Array.sort` sobre um comparador inconsistente não tem resultado
 * determinístico garantido. Um extrator de chave numérica não tem essa
 * classe de defeito - comparação numérica é sempre uma ordem total válida
 * por construção. Pode legitimamente devolver o mesmo número para duas
 * ocorrências (empate de prioridade) - o desempate final é
 * responsabilidade de `compararComDesempateTotal`, não deste critério.
 * Chamado EXATAMENTE UMA VEZ por ocorrência, para TODAS as ocorrências,
 * antes do laço principal (ver `escalonarConjuntoComFilaDeProntos`).
 */
export type CriterioPrioridadeDeNegocio = (ocorrencia: OcorrenciaEscalonavel) => number;

function validarEntrada(params: {
  ocorrencias: OcorrenciaEscalonavel[];
  dependencias: DependenciaOcorrencia[];
  registroCandidatos: ReadonlyMap<string, CandidatoComCapacidadeDiaria>;
  datasGradeCompartilhada: string[];
}): void {
  const { ocorrencias, dependencias, registroCandidatos, datasGradeCompartilhada } = params;

  validarDatasEstritamenteCrescentes(datasGradeCompartilhada, "datasGradeCompartilhada");

  if (ocorrencias.length > 0 && datasGradeCompartilhada.length === 0) {
    throw new RangeError(
      "datasGradeCompartilhada está vazia mas há ocorrências para escalonar - isso é um erro de configuração " +
        "(nenhuma data foi disponibilizada para o cálculo), NUNCA um déficit comercial legítimo. " +
        "Déficit comercial exige uma grade com pelo menos 1 data, capacidade insuficiente dentro dela.",
    );
  }

  for (const [id, candidato] of registroCandidatos) {
    if (candidato.id !== id) {
      throw new RangeError(
        `registroCandidatos: chave "${id}" não corresponde ao candidato.id="${candidato.id}" armazenado nela.`,
      );
    }
  }

  const chavesConhecidas = new Set<string>();
  for (const ocorrencia of ocorrencias) {
    const chaveStr = chaveOcorrenciaParaString(ocorrencia.chave);
    if (chavesConhecidas.has(chaveStr)) {
      throw new RangeError(`Ocorrência duplicada no conjunto: a chave "${chaveStr}" aparece mais de uma vez.`);
    }
    chavesConhecidas.add(chaveStr);

    if (!Number.isFinite(ocorrencia.necessarioHorasPadrao) || ocorrencia.necessarioHorasPadrao <= 0) {
      throw new RangeError(
        `Ocorrência "${chaveStr}": necessarioHorasPadrao precisa ser finito e > 0 - recebido: ${ocorrencia.necessarioHorasPadrao} ` +
          `(uma operação produtiva sem esforço não tem início/fim real coerente para se propagar às sucessoras).`,
      );
    }
    validarDataIso(ocorrencia.dataInicioJanela, `Ocorrência "${chaveStr}": dataInicioJanela`);

    for (const candidatoId of ocorrencia.candidatoIdsPorPrioridade) {
      if (!registroCandidatos.has(candidatoId)) {
        throw new RangeError(
          `Ocorrência "${chaveStr}": candidatoId "${candidatoId}" não existe em registroCandidatos - toda referência de candidato precisa resolver contra o registro central (grade realmente compartilhada).`,
        );
      }
    }
  }

  for (const dependencia of dependencias) {
    for (const chave of [dependencia.predecessora, dependencia.sucessora]) {
      const chaveStr = chaveOcorrenciaParaString(chave);
      if (!chavesConhecidas.has(chaveStr)) {
        throw new RangeError(
          `Dependência referencia uma ocorrência fora do conjunto informado: "${chaveStr}".`,
        );
      }
    }
  }

  const cicloEncontrado = detectarCiclo(dependencias);
  if (cicloEncontrado) {
    throw new RangeError(
      `Ciclo de precedência detectado entre ocorrências: ${cicloEncontrado.map(chaveOcorrenciaParaString).join(" -> ")}`,
    );
  }
}

/**
 * Prioridade de negócio de TODAS as ocorrências, calculada e validada num
 * único passo - nunca recalculada depois, nunca calculada só para o
 * subconjunto "pronto" de uma rodada (ver comentário do módulo: precisa
 * rodar inteiramente ANTES de qualquer `candidato.consumir`).
 */
function calcularPrioridadesDeTodasAsOcorrencias(
  ocorrencias: OcorrenciaEscalonavel[],
  criterioPrioridadeDeNegocio: CriterioPrioridadeDeNegocio,
): Map<string, number> {
  const prioridadePorChaveStr = new Map<string, number>();
  for (const ocorrencia of ocorrencias) {
    const chaveStr = chaveOcorrenciaParaString(ocorrencia.chave);
    const prioridade = criterioPrioridadeDeNegocio(ocorrencia);
    if (!Number.isFinite(prioridade)) {
      throw new RangeError(
        `criterioPrioridadeDeNegocio devolveu um valor não finito (${prioridade}) para a ocorrência "${chaveStr}".`,
      );
    }
    prioridadePorChaveStr.set(chaveStr, prioridade);
  }
  return prioridadePorChaveStr;
}

/**
 * Data mínima de início BRUTA (data civil, sem nenhum calendário) - a
 * MESMA data usada tanto para o desempate 2 da fila de prontos quanto
 * para recortar a janela real passada a alocarOperacaoDiaAdia (nunca duas
 * datas diferentes - ver comentário do módulo):
 * - sem predecessora: dataInicioJanela;
 * - com predecessora(s): max(dataInicioJanela, maior dataFimReal das
 *   predecessoras + 1 dia civil).
 * Reaproveita resolverDataInicioMinima (Fase 1) com a função de calendário
 * IDENTIDADE - a validação de datas ISO e a aritmética de "dia seguinte"
 * continuam vindo de lá (evita duplicar essa lógica aqui), mas nenhum
 * avanço de calendário é aplicado.
 */
function resolverDataMinimaBruta(dataInicioJanela: string, dataFimPredecessoras: string[]): string {
  return resolverDataInicioMinima({
    dataInicioJanela,
    dataFimPredecessoras,
    proximoDiaProdutivoAPartirDe: (data) => data,
  });
}

/**
 * Ordem final da fila de prontos - total, nunca 0 para duas chaves
 * distintas:
 * 1. prioridade de negócio (chave numérica - pode empatar);
 * 2. data mínima de início bruta (data civil, sem calendário - mais
 *    urgente primeiro; a MESMA data usada para a janela real de
 *    alocação, nunca uma versão "ajustada" à parte);
 * 3. chave completa da ocorrência (string), desempate final estável -
 *    garante resultado independente da ordem de entrada em QUALQUER
 *    situação, mesmo com prioridade e data mínima idênticas.
 */
function compararComDesempateTotal(
  chaveStrA: string,
  chaveStrB: string,
  prioridadePorChaveStr: ReadonlyMap<string, number>,
  dataMinimaPorChaveStr: ReadonlyMap<string, string>,
): number {
  const prioridadeA = prioridadePorChaveStr.get(chaveStrA)!;
  const prioridadeB = prioridadePorChaveStr.get(chaveStrB)!;
  if (prioridadeA !== prioridadeB) return prioridadeA - prioridadeB;

  const dataMinimaA = dataMinimaPorChaveStr.get(chaveStrA)!;
  const dataMinimaB = dataMinimaPorChaveStr.get(chaveStrB)!;
  if (dataMinimaA !== dataMinimaB) return dataMinimaA < dataMinimaB ? -1 : 1;

  if (chaveStrA === chaveStrB) {
    // Defensivo: nunca deveria disparar, já rejeitado em validarEntrada (chave duplicada).
    throw new RangeError(`Duas ocorrências com a mesma chave "${chaveStrA}" estão na fila de prontos simultaneamente.`);
  }
  return chaveStrA < chaveStrB ? -1 : 1;
}

export function escalonarConjuntoComFilaDeProntos(params: {
  ocorrencias: OcorrenciaEscalonavel[];
  dependencias: DependenciaOcorrencia[];
  /** Registro central - única fonte de estado de capacidade por candidatoId (recurso real ou temporário). */
  registroCandidatos: ReadonlyMap<string, CandidatoComCapacidadeDiaria>;
  /** Grade única, ordenada, compartilhada por TODAS as ocorrências/projetos - dias corridos (não só produtivos: capacidade extra pode existir em sábado/domingo/feriado), já estendida até o horizonte técnico. */
  datasGradeCompartilhada: string[];
  criterioPrioridadeDeNegocio: CriterioPrioridadeDeNegocio;
}): Map<string, ResultadoOcorrenciaEscalonada> {
  const { ocorrencias, dependencias, registroCandidatos, datasGradeCompartilhada, criterioPrioridadeDeNegocio } = params;

  validarEntrada({ ocorrencias, dependencias, registroCandidatos, datasGradeCompartilhada });

  // Prioridade de TODAS as ocorrências, calculada e validada ANTES de
  // qualquer mutação de capacidade (nenhum candidato.consumir foi chamado
  // ainda neste ponto) - ver comentário do módulo.
  const prioridadePorChaveStr = calcularPrioridadesDeTodasAsOcorrencias(ocorrencias, criterioPrioridadeDeNegocio);

  const porChaveStr = new Map(ocorrencias.map((oc) => [chaveOcorrenciaParaString(oc.chave), oc]));
  const todasChaves = ocorrencias.map((oc) => oc.chave);
  const dependenciasPorSucessora = new Map<string, DependenciaOcorrencia[]>();
  for (const dependencia of dependencias) {
    const sucStr = chaveOcorrenciaParaString(dependencia.sucessora);
    if (!dependenciasPorSucessora.has(sucStr)) dependenciasPorSucessora.set(sucStr, []);
    dependenciasPorSucessora.get(sucStr)!.push(dependencia);
  }

  const resultados = new Map<string, ResultadoOcorrenciaEscalonada>();
  const concluidas = new Set<string>();
  // Data mínima bruta por ocorrência - calculada UMA VEZ, na primeira
  // rodada em que a ocorrência aparece pronta, e nunca recalculada depois
  // (seu valor não muda: predecessoras já concluídas têm dataFimReal
  // fixo, e dataInicioJanela é estático).
  const dataMinimaPorChaveStr = new Map<string, string>();

  while (true) {
    const liberadas = resolverOcorrenciasLiberadas(todasChaves, dependencias, concluidas).filter(
      (chave) => !resultados.has(chaveOcorrenciaParaString(chave)),
    );
    if (liberadas.length === 0) break;

    const prontas = liberadas.map((chave) => porChaveStr.get(chaveOcorrenciaParaString(chave))!);

    for (const oc of prontas) {
      const chaveStr = chaveOcorrenciaParaString(oc.chave);
      if (dataMinimaPorChaveStr.has(chaveStr)) continue;

      const predecessoras = dependenciasPorSucessora.get(chaveStr) ?? [];
      const dataFimPredecessoras = predecessoras.map((dependencia) => {
        const resultadoPredecessora = resultados.get(chaveOcorrenciaParaString(dependencia.predecessora))!;
        // Garantido não-nulo: só está em `concluidas` quando dataFimReal existe (ver atribuição abaixo).
        return resultadoPredecessora.dataFimReal!;
      });
      dataMinimaPorChaveStr.set(chaveStr, resolverDataMinimaBruta(oc.dataInicioJanela, dataFimPredecessoras));
    }

    prontas.sort((a, b) =>
      compararComDesempateTotal(
        chaveOcorrenciaParaString(a.chave),
        chaveOcorrenciaParaString(b.chave),
        prioridadePorChaveStr,
        dataMinimaPorChaveStr,
      ),
    );
    const proxima = prontas[0];
    const proximaChaveStr = chaveOcorrenciaParaString(proxima.chave);

    const dataInicioMinima = dataMinimaPorChaveStr.get(proximaChaveStr)!;
    const indiceInicio = datasGradeCompartilhada.findIndex((data) => data >= dataInicioMinima);
    const janela = indiceInicio === -1 ? [] : datasGradeCompartilhada.slice(indiceInicio);

    const candidatos = proxima.candidatoIdsPorPrioridade.map((id) => registroCandidatos.get(id)!);

    const resultadoAlocacao = alocarOperacaoDiaAdia({
      necessarioHorasPadrao: proxima.necessarioHorasPadrao,
      candidatosPorPrioridade: candidatos,
      datasOrdenadas: janela,
      projetoId: proxima.projetoId,
      ehOrcamentoNovo: proxima.ehOrcamentoNovo,
    });

    const datas = resultadoAlocacao.alocacoes.map((a) => a.data);
    const dataInicioReal = datas.length > 0 ? datas.reduce((min, d) => (d < min ? d : min)) : null;
    const dataFimReal = datas.length > 0 ? datas.reduce((max, d) => (d > max ? d : max)) : null;
    const concluida = resultadoAlocacao.deficitResidualHorasPadrao === 0 && dataFimReal !== null;

    resultados.set(proximaChaveStr, {
      chave: proxima.chave,
      status: concluida ? "concluida" : "bloqueada_por_deficit",
      dataInicioReal,
      dataFimReal,
      alocacoes: resultadoAlocacao.alocacoes,
      deficitResidualHorasPadrao: resultadoAlocacao.deficitResidualHorasPadrao,
    });
    if (concluida) concluidas.add(proximaChaveStr);
  }

  // Grafo já validado acíclico e íntegro em validarEntrada - toda
  // ocorrência que sobra aqui só pode ser por predecessora não concluída
  // (nunca mais um "ciclo_ou_erro_estrutural" residual).
  for (const chave of todasChaves) {
    const chaveStr = chaveOcorrenciaParaString(chave);
    if (!resultados.has(chaveStr)) {
      resultados.set(chaveStr, {
        chave,
        status: "bloqueada_por_predecessora",
        dataInicioReal: null,
        dataFimReal: null,
        alocacoes: [],
        deficitResidualHorasPadrao: porChaveStr.get(chaveStr)!.necessarioHorasPadrao,
      });
    }
  }

  return resultados;
}
