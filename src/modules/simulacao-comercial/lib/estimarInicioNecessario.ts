// Entrega 3 (Calculador Reverso / Data de Início Necessária) - Fase 1,
// núcleo puro, sem I/O. Reusa o MESMO Motor da Entrega 2
// (executarMotorAvaliacaoSequencial) e a MESMA fórmula de capacidade
// por janela (calcularCapacidadeParaJanela, prepararEntradasMotor.ts) -
// não existe um segundo algoritmo de distribuição diária. Este módulo
// só decide QUAL janela candidata testar (busca binária sobre a
// sequência de dias produtivos) e chama o núcleo já existente como
// função de viabilidade para cada candidata.
//
// A construção da sequência de dias produtivos (P) e a função de
// contagem com expansão de calendário (contarDiasProdutivosEntre) são
// injetadas por quem chama (Fase 2, ver ARQUITETURA_VIGENTE/PAD-008 §18-19
// quando essa fase for fechada) - este arquivo nunca importa
// SupabaseClient nem toca rede, para poder ser testado com fixtures
// puras, sem mock de banco.
import { executarMotorAvaliacaoSequencial, type ItemResultadoMotor } from "./motorAvaliacaoSequencial";
import { calcularCapacidadeParaJanela, type BaseFixaMotor } from "./prepararEntradasMotor";

/** Versão do método de cálculo - persistida junto do resultado (Fase 5,
 * futura) para que uma evolução do algoritmo não confunda a leitura de
 * snapshots antigos calculados por uma versão anterior. */
export const ESTIMATIVA_METODO_VERSAO = 1;

export interface AvaliacaoJanela {
  deficitTotal: number;
  resultadoPorOperacao: ItemResultadoMotor[];
}

export type CausaDadosInsuficientes =
  | {
      causa: "capacidade_cadastral_zero";
      operacaoAfetada: string;
      recursosAfetados: string[];
    }
  | {
      causa: "erro_de_dominio";
      origem: string;
      mensagem: string;
    };

export type ResultadoEstimativaInicioNecessario =
  | {
      estado: "viavel" | "viavel_no_limite";
      dataEstimadaInicioNecessario: string;
      /** Sinal: positivo = folga (viavel); 0 = exatamente no limite. */
      folgaDiasProdutivos: number;
      metodoVersao: number;
    }
  | {
      estado: "janela_insuficiente";
      /** D* - calculado de forma completamente independente do material, ANTES desta classificação. */
      dataEstimadaInicioNecessario: string;
      dataDisponibilidadeProducao: string;
      /** Sempre negativo neste estado - magnitude = dias produtivos de atraso. */
      folgaDiasProdutivos: number;
      /** Déficit se a produção fosse forçada a começar só quando o material chega (0 dias produtivos na janela quando o material chega depois do Prazo Interno). */
      avaliacaoNaJanelaRealmentePermitida: AvaliacaoJanela;
      metodoVersao: number;
    }
  | ({ estado: "dados_insuficientes" } & CausaDadosInsuficientes)
  | {
      estado: "horizonte_tecnico_excedido";
      diasCivisExaminados: number;
      avaliacaoNoLimiteTecnico: AvaliacaoJanela;
    };

/**
 * Bloqueia SOMENTE quando NENHUM candidato elegível de alguma operação
 * (nem o original, nem nenhum compatível) tem capacidade diária efetiva
 * positiva - um único candidato zerado (ex.: um compatível ainda sem
 * capacidade cadastrada) não bloqueia, desde que outro sirva.
 */
export function verificarCapacidadeCadastralSuficiente(
  baseFixa: BaseFixaMotor,
): CausaDadosInsuficientes | null {
  for (const operacao of baseFixa.operacoesOrdenadas) {
    const candidatos = [
      operacao.recursoOriginalId,
      ...(baseFixa.compatibilidades[operacao.recursoOriginalId] ?? []).map((c) => c.recursoId),
    ];

    const existeCandidatoUtilizavel = candidatos.some((recursoId) => {
      const capacidadeDiaria = baseFixa.capacidadeDiariaPorRecurso[recursoId] ?? 0;
      const produtividade = baseFixa.produtividadePorRecurso[recursoId] ?? 0;
      return capacidadeDiaria > 0 && produtividade > 0;
    });

    if (!existeCandidatoUtilizavel) {
      return {
        causa: "capacidade_cadastral_zero",
        operacaoAfetada: operacao.bomOperacaoId,
        recursosAfetados: candidatos,
      };
    }
  }

  return null;
}

