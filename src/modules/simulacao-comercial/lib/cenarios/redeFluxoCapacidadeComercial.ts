// DEC-007 - previsão comercial por capacidade: distribuição conjunta
// EXATA via rede de fluxo, substituindo a heurística "menos alternativas
// primeiro" que vivia em avaliarPrevisaoComercialFlexivel.ts.
// PROVADAMENTE não-ótima por 2 contraexemplos confirmados (fast-check,
// ver avaliarPrevisaoComercialFlexivel.exato.test.ts): contar
// alternativas nominalmente ignora tanto recursos "mortos" (capacidade
// zero) quanto a margem real de cada alternativa e a urgência de outras
// OPs concorrendo pelo mesmo recurso escasso - em ambos os casos, a
// heurística antiga podia entregar 1 dia depois do possível.
//
// Algoritmo em 2 fases, NUNCA misturadas:
//
// FASE 1 - menor data de entrega (D*): busca binária sobre datasGrade
// (viabilidade é monotônica - mais dias só acrescenta oferta, nunca
// remove). Para cada D candidato, max-flow (fluxoComCustoBinario com
// custo sempre 0) na subrede restrita a dias <= D, usando TODOS os tiers
// de uma vez (original + compatíveis + adicional + temporário) - a
// preferência de negócio NUNCA entra nesta fase, só capacidade real. D*
// é o menor D em que o fluxo máximo bate a demanda total. Isso é o que
// impede a preferência pelo original de "vencer" às custas de uma data
// pior.
//
// FASE 2 - distribuição preferencial dentro de D*: cascata sequencial de
// min-cost-flow, 1 estágio por nível de preferência (normal do
// original; normal dos compatíveis, 1 estágio por posição de prioridade
// cadastrada; adicional do original; adicional dos compatíveis, 1
// estágio por posição; temporário vinculado ao original, 1 estágio por
// posição; demais temporários, 1 estágio por posição). Cada estágio usa
// custo 0 para suas próprias arestas e custo 1 para as de TODOS os
// estágios ainda não processados - minimizar custo com fluxo fixo
// equivale a MAXIMIZAR o uso do estágio atual SEM reduzir o fluxo total
// alcançável (resultado padrão de fluxo de custo mínimo). É essa
// propriedade que resolve corretamente o caso adversarial "OP sem
// alternativa nenhuma vs. OP com alternativa de sobra": o algoritmo não
// decide estágio a estágio de forma gulosa e cega - ele já enxerga,
// através da rede (inclusive arestas REVERSAS, que permitem desfazer uma
// atribuição e reencaminhar por outro lugar), se sacrificar uma OP mais
// restrita para dar passagem a uma menos restrita compromete a
// viabilidade geral, e nunca faz essa troca.
//
// Cada estágio roda um passo EXPLORATÓRIO (descartável, só para
// descobrir QUANTO pode ser roteado pelo estágio atual sem reduzir o
// fluxo total - chamado F_k) seguido de um passo de COMMIT real
// (restrito só às arestas do estágio atual, limitado a F_k) - nunca
// comprometemos de verdade nada que o passo exploratório só usou como
// "válvula de escape" através de estágios futuros.
import { horasMaquinaParaHorasPadrao, horasPadraoParaHorasMaquina } from "./unidades";
import { EPSILON_HORAS, tratarComoZero } from "../constantesNumericas";
import { projetoElegivelParaExtra } from "./capacidadeDia";
import { validarNecessidade } from "./distribuirNecessidadeFlexivel";
import type { CandidatoComCapacidadeDiaria, NaturezaCapacidade } from "./alocarOperacaoDiaAdia";
import type {
  AlocacaoNecessidadeFlexivel,
  NecessidadeCapacidadeFlexivel,
  ResultadoDistribuicaoFlexivel,
  TipoCapacidadeFlexivel,
} from "./necessidadeCapacidadeFlexivel";

/**
 * Ticks por hora-padrão - toda quantidade de horas trafega internamente
 * como inteiro nesta escala, nunca como float direto (evita comparações
 * de ponto flutuante sensíveis dentro do algoritmo de fluxo, que depende
 * de "capacidade residual == 0" ser exato). 1/RESOLUCAO_TICKS fica 1
 * ordem de grandeza abaixo de EPSILON_HORAS (constantesNumericas.ts) - o
 * erro de arredondamento do tick nunca é maior que a tolerância já
 * aceita no resto do motor.
 */
const RESOLUCAO_TICKS = 10_000_000;
if (1 / RESOLUCAO_TICKS >= EPSILON_HORAS) {
  throw new Error("RESOLUCAO_TICKS não é fina o bastante frente a EPSILON_HORAS - invariante de arredondamento quebrada.");
}

