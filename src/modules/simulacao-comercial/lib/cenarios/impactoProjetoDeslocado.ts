// DEC-007 §9 - Fase 5: ImpactoProjetoDeslocado - resultado direto do diff
// entre duas rodadas completas do escalonador conjunto sobre a MESMA
// grade (programacaoBase × programacaoCenario, ambas já calculadas por
// fora com escalonarConjuntoComFilaDeProntos, Fase 2) - não uma estrutura
// recursiva de cascata (a computação simultânea sobre a mesma grade já
// resolve todos os projetos conectados de uma vez).
//
// dStarAnterior/dStarNovo NÃO são calculados aqui (decisão confirmada com
// o usuário): exigiriam rodar o Calculador Reverso conjunto completo
// (Fase 3) por projeto afetado, multiplicando buscas dentro deste diff -
// este módulo só REPASSA o que o chamador já tiver calculado por fora
// (opcional), mantendo o núcleo do diff leve e testável.
//
// "Estado nunca melhora ao perder capacidade" é uma propriedade
// verificada em TESTE sobre exemplos concretos (DEC-007 §9, tabela da
// Fase 5) - não uma checagem em runtime aqui. A Fase 3 já provou (via
// contraexemplo) que efeitos de cascata em grafos gerais podem, em
// princípio, produzir resultados contraintuitivos por caminhos indiretos;
// impor essa propriedade como invariante rígido em runtime arriscaria
// rejeitar um resultado legítimo. Este módulo relata o diff honestamente,
// sem presumir a direção do efeito.
import { chaveOcorrenciaParaString, type ChaveOcorrencia } from "./chaveOcorrencia";
import type { AlocacaoDiaria } from "./alocarOperacaoDiaAdia";
import type { OcorrenciaEscalonavel, ResultadoOcorrenciaEscalonada, StatusOcorrenciaEscalonada } from "./escalonadorConjunto";
import { EPSILON_HORAS, numerosIguais, tratarComoZero } from "../constantesNumericas";
import { validarDataIso } from "./validacoes";

export interface OperacaoAfetada {
  chave: ChaveOcorrencia;
  estadoAnterior: StatusOcorrenciaEscalonada;
  estadoPosterior: StatusOcorrenciaEscalonada;
}

export interface OrigemHorasRetiradas {
  recursoId: string;
  data: string;
  /** Sempre > 0 - só entradas com perda real de capacidade entram aqui. */
  horasRetiradas: number;
}

export interface MetadadosProjetoDeslocado {
  numeroProjeto: string;
  /** Vem de detalhar_comprometido_por_origem (LEFT JOIN ordens_producao/operacoes_producao) - I/O, fora desta fase pura; sempre informado pelo chamador. */
  producaoIniciada: boolean;
  prazoInterno?: string | null;
  /** Calculado por fora (Fase 3, buscarDataInicioMaisTardiaViavel), opcional - ver comentário do módulo. */
  dStarAnterior?: string | null;
  dStarNovo?: string | null;
}

export interface ImpactoProjetoDeslocado {
  projetoId: string;
  numeroProjeto: string;
  producaoIniciada: boolean;
  origens: OrigemHorasRetiradas[];
  operacoesAfetadas: OperacaoAfetada[];
  inicioProgramadoAnterior: string | null;
  inicioProgramadoNovo: string | null;
  terminoProgramadoAnterior: string | null;
  terminoProgramadoNovo: string | null;
  prazoInterno: string | null;
  dStarAnterior: string | null;
  dStarNovo: string | null;
  /** terminoProgramadoNovo - terminoProgramadoAnterior, em dias civis (positivo = atrasou); null se algum dos dois lados não tiver término real. */
  diasDeAtraso: number | null;
}

function diasCivisEntreDatas(dataInicio: string, dataFim: string): number {
  const [anoA, mesA, diaA] = dataInicio.split("-").map(Number);
  const [anoB, mesB, diaB] = dataFim.split("-").map(Number);
  const utcInicio = Date.UTC(anoA, mesA - 1, diaA);
  const utcFim = Date.UTC(anoB, mesB - 1, diaB);
  return Math.round((utcFim - utcInicio) / 86_400_000);
}