/**
 * Avalia o déficit total do roteiro para uma quantidade de dias
 * produtivos - MESMA fórmula de capacidade do preview normal
 * (calcularCapacidadeParaJanela) e MESMO núcleo de distribuição
 * (executarMotorAvaliacaoSequencial), sem nenhuma cópia.
 */
export function avaliarPorDiasProdutivos(
  baseFixa: BaseFixaMotor,
  diasProdutivosJanela: number,
): AvaliacaoJanela {
  const { capacidadeDisponivelInicial } = calcularCapacidadeParaJanela(baseFixa, diasProdutivosJanela);

  const resultadoPorOperacao = executarMotorAvaliacaoSequencial({
    operacoesOrdenadas: baseFixa.operacoesOrdenadas,
    capacidadeDisponivelInicial,
    compatibilidades: baseFixa.compatibilidades,
  });

  const deficitTotal = resultadoPorOperacao.reduce((soma, item) => soma + item.deficit, 0);

  return { deficitTotal, resultadoPorOperacao };
}

/**
 * Busca binária pelo MAIOR índice `i` (0 <= i <= n-1) para o qual
 * `avaliarPorIndice(i)` tem déficit zero - monotônica por construção
 * (mais dias produtivos nunca piora o déficit, ver prova registrada na
 * proposta desta entrega). Retorna `null` se nenhum índice em [0, n-1]
 * for viável (horizonte técnico excedido).
 */
export function buscarMaiorIndiceViavel(
  n: number,
  avaliarPorIndice: (indice: number) => AvaliacaoJanela,
): number | null {
  let low = 0;
  let high = n - 1;
  let resultado: number | null = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);

    if (avaliarPorIndice(mid).deficitTotal === 0) {
      resultado = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return resultado;
}

/**
 * Localiza `data` dentro de `P` (sequência ordenada ascendente) por
 * busca binária. `dataDisponibilidadeProducao` é sempre um dia
 * produtivo real (garantido por deslocarDiasProdutivos, Entrega 1) -
 * se estiver dentro de [P[0], P[n-1]], está necessariamente em `P`.
 * Lança erro interno (não de domínio) se não encontrar - sinal de que
 * quem chamou passou uma janela de P menor do que o intervalo
 * realmente necessário, nunca uma condição de negócio.
 */
export function indiceEmP(P: readonly string[], data: string): number {
  let low = 0;
  let high = P.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (P[mid] === data) return mid;
    if (P[mid] < data) low = mid + 1;
    else high = mid - 1;
  }

  throw new Error(
    `indiceEmP: data ${data} não encontrada na sequência de dias produtivos fornecida - esperado que fosse um dia produtivo dentro do intervalo coberto por P.`,
  );
}

function diaCivilSeguinte(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const proximo = new Date(Date.UTC(ano, mes - 1, dia + 1));
  return proximo.toISOString().slice(0, 10);
}

/**
 * Distância produtiva com sinal entre a disponibilidade do material e
 * D* - regra ÚNICA para os três casos de contorno (material dentro do
 * horizonte, material depois do Prazo Interno, material antes do piso
 * técnico): sempre conta o intervalo INTEIRO entre as duas datas, nunca
 * só um pedaço dele.
 *
 * 0 = material disponível exatamente em D*.
 * positivo = material disponível ANTES de D* (folga).
 * negativo = material disponível DEPOIS de D* (insuficiência).
 *
 * `contarDiasProdutivosEntre(a, b)` conta dias produtivos no intervalo
 * fechado [a, b] (mesma convenção de contarDiasProdutivosNaJanela) -
 * implementação real, com expansão de calendário quando `a`/`b` caem
 * fora do contexto já carregado, é responsabilidade de quem injeta esta
 * função (Fase 2, prepararCalculadorReverso.ts). Assíncrona porque essa
 * expansão pode exigir uma consulta de rede - mas é chamada NO MÁXIMO
 * uma vez por execução (depois que D* já foi encontrado), nunca dentro
 * do laço da busca binária (ver calcularEstimativaInicioNecessario).
 */