/** Nunca disponibiliza mais capacidade do que existe de verdade (arredonda para baixo) - pequeno nudge contra erro de representação de ponto flutuante (ex.: 0.1*1e7 pode computar como 999999.9999999999). */
function horasParaTicksFloor(horas: number): number {
  return Math.floor(horas * RESOLUCAO_TICKS + 1e-6);
}

/** Nunca sub-representa uma necessidade real (arredonda para cima) - mesmo nudge contra erro de representação, na direção oposta. */
function horasParaTicksCeil(horas: number): number {
  return Math.ceil(horas * RESOLUCAO_TICKS - 1e-6);
}

function ticksParaHoras(ticks: number): number {
  return ticks / RESOLUCAO_TICKS;
}

// --- Grafo de fluxo com custo (Successive Shortest Paths via SPFA) ---

interface ArestaFluxo {
  paraNo: number;
  capacidadeResidual: number;
  custo: number;
  indiceReversa: number;
}

/**
 * Nós criados sob demanda (criarNo) - evita precisar saber o total de
 * DayNodes de antemão (eles só são descobertos ao varrer a "receita" de
 * preferência contra os dias efetivamente elegíveis).
 */
class GrafoFluxo {
  private readonly adjacencia: ArestaFluxo[][] = [];

  criarNo(): number {
    this.adjacencia.push([]);
    return this.adjacencia.length - 1;
  }

  get numNos(): number {
    return this.adjacencia.length;
  }

  arestasDe(no: number): ArestaFluxo[] {
    return this.adjacencia[no];
  }

  /** Devolve o índice da aresta direta dentro de arestasDe(de) - identificador estável para reconsultar/mutar capacidade depois. */
  adicionarAresta(de: number, para: number, capacidade: number, custo = 0): number {
    const indiceDireta = this.adjacencia[de].length;
    const indiceReversa = this.adjacencia[para].length;
    this.adjacencia[de].push({ paraNo: para, capacidadeResidual: capacidade, custo, indiceReversa });
    this.adjacencia[para].push({ paraNo: de, capacidadeResidual: 0, custo: -custo, indiceReversa: indiceDireta });
    return indiceDireta;
  }

  /** Snapshot raso só dos números de capacidade residual (não clona a topologia) - usado para descartar um passo exploratório sem reconstruir o grafo inteiro. */
  snapshotCapacidades(): number[][] {
    return this.adjacencia.map((arestas) => arestas.map((a) => a.capacidadeResidual));
  }

  restaurarCapacidades(snapshot: number[][]): void {
    for (let no = 0; no < this.adjacencia.length; no++) {
      const arestas = this.adjacencia[no];
      for (let i = 0; i < arestas.length; i++) arestas[i].capacidadeResidual = snapshot[no][i];
    }
  }
}

/**
 * SPFA (Bellman-Ford com fila) - nunca 0-1 BFS nem Dijkstra puro: as
 * arestas REVERSAS de uma aresta de custo 1 têm custo -1, e uma busca
 * que ignora peso negativo (0-1 BFS, Dijkstra) encontraria caminhos
 * incorretos assim que uma aresta reversa entrasse em jogo (o que
 * acontece sempre que o algoritmo precisa desfazer uma atribuição de um
 * estágio anterior para rotear melhor por outro caminho - é exatamente
 * essa capacidade de "desfazer e reencaminhar" que resolve o caso
 * adversarial de uma OP sem alternativa perder para outra com
 * alternativa de sobra). SPFA tolera peso negativo desde que não haja
 * ciclo negativo - garantido aqui pela própria construção de Successive
 * Shortest Paths (nunca aumenta por um caminho que não seja o mais curto
 * disponível no momento, invariante padrão de fluxo de custo mínimo).
 */
function encontrarCaminhoMaisCurto(
  grafo: GrafoFluxo,
  origem: number,
  destino: number,
): { predNo: number[]; predIndiceAresta: number[] } | null {
  const numNos = grafo.numNos;
  const dist = new Array<number>(numNos).fill(Infinity);
  const predNo = new Array<number>(numNos).fill(-1);
  const predIndiceAresta = new Array<number>(numNos).fill(-1);
  const naFila = new Array<boolean>(numNos).fill(false);

  dist[origem] = 0;
  const fila: number[] = [origem];
  naFila[origem] = true;
  let cabeca = 0;

  while (cabeca < fila.length) {
    const u = fila[cabeca++];
    naFila[u] = false;
    const arestasU = grafo.arestasDe(u);
    for (let i = 0; i < arestasU.length; i++) {
      const aresta = arestasU[i];
      if (aresta.capacidadeResidual <= 0) continue;
      const novaDist = dist[u] + aresta.custo;
      if (novaDist < dist[aresta.paraNo]) {
        dist[aresta.paraNo] = novaDist;
        predNo[aresta.paraNo] = u;
        predIndiceAresta[aresta.paraNo] = i;
        if (!naFila[aresta.paraNo]) {
          fila.push(aresta.paraNo);
          naFila[aresta.paraNo] = true;
        }
      }
    }
  }

  return dist[destino] === Infinity ? null : { predNo, predIndiceAresta };
}