function chaveRecursoData(recursoId: string, data: string): string {
  return `${recursoId}::${data}`;
}

function somarHorasPorRecursoData(alocacoes: AlocacaoDiaria[]): Map<string, number> {
  const soma = new Map<string, number>();
  for (const alocacao of alocacoes) {
    const chave = chaveRecursoData(alocacao.recursoId, alocacao.data);
    soma.set(chave, (soma.get(chave) ?? 0) + alocacao.horasMaquina);
  }
  return soma;
}

/** Compara duas listas de alocação por conteúdo (posição a posição - ambas produzidas pelo mesmo algoritmo cronológico determinístico, alocarOperacaoDiaAdia). */
function alocacoesEquivalentes(a: AlocacaoDiaria[], b: AlocacaoDiaria[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.recursoId !== y.recursoId || x.data !== y.data || x.natureza !== y.natureza || x.contratacaoId !== y.contratacaoId) return false;
    if (!numerosIguais(x.horasMaquina, y.horasMaquina) || !numerosIguais(x.horasPadrao, y.horasPadrao)) return false;
  }
  return true;
}

/** Menor data entre as informadas, ou null se a lista estiver vazia. */
function menorData(datas: (string | null)[]): string | null {
  const validas = datas.filter((d): d is string => d !== null);
  return validas.length === 0 ? null : validas.reduce((menor, atual) => (atual < menor ? atual : menor));
}

/** Maior data entre as informadas, ou null se a lista estiver vazia. */
function maiorData(datas: (string | null)[]): string | null {
  const validas = datas.filter((d): d is string => d !== null);
  return validas.length === 0 ? null : validas.reduce((maior, atual) => (atual > maior ? atual : maior));
}