export async function distanciaProdutivaComSinal(
  dataDisponibilidadeProducao: string,
  dEstrela: string,
  contarDiasProdutivosEntre: (dataInicioInclusive: string, dataFimInclusive: string) => Promise<number>,
): Promise<number> {
  if (dataDisponibilidadeProducao === dEstrela) return 0;

  if (dataDisponibilidadeProducao < dEstrela) {
    return contarDiasProdutivosEntre(diaCivilSeguinte(dataDisponibilidadeProducao), dEstrela);
  }

  return -(await contarDiasProdutivosEntre(diaCivilSeguinte(dEstrela), dataDisponibilidadeProducao));
}

/**
 * Núcleo completo: pré-checagem analítica -> busca binária de D*
 * (síncrona, em memória, sobre `P` já construída - nenhuma consulta ao
 * banco ocorre nesta etapa, porque `avaliarPorIndice`/
 * `buscarMaiorIndiceViavel` não recebem nem chamam
 * `contarDiasProdutivosEntre`) -> classificação contra a disponibilidade
 * do material (único ponto que pode ser assíncrono, no máximo 1 chamada,
 * já depois da busca ter terminado). `P` já deve cobrir
 * [floorDate, prazoInterno] por inteiro (construção de P e a
 * implementação real de `contarDiasProdutivosEntre` com expansão de
 * calendário são responsabilidade da Fase 2, prepararCalculadorReverso.ts).
 */
export async function calcularEstimativaInicioNecessario(
  baseFixa: BaseFixaMotor,
  P: readonly string[],
  prazoInterno: string,
  dataDisponibilidadeProducao: string,
  contarDiasProdutivosEntre: (dataInicioInclusive: string, dataFimInclusive: string) => Promise<number>,
  diasCivisExaminadosNoHorizonte: number,
): Promise<ResultadoEstimativaInicioNecessario> {
  const causaDadosInsuficientes = verificarCapacidadeCadastralSuficiente(baseFixa);
  if (causaDadosInsuficientes) {
    return { estado: "dados_insuficientes", ...causaDadosInsuficientes };
  }

  const n = P.length;
  const avaliarPorIndice = (indice: number) => avaliarPorDiasProdutivos(baseFixa, n - indice);

  // Síncrona - buscarMaiorIndiceViavel não recebe contarDiasProdutivosEntre,
  // portanto não tem como fazer nenhuma consulta de rede.
  const iEstrela = buscarMaiorIndiceViavel(n, avaliarPorIndice);

  if (iEstrela === null) {
    return {
      estado: "horizonte_tecnico_excedido",
      diasCivisExaminados: diasCivisExaminadosNoHorizonte,
      // n aqui é a maior contagem de dias produtivos que a busca
      // considerou (todo o P) - o índice 0 corresponde a essa janela máxima.
      avaliacaoNoLimiteTecnico: avaliarPorDiasProdutivos(baseFixa, n),
    };
  }

  const dEstrela = P[iEstrela];
  const folga = await distanciaProdutivaComSinal(dataDisponibilidadeProducao, dEstrela, contarDiasProdutivosEntre);

  if (folga > 0) {
    return {
      estado: "viavel",
      dataEstimadaInicioNecessario: dEstrela,
      folgaDiasProdutivos: folga,
      metodoVersao: ESTIMATIVA_METODO_VERSAO,
    };
  }

  if (folga === 0) {
    return {
      estado: "viavel_no_limite",
      dataEstimadaInicioNecessario: dEstrela,
      folgaDiasProdutivos: 0,
      metodoVersao: ESTIMATIVA_METODO_VERSAO,
    };
  }

  // folga < 0 - material chega depois de D*. A janela realmente
  // permitida é [dataDisponibilidadeProducao, prazoInterno] - vazia
  // (0 dias produtivos) quando o material chega depois do próprio
  // Prazo Interno; caso contrário, dataDisponibilidadeProducao está
  // garantidamente em P (é sempre um dia produtivo dentro do
  // intervalo, dado que folga < 0 implica dataDisponibilidadeProducao
  // > D* >= P[0] >= floorDate).
  const diasProdutivosJanelaPermitida =
    dataDisponibilidadeProducao > prazoInterno ? 0 : n - indiceEmP(P, dataDisponibilidadeProducao);

  return {
    estado: "janela_insuficiente",
    dataEstimadaInicioNecessario: dEstrela,
    dataDisponibilidadeProducao,
    folgaDiasProdutivos: folga,
    avaliacaoNaJanelaRealmentePermitida: avaliarPorDiasProdutivos(baseFixa, diasProdutivosJanelaPermitida),
    metodoVersao: ESTIMATIVA_METODO_VERSAO,
  };
}