/**
 * Successive Shortest Paths: repete "acha o caminho mais curto (por
 * custo), empurra o GARGALO inteiro" até não haver mais caminho ou até
 * atingir `alvo`. Empurrar o gargalo inteiro (nunca 1 unidade por vez) é
 * o que mantém o número de iterações limitado ao número de arestas, não
 * ao valor do fluxo (que em ticks pode ser muito maior). Sem `alvo`,
 * esgota até o fluxo máximo verdadeiro da rede (equivalente a um
 * max-flow por caminhos aumentantes quando todos os custos são 0).
 */
function fluxoComCustoBinario(grafo: GrafoFluxo, origem: number, destino: number, alvo: number = Infinity): number {
  let fluxoTotal = 0;
  while (fluxoTotal < alvo) {
    const resultado = encontrarCaminhoMaisCurto(grafo, origem, destino);
    if (!resultado) break;
    const { predNo, predIndiceAresta } = resultado;

    let gargalo = alvo - fluxoTotal;
    let atual = destino;
    while (atual !== origem) {
      const u = predNo[atual];
      const aresta = grafo.arestasDe(u)[predIndiceAresta[atual]];
      if (aresta.capacidadeResidual < gargalo) gargalo = aresta.capacidadeResidual;
      atual = u;
    }

    atual = destino;
    while (atual !== origem) {
      const u = predNo[atual];
      const aresta = grafo.arestasDe(u)[predIndiceAresta[atual]];
      aresta.capacidadeResidual -= gargalo;
      grafo.arestasDe(atual)[aresta.indiceReversa].capacidadeResidual += gargalo;
      atual = u;
    }
    fluxoTotal += gargalo;
  }
  return fluxoTotal;
}

/**
 * Dinic - max-flow SEM custo, usado só na Fase 1 (viabilidade/menor
 * data, que nunca olha preferência de negócio). Nenhum valor de fluxo
 * máximo é ambíguo entre algoritmos diferentes (é um invariante
 * matemático do problema, não uma escolha de implementação) - trocar
 * `fluxoComCustoBinario` por Dinic aqui não pode mudar NENHUMA saída
 * observável do motor, só a velocidade de chegar lá. Medido como o
 * gargalo real (profile: Fase 1 sozinha, cost-agnostic, consumia ~77%
 * do tempo total do cenário grande via SPFA chamado milhares de vezes -
 * 1 caminho aumentante por chamada). Dinic acha TODOS os caminhos de um
 * mesmo "nível" numa única passagem (blocking flow), reduzindo de
 * O(arestas) chamadas de busca para O(nós) fases de BFS+DFS. A DFS aqui
 * é segura contra estouro de pilha mesmo em grafos grandes: o grafo
 * desta rede é estruturalmente raso (S -> OP -> DayNode -> T, no máximo
 * uns poucos saltos extras via arestas reversas de troca) - a
 * profundidade de recursão nunca escala com o número de nós/arestas.
 */
function maxFlowDinic(grafo: GrafoFluxo, origem: number, destino: number): number {
  const numNos = grafo.numNos;
  let fluxoTotal = 0;

  function bfsNiveis(): Int32Array | null {
    const nivel = new Int32Array(numNos).fill(-1);
    nivel[origem] = 0;
    const fila = new Array<number>(numNos);
    let cabeca = 0;
    let cauda = 0;
    fila[cauda++] = origem;
    while (cabeca < cauda) {
      const u = fila[cabeca++];
      const arestasU = grafo.arestasDe(u);
      for (let i = 0; i < arestasU.length; i++) {
        const aresta = arestasU[i];
        if (aresta.capacidadeResidual > 0 && nivel[aresta.paraNo] === -1) {
          nivel[aresta.paraNo] = nivel[u] + 1;
          fila[cauda++] = aresta.paraNo;
        }
      }
    }
    return nivel[destino] === -1 ? null : nivel;
  }

  function dfsBlocking(u: number, fluxoMax: number, nivel: Int32Array, proximaAresta: Int32Array): number {
    if (u === destino) return fluxoMax;
    const arestasU = grafo.arestasDe(u);
    for (; proximaAresta[u] < arestasU.length; proximaAresta[u]++) {
      const aresta = arestasU[proximaAresta[u]];
      if (aresta.capacidadeResidual > 0 && nivel[aresta.paraNo] === nivel[u] + 1) {
        const fluxo = dfsBlocking(aresta.paraNo, Math.min(fluxoMax, aresta.capacidadeResidual), nivel, proximaAresta);
        if (fluxo > 0) {
          aresta.capacidadeResidual -= fluxo;
          grafo.arestasDe(aresta.paraNo)[aresta.indiceReversa].capacidadeResidual += fluxo;
          return fluxo;
        }
      }
    }
    return 0;
  }

  while (true) {
    const nivel = bfsNiveis();
    if (!nivel) break;
    const proximaAresta = new Int32Array(numNos);
    let fluxo: number;
    while ((fluxo = dfsBlocking(origem, Infinity, nivel, proximaAresta)) > 0) {
      fluxoTotal += fluxo;
    }
  }
  return fluxoTotal;
}