export function construirImpactosProjetosDeslocados(params: {
  /** MESMO template usado nas duas rodadas do escalonador - fornece projetoId por chave. */
  ocorrencias: OcorrenciaEscalonavel[];
  projetoIdOrcamentoNovo: string;
  resultadosBase: ReadonlyMap<string, ResultadoOcorrenciaEscalonada>;
  resultadosCenario: ReadonlyMap<string, ResultadoOcorrenciaEscalonada>;
  /** Metadados obrigatórios para todo projeto que acabar AFETADO - nunca presumidos (ver comentário do tipo). */
  metadadosPorProjetoId: ReadonlyMap<string, MetadadosProjetoDeslocado>;
}): ImpactoProjetoDeslocado[] {
  const { ocorrencias, projetoIdOrcamentoNovo, resultadosBase, resultadosCenario, metadadosPorProjetoId } = params;

  // resultadosBase e resultadosCenario NÃO têm o mesmo conjunto de chaves
  // por definição (DEC-007 §9): "programação-base" é só os projetos JÁ
  // COMPROMETIDOS (exclui o orçamento novo); "programação-cenário" é
  // esses mesmos projetos + o orçamento novo. Só as ocorrências de
  // projetos JÁ COMPROMETIDOS precisam existir nos DOIS - as do orçamento
  // novo só existem (e só importam) em resultadosCenario.
  const ocorrenciasPorProjetoId = new Map<string, OcorrenciaEscalonavel[]>();
  for (const oc of ocorrencias) {
    const chaveStr = chaveOcorrenciaParaString(oc.chave);
    if (!resultadosCenario.has(chaveStr)) {
      throw new RangeError(`Ocorrência "${chaveStr}" está em "ocorrencias" mas não tem resultado em resultadosCenario.`);
    }
    if (oc.projetoId === projetoIdOrcamentoNovo) continue; // impacto é sobre OUTROS projetos, nunca o próprio orçamento novo
    if (!resultadosBase.has(chaveStr)) {
      throw new RangeError(
        `Ocorrência "${chaveStr}" (projeto "${oc.projetoId}", já comprometido - não é o orçamento novo) não tem resultado em resultadosBase - ` +
          `toda ocorrência de projeto já comprometido precisa existir na programação-base.`,
      );
    }
    if (!ocorrenciasPorProjetoId.has(oc.projetoId)) ocorrenciasPorProjetoId.set(oc.projetoId, []);
    ocorrenciasPorProjetoId.get(oc.projetoId)!.push(oc);
  }

  // Defensivo: nem resultadosBase nem resultadosCenario podem conter uma
  // chave que não existe em "ocorrencias" - sinal de que os dois runs não
  // vieram do mesmo template/candidato.
  const chavesOcorrenciasStr = new Set(ocorrencias.map((oc) => chaveOcorrenciaParaString(oc.chave)));
  for (const chaveStr of resultadosBase.keys()) {
    if (!chavesOcorrenciasStr.has(chaveStr)) {
      throw new RangeError(`resultadosBase contém a chave "${chaveStr}", que não existe em "ocorrencias".`);
    }
  }
  for (const chaveStr of resultadosCenario.keys()) {
    if (!chavesOcorrenciasStr.has(chaveStr)) {
      throw new RangeError(`resultadosCenario contém a chave "${chaveStr}", que não existe em "ocorrencias".`);
    }
  }

  // Defensivo (a checagem acima só garante "existe em ocorrencias" - não
  // basta, porque as chaves do PRÓPRIO orçamento novo também existem em
  // ocorrencias): resultadosBase nunca pode conter uma chave do orçamento
  // novo - "programação-base" é por definição só os projetos JÁ
  // COMPROMETIDOS (ver comentário acima); se o chamador passar um run que
  // incluiu o orçamento novo por engano na base, isso invalidaria todo o
  // diff (base deixaria de representar "antes da troca de prioridade").
  const chavesOrcamentoNovoStr = new Set(
    ocorrencias.filter((oc) => oc.projetoId === projetoIdOrcamentoNovo).map((oc) => chaveOcorrenciaParaString(oc.chave)),
  );
  for (const chaveStr of resultadosBase.keys()) {
    if (chavesOrcamentoNovoStr.has(chaveStr)) {
      throw new RangeError(
        `resultadosBase contém a chave "${chaveStr}", que pertence ao orçamento novo ("${projetoIdOrcamentoNovo}") - ` +
          `programação-base nunca pode incluir o orçamento novo, só projetos já comprometidos.`,
      );
    }
  }

  const impactos: ImpactoProjetoDeslocado[] = [];

  for (const [projetoId, ocorrenciasDoProjeto] of ocorrenciasPorProjetoId) {
    const operacoesAfetadas: OperacaoAfetada[] = [];

    const iniciosBase: (string | null)[] = [];
    const iniciosCenario: (string | null)[] = [];
    const fimsBase: (string | null)[] = [];
    const fimsCenario: (string | null)[] = [];
    let todasConcluidasBase = true;
    let todasConcluidasCenario = true;

    // Horas TOTAIS do projeto por (recurso, data) - agregadas de TODAS as
    // ocorrências ANTES de calcular a retirada (correção: se a operação X
    // perde 4h e a operação Y do MESMO projeto ganha 4h no mesmo
    // recurso/data, o projeto não perdeu capacidade líquida ali - somar
    // diffs POR OCORRÊNCIA, como a versão anterior fazia, reportaria 4h
    // retiradas por engano, ignorando a compensação interna).
    const horasBaseTotalPorRecursoData = new Map<string, number>();
    const horasCenarioTotalPorRecursoData = new Map<string, number>();

    for (const oc of ocorrenciasDoProjeto) {
      const chaveStr = chaveOcorrenciaParaString(oc.chave);
      const resultadoBase = resultadosBase.get(chaveStr)!;
      const resultadoCenario = resultadosCenario.get(chaveStr)!;

      iniciosBase.push(resultadoBase.dataInicioReal);
      iniciosCenario.push(resultadoCenario.dataInicioReal);
      fimsBase.push(resultadoBase.dataFimReal);
      fimsCenario.push(resultadoCenario.dataFimReal);
      if (resultadoBase.status !== "concluida") todasConcluidasBase = false;
      if (resultadoCenario.status !== "concluida") todasConcluidasCenario = false;

      const mudouStatus = resultadoBase.status !== resultadoCenario.status;
      const mudouInicio = resultadoBase.dataInicioReal !== resultadoCenario.dataInicioReal;
      const mudouFim = resultadoBase.dataFimReal !== resultadoCenario.dataFimReal;
      const mudouAlocacoes = !alocacoesEquivalentes(resultadoBase.alocacoes, resultadoCenario.alocacoes);
      if (mudouStatus || mudouInicio || mudouFim || mudouAlocacoes) {
        operacoesAfetadas.push({ chave: oc.chave, estadoAnterior: resultadoBase.status, estadoPosterior: resultadoCenario.status });
      }

      for (const [chaveRD, horas] of somarHorasPorRecursoData(resultadoBase.alocacoes)) {
        horasBaseTotalPorRecursoData.set(chaveRD, (horasBaseTotalPorRecursoData.get(chaveRD) ?? 0) + horas);
      }
      for (const [chaveRD, horas] of somarHorasPorRecursoData(resultadoCenario.alocacoes)) {
        horasCenarioTotalPorRecursoData.set(chaveRD, (horasCenarioTotalPorRecursoData.get(chaveRD) ?? 0) + horas);
      }
    }

    const todasChavesRD = new Set([...horasBaseTotalPorRecursoData.keys(), ...horasCenarioTotalPorRecursoData.keys()]);
    const origens: OrigemHorasRetiradas[] = [];
    for (const chaveRD of todasChavesRD) {
      const totalBase = horasBaseTotalPorRecursoData.get(chaveRD) ?? 0;
      const totalCenario = horasCenarioTotalPorRecursoData.get(chaveRD) ?? 0;
      const retirada = totalBase - totalCenario;
      if (!tratarComoZero(retirada) && retirada > EPSILON_HORAS) {
        const [recursoId, data] = chaveRD.split("::");
        origens.push({ recursoId, data, horasRetiradas: retirada });
      }
    }

    if (operacoesAfetadas.length === 0 && origens.length === 0) continue; // projeto não afetado - não entra na lista

    const metadados = metadadosPorProjetoId.get(projetoId);
    if (!metadados) {
      throw new RangeError(`Projeto "${projetoId}" foi afetado pela troca de prioridade mas não tem entrada em metadadosPorProjetoId.`);
    }
    if (metadados.prazoInterno) validarDataIso(metadados.prazoInterno, `metadadosPorProjetoId["${projetoId}"].prazoInterno`);
    if (metadados.dStarAnterior) validarDataIso(metadados.dStarAnterior, `metadadosPorProjetoId["${projetoId}"].dStarAnterior`);
    if (metadados.dStarNovo) validarDataIso(metadados.dStarNovo, `metadadosPorProjetoId["${projetoId}"].dStarNovo`);

    // Término programado só é uma data REAL quando TODAS as ocorrências do
    // projeto estão concluídas nesse run - dataFimReal de uma ocorrência
    // bloqueada é só "até onde chegou" (invariante de ResultadoOcorrenciaEscalonada),
    // nunca um término real; tratar como término produziria uma data
    // programada enganosa (mesma falha já corrigida em compararProgramacoes.ts, Fase 2).
    const terminoProgramadoAnterior = todasConcluidasBase ? maiorData(fimsBase) : null;
    const terminoProgramadoNovo = todasConcluidasCenario ? maiorData(fimsCenario) : null;

    impactos.push({
      projetoId,
      numeroProjeto: metadados.numeroProjeto,
      producaoIniciada: metadados.producaoIniciada,
      origens,
      operacoesAfetadas,
      inicioProgramadoAnterior: menorData(iniciosBase),
      inicioProgramadoNovo: menorData(iniciosCenario),
      terminoProgramadoAnterior,
      terminoProgramadoNovo,
      prazoInterno: metadados.prazoInterno ?? null,
      dStarAnterior: metadados.dStarAnterior ?? null,
      dStarNovo: metadados.dStarNovo ?? null,
      diasDeAtraso:
        terminoProgramadoAnterior !== null && terminoProgramadoNovo !== null
          ? diasCivisEntreDatas(terminoProgramadoAnterior, terminoProgramadoNovo)
          : null,
    });
  }

  impactos.sort((a, b) => (a.projetoId < b.projetoId ? -1 : a.projetoId > b.projetoId ? 1 : 0));

  return impactos;
}