// --- Receita de preferência (grupos/estágios da cascata) ---

type CategoriaOpcao = "normal" | "adicional" | "temporario";

interface ItemReceita {
  necessidadeIndex: number;
  candidatoId: string;
  categoria: CategoriaOpcao;
  grupoOrdem: number;
}

/**
 * Grupos, em ordem de preferência de negócio (nunca a ordem de chegada
 * no array de necessidades - a chave de todo este redesenho):
 *   0                              normal do original
 *   1..C                           normal dos compatíveis, 1 estágio por posição cadastrada (C = maior nº de compatíveis entre todas as necessidades)
 *   C+1                            adicional do original
 *   C+2..2C+1                      adicional dos compatíveis, 1 estágio por posição cadastrada
 *   2C+2..2C+1+M                   temporário VINCULADO ao original (recursoReferenciaId == recursoOriginalId), 1 estágio por posição cadastrada (M = nº de temporários)
 *   2C+2+M..2C+1+2M                demais temporários, 1 estágio por posição cadastrada
 * Cada posição cadastrada vira seu PRÓPRIO estágio (não um tier pooled)
 * porque é assim que o resto do motor já trata prioridade cadastrada em
 * qualquer lista (alocarOperacaoDiaAdia processa candidatosPorPrioridade
 * em ordem, esgotando um antes do próximo) - generalizar para a versão
 * exata preservando essa mesma granularidade fina, em vez de agrupar
 * tudo "compatíveis" num heurístico só, é o que a auditoria confirmou
 * como comportamento a preservar.
 */
function construirReceitaDePreferencia(params: {
  necessidades: readonly NecessidadeCapacidadeFlexivel[];
  temporariosOrdenados: readonly { candidatoId: string }[];
  recursoReferenciaPorTemporario: ReadonlyMap<string, string>;
}): ItemReceita[] {
  const { necessidades, temporariosOrdenados, recursoReferenciaPorTemporario } = params;
  const maxCompatLen = Math.max(0, ...necessidades.map((n) => n.recursosCompativeisPorPrioridade.length));
  const numTemporarios = temporariosOrdenados.length;

  const grupoNormalOriginal = 0;
  const grupoNormalCompativel = (rank: number) => 1 + rank;
  const grupoAdicionalOriginal = 1 + maxCompatLen;
  const grupoAdicionalCompativel = (rank: number) => 1 + maxCompatLen + 1 + rank;
  const grupoTemporarioVinculado = (rank: number) => 2 * maxCompatLen + 2 + rank;
  const grupoTemporarioGeral = (rank: number) => 2 * maxCompatLen + 2 + numTemporarios + rank;

  const receita: ItemReceita[] = [];
  necessidades.forEach((necessidade, necessidadeIndex) => {
    receita.push({ necessidadeIndex, candidatoId: necessidade.recursoOriginalId, categoria: "normal", grupoOrdem: grupoNormalOriginal });
    receita.push({ necessidadeIndex, candidatoId: necessidade.recursoOriginalId, categoria: "adicional", grupoOrdem: grupoAdicionalOriginal });

    necessidade.recursosCompativeisPorPrioridade.forEach((compativelId, rank) => {
      receita.push({ necessidadeIndex, candidatoId: compativelId, categoria: "normal", grupoOrdem: grupoNormalCompativel(rank) });
      receita.push({ necessidadeIndex, candidatoId: compativelId, categoria: "adicional", grupoOrdem: grupoAdicionalCompativel(rank) });
    });

    temporariosOrdenados.forEach((temporario, rank) => {
      const vinculado = recursoReferenciaPorTemporario.get(temporario.candidatoId) === necessidade.recursoOriginalId;
      receita.push({
        necessidadeIndex,
        candidatoId: temporario.candidatoId,
        categoria: "temporario",
        grupoOrdem: vinculado ? grupoTemporarioVinculado(rank) : grupoTemporarioGeral(rank),
      });
    });
  });
  return receita;
}

// --- Construção do grafo a partir da receita ---

interface ArestaOpParaDia {
  deNo: number;
  indiceAresta: number;
  necessidadeIndex: number;
  candidatoId: string;
  categoria: CategoriaOpcao;
  natureza: NaturezaCapacidade;
  data: string;
  grupoOrdem: number;
  produtividade: number;
  contratacaoId: string | null;
}

interface GrafoConstruido {
  grafo: GrafoFluxo;
  S: number;
  T: number;
  opNodeIds: number[];
  arestasOpParaDia: ArestaOpParaDia[];
}

/**
 * Constrói o grafo do zero a cada chamada (nunca reaproveita um grafo
 * mutado de uma tentativa anterior) - a Fase 1 chama isto 1 vez por
 * tentativa da busca binária, com `diasLimite` diferente a cada vez;
 * reconstruir do zero é barato (nenhuma consulta é I/O) e evita
 * qualquer risco de contaminação de estado entre tentativas.
 */
function construirGrafo(params: {
  necessidades: readonly NecessidadeCapacidadeFlexivel[];
  receita: readonly ItemReceita[];
  candidatosPorId: ReadonlyMap<string, CandidatoComCapacidadeDiaria>;
  contratacaoIdPorTemporario: ReadonlyMap<string, string>;
  datasGrade: readonly string[];
  diasLimite: string | null;
}): GrafoConstruido {
  const { necessidades, receita, candidatosPorId, contratacaoIdPorTemporario, datasGrade, diasLimite } = params;

  const grafo = new GrafoFluxo();
  const S = grafo.criarNo();
  const T = grafo.criarNo();
  const opNodeIds = necessidades.map(() => grafo.criarNo());

  necessidades.forEach((necessidade, indice) => {
    grafo.adicionarAresta(S, opNodeIds[indice], horasParaTicksCeil(necessidade.horasNecessariasPadrao), 0);
  });

  const dayNodeIdPorChave = new Map<string, number>();

  function obterOuCriarDayNode(candidatoId: string, natureza: NaturezaCapacidade, data: string, horasDisponiveisMaquina: number, produtividade: number): number {
    const chave = `${candidatoId}::${natureza}::${data}`;
    const existente = dayNodeIdPorChave.get(chave);
    if (existente !== undefined) return existente;

    const id = grafo.criarNo();
    dayNodeIdPorChave.set(chave, id);
    const horasDisponiveisPadrao = horasMaquinaParaHorasPadrao(horasDisponiveisMaquina, produtividade);
    const capacidadeTicks = diasLimite !== null && data > diasLimite ? 0 : horasParaTicksFloor(horasDisponiveisPadrao);
    grafo.adicionarAresta(id, T, capacidadeTicks, 0);
    return id;
  }

  const arestasOpParaDia: ArestaOpParaDia[] = [];

  for (const item of receita) {
    const necessidade = necessidades[item.necessidadeIndex];
    const candidato = candidatosPorId.get(item.candidatoId);
    if (!candidato) continue; // validado a montante (resolverDistribuicaoConjunta) - defensivo aqui, nunca deveria disparar.

    const diasElegiveis = datasGrade.filter((d) => d >= necessidade.disponivelAPartirDe);
    const capacidadeArestaTicks = horasParaTicksCeil(necessidade.horasNecessariasPadrao);

    for (const data of diasElegiveis) {
      for (const faixa of candidato.faixasDoDia(data)) {
        if (faixa.horasDisponiveis <= 0) continue;

        if (item.categoria === "normal" && faixa.natureza !== "normal") continue;
        if (item.categoria === "adicional") {
          if (faixa.natureza === "normal") continue;
          if (!faixa.elegibilidade || !projetoElegivelParaExtra(faixa.elegibilidade, necessidade.projetoId, true)) continue;
        }
        // categoria "temporario": aceita a faixa como está - recurso temporário só devolve natureza "normal" (ver criarCandidatoRecursoTemporario).

        const dayNodeId = obterOuCriarDayNode(item.candidatoId, faixa.natureza, data, faixa.horasDisponiveis, candidato.produtividade);
        const indiceAresta = grafo.adicionarAresta(opNodeIds[item.necessidadeIndex], dayNodeId, capacidadeArestaTicks, 0);

        arestasOpParaDia.push({
          deNo: opNodeIds[item.necessidadeIndex],
          indiceAresta,
          necessidadeIndex: item.necessidadeIndex,
          candidatoId: item.candidatoId,
          categoria: item.categoria,
          natureza: faixa.natureza,
          data,
          grupoOrdem: item.grupoOrdem,
          produtividade: candidato.produtividade,
          contratacaoId: item.categoria === "temporario" ? (contratacaoIdPorTemporario.get(item.candidatoId) ?? null) : faixa.contratacaoId,
        });
      }
    }
  }

  return { grafo, S, T, opNodeIds, arestasOpParaDia };
}

// --- Fase 1: menor data de entrega viável ---

function encontrarMenorDataViavel(params: {
  necessidades: readonly NecessidadeCapacidadeFlexivel[];
  receita: readonly ItemReceita[];
  candidatosPorId: ReadonlyMap<string, CandidatoComCapacidadeDiaria>;
  contratacaoIdPorTemporario: ReadonlyMap<string, string>;
  datasGrade: readonly string[];
}): { dataLimite: string | null } {
  const { necessidades, receita, candidatosPorId, contratacaoIdPorTemporario, datasGrade } = params;
  if (datasGrade.length === 0) return { dataLimite: null };

  const demandaTotalTicks = necessidades.reduce((soma, n) => soma + horasParaTicksCeil(n.horasNecessariasPadrao), 0);

  function viavelAte(dataLimite: string): boolean {
    const { grafo, S, T } = construirGrafo({ necessidades, receita, candidatosPorId, contratacaoIdPorTemporario, datasGrade, diasLimite: dataLimite });
    return maxFlowDinic(grafo, S, T) >= demandaTotalTicks;
  }

  if (!viavelAte(datasGrade[datasGrade.length - 1])) return { dataLimite: null };

  let baixo = 0;
  let alto = datasGrade.length - 1;
  while (baixo < alto) {
    const meio = Math.floor((baixo + alto) / 2);
    if (viavelAte(datasGrade[meio])) alto = meio;
    else baixo = meio + 1;
  }
  return { dataLimite: datasGrade[baixo] };
}

/**
 * Aplica `quantidade` unidades de fluxo ao longo do caminho fixo
 * S -> OP -> DayNode -> T de uma aresta específica (e suas 3 reversas) -
 * usado para COMMITAR, à mão, uma atribuição já decidida (nunca para
 * descobrir uma nova por conta própria). Depende de 2 invariantes de
 * construirGrafo: a aresta S->OP_i é sempre a i-ésima aresta de S (na
 * ordem de `necessidades`), e a aresta DayNode->T é sempre a aresta de
 * índice 0 de cada DayNode (criada antes de qualquer aresta OP->DayNode
 * apontar pra ele).
 */
function aplicarFluxoAoLongoDoCaminho(grafo: GrafoFluxo, S: number, T: number, aresta: ArestaOpParaDia, quantidade: number): void {
  if (quantidade <= 0) return;

  const arestaSOp = grafo.arestasDe(S)[aresta.necessidadeIndex];
  arestaSOp.capacidadeResidual -= quantidade;
  grafo.arestasDe(aresta.deNo)[arestaSOp.indiceReversa].capacidadeResidual += quantidade;

  const arestaOpDia = grafo.arestasDe(aresta.deNo)[aresta.indiceAresta];
  arestaOpDia.capacidadeResidual -= quantidade;
  const dayNode = arestaOpDia.paraNo;
  grafo.arestasDe(dayNode)[arestaOpDia.indiceReversa].capacidadeResidual += quantidade;

  const arestaDiaT = grafo.arestasDe(dayNode)[0];
  arestaDiaT.capacidadeResidual -= quantidade;
  grafo.arestasDe(T)[arestaDiaT.indiceReversa].capacidadeResidual += quantidade;
}

// --- Fase 2: cascata de distribuição preferencial dentro de D* ---

function resolverCascataPreferencial(params: {
  necessidades: readonly NecessidadeCapacidadeFlexivel[];
  receita: readonly ItemReceita[];
  candidatosPorId: ReadonlyMap<string, CandidatoComCapacidadeDiaria>;
  contratacaoIdPorTemporario: ReadonlyMap<string, string>;
  datasGrade: readonly string[];
  dataLimite: string;
}): { alocacoesPorNecessidade: AlocacaoNecessidadeFlexivel[][] } {
  const { necessidades, receita, candidatosPorId, contratacaoIdPorTemporario, datasGrade, dataLimite } = params;

  const { grafo, S, T, arestasOpParaDia } = construirGrafo({ necessidades, receita, candidatosPorId, contratacaoIdPorTemporario, datasGrade, diasLimite: dataLimite });

  const gruposOrdenados = Array.from(new Set(arestasOpParaDia.map((a) => a.grupoOrdem))).sort((a, b) => a - b);
  const flowFinalPorAresta = new Array<number>(arestasOpParaDia.length).fill(0);

  for (const grupoAtual of gruposOrdenados) {
    // --- Passo exploratório: custo 0 pro grupo atual, custo 1 pro resto
    // (grupos já fechados têm capacidade 0 - custo não importa mais pra
    // eles). Roda até esgotar (fluxoComCustoBinario sem alvo = max-flow
    // verdadeiro da rede atual) - inclusive usando arestas REVERSAS
    // quando necessário para reatribuir capacidade entre OPs (é isso que
    // impede uma OP sem alternativa nenhuma de ficar sem nada só porque
    // outra OP, com alternativa de sobra, "chegou primeiro" na busca).
    arestasOpParaDia.forEach((a) => {
      grafo.arestasDe(a.deNo)[a.indiceAresta].custo = a.grupoOrdem === grupoAtual ? 0 : 1;
    });
    const snapshotAntesEstagio = grafo.snapshotCapacidades();
    fluxoComCustoBinario(grafo, S, T);

    // A ATRIBUIÇÃO POR ARESTA descoberta agora - não só o agregado F_k -
    // é o que precisa ser commitado. Redescobrir de forma isolada
    // (rodar de novo restrito só ao grupo atual) já foi tentado e é
    // ERRADO: sem a MESMA pressão de viabilidade global que o passo
    // acima teve (o resto da rede, mesmo que a custo 1, ainda participa
    // da busca), uma redescoberta isolada pode empatar no agregado mas
    // escolher OUTRA atribuição entre OPs que deixa uma delas órfã (bug
    // real, achado pelo teste de invariância de ordem das OPs - a mesma
    // dupla de OPs, em ordens diferentes, produzia totais de horas
    // alocadas diferentes). Por isso: descarta TUDO (inclusive o grupo
    // atual) e reaplica, à mão, EXATAMENTE o que cada aresta do grupo
    // atual carregou aqui.
    const flowExploratorioGrupoAtual = arestasOpParaDia.map((a) =>
      a.grupoOrdem === grupoAtual ? snapshotAntesEstagio[a.deNo][a.indiceAresta] - grafo.arestasDe(a.deNo)[a.indiceAresta].capacidadeResidual : 0,
    );
    grafo.restaurarCapacidades(snapshotAntesEstagio);

    arestasOpParaDia.forEach((a, indice) => {
      if (a.grupoOrdem !== grupoAtual) return;
      const quantidade = flowExploratorioGrupoAtual[indice];
      aplicarFluxoAoLongoDoCaminho(grafo, S, T, a, quantidade);
      flowFinalPorAresta[indice] += quantidade;
    });

    // --- Fecha o grupo atual PRA SEMPRE - direta E reversa. ---
    // Zerar só a direta não basta: a reversa de uma aresta recém-commitada
    // fica com capacidadeResidual = quantidade (o "desfazível" natural de
    // qualquer fluxo) e seu campo `custo` nunca é atualizado depois da
    // criação (fica sempre 0, já que todo grupo nasce com custo 0 - só a
    // DIRETA tem o custo reatribuído a cada estágio). Se a reversa
    // continuar aberta, um estágio FUTURO pode atravessá-la "de graça"
    // (custo 0, para SEMPRE) para desfazer este commit e reencaminhar a
    // mesma OP por outro recurso - reduzindo indevidamente S->OP de novo
    // no commit seguinte e produzindo alocação em DOBRO para a mesma OP
    // (bug real, achado por fast-check: conservação de horas violada -
    // horasAlocadas chegava a 2x o necessário). O DayNode em si (seu nó,
    // não esta aresta específica) segue disponível para arestas de
    // OUTROS grupos, sem problema.
    arestasOpParaDia.forEach((a) => {
      if (a.grupoOrdem !== grupoAtual) return;
      const direta = grafo.arestasDe(a.deNo)[a.indiceAresta];
      grafo.arestasDe(direta.paraNo)[direta.indiceReversa].capacidadeResidual = 0;
      direta.capacidadeResidual = 0;
    });
  }

  const alocacoesPorNecessidade: AlocacaoNecessidadeFlexivel[][] = necessidades.map(() => []);
  arestasOpParaDia.forEach((a, indice) => {
    const ticks = flowFinalPorAresta[indice];
    const horasPadrao = ticksParaHoras(ticks);
    if (tratarComoZero(horasPadrao)) return;

    const necessidade = necessidades[a.necessidadeIndex];
    const tipoCapacidade: TipoCapacidadeFlexivel =
      a.categoria === "temporario" ? "temporario" : a.categoria === "adicional" ? "adicional" : a.candidatoId === necessidade.recursoOriginalId ? "normal_original" : "normal_compativel";

    alocacoesPorNecessidade[a.necessidadeIndex].push({
      chaveTrabalho: necessidade.chaveTrabalho,
      recursoId: a.candidatoId,
      tipoCapacidade,
      data: a.data,
      horasPadrao,
      horasMaquina: horasPadraoParaHorasMaquina(horasPadrao, a.produtividade),
      contratacaoId: a.contratacaoId,
    });
  });
  alocacoesPorNecessidade.forEach((alocacoes) => alocacoes.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0)));

  return { alocacoesPorNecessidade };
}

// --- Entrada pública do módulo ---

export function resolverDistribuicaoConjunta(params: {
  necessidades: readonly NecessidadeCapacidadeFlexivel[];
  /** Já reduzidos pelos confirmados (FIFO, fora deste módulo) - saldo real que o orçamento novo disputa. */
  candidatosNormaisPorRecurso: ReadonlyMap<string, CandidatoComCapacidadeDiaria>;
  /** Na ordem de prioridade cadastrada (temporariosPorPrioridade) - a posição no array define o rank usado pela cascata. */
  candidatosTemporariosPorPrioridade: readonly CandidatoComCapacidadeDiaria[];
  /** idTemporario -> recursoReferenciaId - define o sub-tier "vinculado ao original" dentro de temporários. */
  recursoReferenciaPorTemporario: ReadonlyMap<string, string>;
  contratacaoIdPorTemporario: ReadonlyMap<string, string>;
  datasGrade: readonly string[];
}): {
  resultadosPorChaveTrabalho: ReadonlyMap<string, ResultadoDistribuicaoFlexivel>;
  horizonteTecnico: "suficiente" | "insuficiente";
} {
  const { necessidades, candidatosNormaisPorRecurso, candidatosTemporariosPorPrioridade, recursoReferenciaPorTemporario, contratacaoIdPorTemporario, datasGrade } = params;

  for (const necessidade of necessidades) {
    validarNecessidade(necessidade, datasGrade);
    if (!candidatosNormaisPorRecurso.has(necessidade.recursoOriginalId)) {
      throw new RangeError(`candidatosNormaisPorRecurso não tem entrada para o recurso original "${necessidade.recursoOriginalId}".`);
    }
    for (const id of necessidade.recursosCompativeisPorPrioridade) {
      if (!candidatosNormaisPorRecurso.has(id)) {
        throw new RangeError(`candidatosNormaisPorRecurso não tem entrada para o recurso compatível "${id}" - compatível informado sem candidato correspondente.`);
      }
    }
  }

  const candidatosPorId = new Map<string, CandidatoComCapacidadeDiaria>([
    ...candidatosNormaisPorRecurso,
    ...candidatosTemporariosPorPrioridade.map((c) => [c.id, c] as const),
  ]);
  const temporariosOrdenados = candidatosTemporariosPorPrioridade.map((c) => ({ candidatoId: c.id }));

  const receita = construirReceitaDePreferencia({ necessidades, temporariosOrdenados, recursoReferenciaPorTemporario });

  const { dataLimite } = encontrarMenorDataViavel({ necessidades, receita, candidatosPorId, contratacaoIdPorTemporario, datasGrade });
  const dataParaDistribuicao = dataLimite ?? (datasGrade.length > 0 ? datasGrade[datasGrade.length - 1] : null);

  const alocacoesPorNecessidade =
    dataParaDistribuicao !== null
      ? resolverCascataPreferencial({ necessidades, receita, candidatosPorId, contratacaoIdPorTemporario, datasGrade, dataLimite: dataParaDistribuicao }).alocacoesPorNecessidade
      : necessidades.map(() => []);

  const resultadosPorChaveTrabalho = new Map<string, ResultadoDistribuicaoFlexivel>();
  necessidades.forEach((necessidade, indice) => {
    const alocacoes = alocacoesPorNecessidade[indice];
    const horasAlocadasPadrao = alocacoes.reduce((soma, a) => soma + a.horasPadrao, 0);
    const deficitBruto = necessidade.horasNecessariasPadrao - horasAlocadasPadrao;
    const deficitResidualHorasPadrao = tratarComoZero(deficitBruto) ? 0 : Math.max(0, deficitBruto);

    resultadosPorChaveTrabalho.set(necessidade.chaveTrabalho, {
      status: deficitResidualHorasPadrao > 0 ? "capacidade_insuficiente" : "concluida",
      horasNecessariasPadrao: necessidade.horasNecessariasPadrao,
      horasAlocadasPadrao,
      deficitResidualHorasPadrao,
      alocacoes: Object.freeze(alocacoes),
      recursosEfetivamenteUsados: Object.freeze(Array.from(new Set(alocacoes.map((a) => a.recursoId)))),
    });
  });

  return { resultadosPorChaveTrabalho, horizonteTecnico: dataLimite !== null ? "suficiente" : "insuficiente" };
}
