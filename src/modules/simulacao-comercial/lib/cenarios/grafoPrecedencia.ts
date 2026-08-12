// DEC-007 §6 - Fase 1: grafo de precedência entre ocorrências. Módulo
// puro - não lê banco; quem chama (Fase 2 em diante) já resolveu
// bom_operacoes/bom_itens/vínculos mestres em memória. A proteção de
// ciclo na estrutura de materiais já existe hoje
// (202608040001_bom_subconjunto_protecao_ciclo.sql), mas o grafo de
// OCORRÊNCIAS (que multiplica por projetoItemId/caminho e aceita
// vínculos manuais) precisa da própria validação - herda a garantia da
// estrutura de materiais, mas não pode presumi-la.
//
// Princípio geral desta fase: dado incompleto ou inconsistente NUNCA é
// ignorado silenciosamente - um vínculo que "desaparece" porque o
// destino não foi encontrado produziria uma dependência a menos do que
// deveria existir, e portanto um cronograma OTIMISTA (a ocorrência
// pareceria livre mais cedo do que realmente está). Toda lacuna vira
// erro explícito.
import { chaveOcorrenciaParaString, type ChaveOcorrencia } from "./chaveOcorrencia";

export interface BomOperacaoRow {
  id: string;
  bomId: string;
  ordem: number | null;
  ativo: boolean;
  deletedAt: string | null;
}

/**
 * Regra 1 (DEC-007 §6): a predecessora de uma ocorrência não é "ordem -
 * 1" - é a operação ATIVA imediatamente anterior na ordenação crescente
 * (roteiros usam ordens espaçadas - 10, 20, 30 - para permitir inserção
 * futura sem renumerar). `null` = primeira da cadeia, sem predecessora
 * linear. `ordem` nula é erro impeditivo, nunca presumida. Duas
 * operações ativas com a MESMA ordem tornariam a cadeia não
 * determinística (dependeria da ordem de chegada no array, não de um
 * critério real) - rejeitado explicitamente, mesmo sabendo que
 * `unique(empresa_id, bom_id, ordem)` já impede isso no schema real:
 * esta função pura não tem como presumir que todo chamador futuro
 * respeita essa garantia.
 */
export function resolverPredecessoraLinear(
  operacoesDoBom: BomOperacaoRow[],
  atual: BomOperacaoRow,
): BomOperacaoRow | null {
  if (atual.ordem === null) {
    throw new RangeError(
      `bom_operacoes.id="${atual.id}" (bom_id="${atual.bomId}"): ordem nula é dado inconsistente - não é possível resolver precedência sem posição no roteiro.`,
    );
  }

  const ativas = operacoesDoBom.filter((op) => op.ativo && op.deletedAt === null && op.ordem !== null);

  const ordensVistas = new Set<number>();
  for (const operacao of ativas) {
    const ordem = operacao.ordem as number;
    if (ordensVistas.has(ordem)) {
      throw new RangeError(
        `bom_id="${atual.bomId}": ordem=${ordem} aparece em mais de uma operação ativa - a cadeia de precedência ficaria não determinística.`,
      );
    }
    ordensVistas.add(ordem);
  }

  const ativasOrdenadas = [...ativas].sort((a, b) => (a.ordem as number) - (b.ordem as number));
  const indice = ativasOrdenadas.findIndex((op) => op.id === atual.id);
  if (indice === -1) {
    throw new RangeError(
      `bom_operacoes.id="${atual.id}" não está entre as operações ativas do próprio bom_id="${atual.bomId}" informadas - lista de operações do roteiro incompleta ou inconsistente.`,
    );
  }

  return indice === 0 ? null : ativasOrdenadas[indice - 1];
}

export type TipoDependenciaOcorrencia = "sequencia_roteiro" | "consumo_subconjunto";

export interface DependenciaOcorrencia {
  predecessora: ChaveOcorrencia;
  sucessora: ChaveOcorrencia;
  tipo: TipoDependenciaOcorrencia;
}

/** Regra 2 (DEC-007 §6) - vínculo MESTRE (dado de cadastro do roteiro, Fase 6 futura), representado em memória nesta fase. */
export interface VinculoSubconjuntoOperacaoConsumidora {
  bomItemIdSubconjunto: string;
  bomOperacaoIdConsumidora: string;
}

export interface OcorrenciaComContexto {
  chave: ChaveOcorrencia;
  bomOperacaoId: string;
  bomId: string;
}

/** Um subconjunto usado dentro de um bom_id pai - equivalente em memória a uma linha de bom_itens com componente_tipo='subconjunto'. */
export interface SubconjuntoUsado {
  bomItemId: string;
  bomIdPai: string;
  bomIdSubconjunto: string;
}

/**
 * DFS com 3 cores (branco/cinza/preto) - detecta ciclo real no grafo de
 * dependências (que pode existir mesmo com a estrutura de materiais
 * protegida, por erro num vínculo mestre informado manualmente).
 * Retorna o caminho do ciclo encontrado (para diagnóstico), ou `null`
 * se o grafo é acíclico.
 */
export function detectarCiclo(dependencias: DependenciaOcorrencia[]): ChaveOcorrencia[] | null {
  const sucessorasPorPredecessora = new Map<string, ChaveOcorrencia[]>();
  const chavePorString = new Map<string, ChaveOcorrencia>();

  for (const dependencia of dependencias) {
    const predStr = chaveOcorrenciaParaString(dependencia.predecessora);
    const sucStr = chaveOcorrenciaParaString(dependencia.sucessora);
    chavePorString.set(predStr, dependencia.predecessora);
    chavePorString.set(sucStr, dependencia.sucessora);
    if (!sucessorasPorPredecessora.has(predStr)) sucessorasPorPredecessora.set(predStr, []);
    sucessorasPorPredecessora.get(predStr)!.push(dependencia.sucessora);
  }

  const cor = new Map<string, "branco" | "cinza" | "preto">();
  for (const chaveStr of chavePorString.keys()) cor.set(chaveStr, "branco");
  const pilha: string[] = [];

  function visitar(chaveStr: string): ChaveOcorrencia[] | null {
    cor.set(chaveStr, "cinza");
    pilha.push(chaveStr);

    for (const sucessora of sucessorasPorPredecessora.get(chaveStr) ?? []) {
      const sucStr = chaveOcorrenciaParaString(sucessora);
      const corSucessora = cor.get(sucStr) ?? "branco";
      if (corSucessora === "cinza") {
        const indiceInicioCiclo = pilha.indexOf(sucStr);
        return pilha.slice(indiceInicioCiclo).map((s) => chavePorString.get(s)!);
      }
      if (corSucessora === "branco") {
        const cicloEncontrado = visitar(sucStr);
        if (cicloEncontrado) return cicloEncontrado;
      }
    }

    pilha.pop();
    cor.set(chaveStr, "preto");
    return null;
  }

  for (const chaveStr of chavePorString.keys()) {
    if (cor.get(chaveStr) === "branco") {
      const cicloEncontrado = visitar(chaveStr);
      if (cicloEncontrado) return cicloEncontrado;
    }
  }

  return null;
}

/**
 * Monta o grafo de dependências completo (Regra 1 + Regra 2), validando
 * a integridade do conjunto de ponta a ponta - rejeita explicitamente
 * (lança erro) qualquer inconsistência, nunca ignora silenciosamente:
 *
 * 1. chave completa de ocorrência duplicada;
 * 2. chave.bomOperacaoId / ocorrencia.bomOperacaoId / operação do BOM
 *    precisam coincidir;
 * 3. toda predecessora e sucessora produzida precisa existir no
 *    conjunto de ocorrências informado;
 * 4. vínculo mestre precisa apontar para uma operação ATIVA do BOM PAI
 *    correto (não de qualquer BOM);
 * 5. ciclo de precedência.
 *
 * Regra 2 sem vínculo mestre: fallback conservador - TODAS as
 * ocorrências do bom_id pai (no mesmo caminho) dependem da última
 * ocorrência de CADA subconjunto direto sem vínculo. É redundante com
 * a cadeia da Regra 1 (a data efetiva não muda, já que só a maior data
 * entre as predecessoras importa), mas é a garantia conservadora
 * documentada - nunca promete uma data mais otimista que a realidade
 * permite.
 */
export function construirGrafoOcorrencias(params: {
  ocorrencias: OcorrenciaComContexto[];
  operacoesPorBomId: Record<string, BomOperacaoRow[]>;
  subconjuntosUsados: SubconjuntoUsado[];
  vinculosMestres: VinculoSubconjuntoOperacaoConsumidora[];
}): { dependencias: DependenciaOcorrencia[] } {
  const { ocorrencias, operacoesPorBomId, subconjuntosUsados, vinculosMestres } = params;
  const dependencias: DependenciaOcorrencia[] = [];

  // --- Validação 1: chave completa duplicada ---
  const chavesConhecidas = new Set<string>();
  for (const ocorrencia of ocorrencias) {
    const chaveStr = chaveOcorrenciaParaString(ocorrencia.chave);
    if (chavesConhecidas.has(chaveStr)) {
      throw new RangeError(`Ocorrência duplicada no conjunto: a chave "${chaveStr}" aparece mais de uma vez.`);
    }
    chavesConhecidas.add(chaveStr);
  }

  // --- Validação 2: chave.bomOperacaoId / ocorrencia.bomOperacaoId / operação do BOM coincidem ---
  const operacaoPorBomIdEId = new Map<string, BomOperacaoRow>();
  for (const [bomId, operacoes] of Object.entries(operacoesPorBomId)) {
    for (const operacao of operacoes) operacaoPorBomIdEId.set(`${bomId}::${operacao.id}`, operacao);
  }

  for (const ocorrencia of ocorrencias) {
    if (ocorrencia.chave.bomOperacaoId !== ocorrencia.bomOperacaoId) {
      throw new RangeError(
        `Ocorrência "${chaveOcorrenciaParaString(ocorrencia.chave)}": chave.bomOperacaoId="${ocorrencia.chave.bomOperacaoId}" difere de ocorrencia.bomOperacaoId="${ocorrencia.bomOperacaoId}".`,
      );
    }
    const operacaoCorrespondente = operacaoPorBomIdEId.get(`${ocorrencia.bomId}::${ocorrencia.bomOperacaoId}`);
    if (!operacaoCorrespondente) {
      throw new RangeError(
        `Ocorrência "${chaveOcorrenciaParaString(ocorrencia.chave)}": bomOperacaoId="${ocorrencia.bomOperacaoId}" não corresponde a nenhuma operação informada em operacoesPorBomId["${ocorrencia.bomId}"].`,
      );
    }
    if (operacaoCorrespondente.id !== ocorrencia.bomOperacaoId) {
      throw new RangeError(
        `Ocorrência "${chaveOcorrenciaParaString(ocorrencia.chave)}": a operação do BOM encontrada (id="${operacaoCorrespondente.id}") não coincide com bomOperacaoId="${ocorrencia.bomOperacaoId}".`,
      );
    }
  }

  // Agrupa ocorrências por (projetoItemId, produtoRaizId, caminhoBomItemIds,
  // bomId) - a Regra 1 só encadeia ocorrências do MESMO roteiro, no MESMO
  // caminho de subconjuntos, do MESMO item de projeto (chave completa).
  const ocorrenciasPorGrupo = new Map<string, OcorrenciaComContexto[]>();
  const chaveGrupo = (oc: OcorrenciaComContexto) =>
    `${oc.chave.projetoItemId}::${oc.chave.produtoRaizId}::${oc.chave.caminhoBomItemIds.join(">")}::${oc.bomId}`;
  for (const ocorrencia of ocorrencias) {
    const grupo = chaveGrupo(ocorrencia);
    if (!ocorrenciasPorGrupo.has(grupo)) ocorrenciasPorGrupo.set(grupo, []);
    ocorrenciasPorGrupo.get(grupo)!.push(ocorrencia);
  }

  const ocorrenciaPorBomOperacaoId = new Map<string, OcorrenciaComContexto>();
  for (const ocorrencia of ocorrencias) {
    ocorrenciaPorBomOperacaoId.set(`${chaveGrupo(ocorrencia)}::${ocorrencia.bomOperacaoId}`, ocorrencia);
  }

  // Regra 1 - validação 2 já garante que toda ocorrência tem uma
  // operação correspondente, então "atual" abaixo sempre existe;
  // mantido como checagem defensiva (nunca deveria disparar).
  for (const [grupo, ocorrenciasDoGrupo] of ocorrenciasPorGrupo) {
    const bomId = ocorrenciasDoGrupo[0].bomId;
    const operacoesDoBom = operacoesPorBomId[bomId] ?? [];
    for (const ocorrencia of ocorrenciasDoGrupo) {
      const atual = operacoesDoBom.find((op) => op.id === ocorrencia.bomOperacaoId);
      if (!atual) {
        throw new RangeError(
          `Inconsistência interna: ocorrência "${chaveOcorrenciaParaString(ocorrencia.chave)}" passou pela validação mas não foi encontrada em operacoesPorBomId["${bomId}"].`,
        );
      }
      const predecessora = resolverPredecessoraLinear(operacoesDoBom, atual);
      if (predecessora) {
        // Validação 3: a predecessora resolvida PRECISA ter uma
        // ocorrência correspondente no conjunto informado - senão a
        // cadeia "perderia" um elo e a sucessora pareceria livre mais
        // cedo do que realmente está (cronograma otimista).
        const chavePredecessora = ocorrenciaPorBomOperacaoId.get(`${grupo}::${predecessora.id}`);
        if (!chavePredecessora) {
          throw new RangeError(
            `Ocorrência "${chaveOcorrenciaParaString(ocorrencia.chave)}": a predecessora linear resolvida (bomOperacaoId="${predecessora.id}") não tem ocorrência correspondente no conjunto informado - conjunto de ocorrências incompleto.`,
          );
        }
        dependencias.push({ predecessora: chavePredecessora.chave, sucessora: ocorrencia.chave, tipo: "sequencia_roteiro" });
      }
    }
  }

  // Regra 2
  for (const [grupo, ocorrenciasDoGrupo] of ocorrenciasPorGrupo) {
    const { chave: chaveBase, bomId: bomIdPai } = ocorrenciasDoGrupo[0];
    const subconjuntosDoPai = subconjuntosUsados.filter((s) => s.bomIdPai === bomIdPai);

    for (const subconjunto of subconjuntosDoPai) {
      const caminhoSubconjunto = [...chaveBase.caminhoBomItemIds, subconjunto.bomItemId];
      const operacoesDoSubconjunto = operacoesPorBomId[subconjunto.bomIdSubconjunto] ?? [];
      const ativasOrdenadas = operacoesDoSubconjunto
        .filter((op) => op.ativo && op.deletedAt === null && op.ordem !== null)
        .sort((a, b) => (a.ordem as number) - (b.ordem as number));
      const ultimaOperacaoSubconjunto = ativasOrdenadas[ativasOrdenadas.length - 1];
      if (!ultimaOperacaoSubconjunto) {
        throw new RangeError(
          `Subconjunto bomItemId="${subconjunto.bomItemId}" (bomIdSubconjunto="${subconjunto.bomIdSubconjunto}"), usado por bomIdPai="${bomIdPai}", não tem nenhuma operação ativa informada em operacoesPorBomId - não é possível determinar quando ele termina.`,
        );
      }

      const chaveUltimaOcorrenciaSubconjunto: ChaveOcorrencia = {
        projetoItemId: chaveBase.projetoItemId,
        produtoRaizId: chaveBase.produtoRaizId,
        caminhoBomItemIds: caminhoSubconjunto,
        bomOperacaoId: ultimaOperacaoSubconjunto.id,
      };
      if (!chavesConhecidas.has(chaveOcorrenciaParaString(chaveUltimaOcorrenciaSubconjunto))) {
        throw new RangeError(
          `Subconjunto bomItemId="${subconjunto.bomItemId}": a última operação (bomOperacaoId="${ultimaOperacaoSubconjunto.id}", caminho="${caminhoSubconjunto.join(">")}") não tem ocorrência correspondente no conjunto informado.`,
        );
      }

      const vinculoMestre = vinculosMestres.find((v) => v.bomItemIdSubconjunto === subconjunto.bomItemId);

      if (vinculoMestre) {
        // Validação 4: o vínculo mestre precisa apontar para uma
        // operação ATIVA do BOM PAI correto - não de qualquer BOM, e
        // não uma operação inativa/excluída (que nunca vai concluir).
        const operacaoConsumidora = operacaoPorBomIdEId.get(`${bomIdPai}::${vinculoMestre.bomOperacaoIdConsumidora}`);
        if (!operacaoConsumidora) {
          throw new RangeError(
            `Vínculo mestre inválido: bomOperacaoIdConsumidora="${vinculoMestre.bomOperacaoIdConsumidora}" não corresponde a nenhuma operação de bomIdPai="${bomIdPai}" (bomItemIdSubconjunto="${subconjunto.bomItemId}").`,
          );
        }
        if (!operacaoConsumidora.ativo || operacaoConsumidora.deletedAt !== null) {
          throw new RangeError(
            `Vínculo mestre inválido: a operação consumidora "${vinculoMestre.bomOperacaoIdConsumidora}" de bomIdPai="${bomIdPai}" não está ativa.`,
          );
        }
        const consumidora = ocorrenciaPorBomOperacaoId.get(`${grupo}::${vinculoMestre.bomOperacaoIdConsumidora}`);
        if (!consumidora) {
          throw new RangeError(
            `Vínculo mestre inválido: a operação consumidora "${vinculoMestre.bomOperacaoIdConsumidora}" (bomIdPai="${bomIdPai}") não tem ocorrência correspondente no conjunto informado.`,
          );
        }
        dependencias.push({ predecessora: chaveUltimaOcorrenciaSubconjunto, sucessora: consumidora.chave, tipo: "consumo_subconjunto" });
      } else {
        // Fallback conservador: TODAS as ocorrências do pai dependem da última operação deste subconjunto.
        for (const ocorrencia of ocorrenciasDoGrupo) {
          dependencias.push({ predecessora: chaveUltimaOcorrenciaSubconjunto, sucessora: ocorrencia.chave, tipo: "consumo_subconjunto" });
        }
      }
    }
  }

  // Vínculos mestres informados mas nunca usados (bomItemIdSubconjunto
  // que não corresponde a nenhum subconjuntoUsado) são dado
  // inconsistente - ficariam "soltos", nunca aplicados a nada, sem
  // aviso.
  const bomItemIdsComSubconjuntoUsado = new Set(subconjuntosUsados.map((s) => s.bomItemId));
  for (const vinculo of vinculosMestres) {
    if (!bomItemIdsComSubconjuntoUsado.has(vinculo.bomItemIdSubconjunto)) {
      throw new RangeError(
        `Vínculo mestre inválido: bomItemIdSubconjunto="${vinculo.bomItemIdSubconjunto}" não corresponde a nenhum subconjuntoUsado informado.`,
      );
    }
  }

  // Validação 3 (rede de segurança final): toda predecessora/sucessora
  // PRODUZIDA precisa existir no conjunto de ocorrências - mesmo que as
  // checagens acima já devessem garantir isso em cada ponto de
  // construção, esta passagem final protege contra qualquer caminho de
  // código futuro que não passe por elas.
  for (const dependencia of dependencias) {
    for (const chave of [dependencia.predecessora, dependencia.sucessora]) {
      if (!chavesConhecidas.has(chaveOcorrenciaParaString(chave))) {
        throw new RangeError(
          `Dependência produzida referencia uma ocorrência fora do conjunto informado: "${chaveOcorrenciaParaString(chave)}".`,
        );
      }
    }
  }

  // Nota honesta sobre esta chamada: a Regra 1 (ordem estritamente
  // crescente) e a Regra 2 (caminhoBomItemIds SEMPRE cresce 1 nível a
  // cada aresta) tornam esta construção acíclica POR CONSTRUÇÃO - não
  // existe combinação de subconjuntosUsados/vinculosMestres, por mais
  // adversária, capaz de fazer o caminho "encolher" de volta a um
  // estado já visitado. detectarCiclo é mantida mesmo assim como rede
  // de segurança explícita (barata, e protege contra mudanças futuras
  // nesta função ou uso de detectarCiclo por outro chamador que não
  // preserve essa invariante) - os testes de ciclo deste módulo
  // exercitam detectarCiclo diretamente (a peça reutilizável e
  // genuinamente capaz de formar ciclo), não uma entrada fabricada para
  // este builder especificamente.
  const cicloEncontrado = detectarCiclo(dependencias);
  if (cicloEncontrado) {
    throw new RangeError(
      `Ciclo de precedência detectado entre ocorrências: ${cicloEncontrado.map(chaveOcorrenciaParaString).join(" -> ")}`,
    );
  }

  return { dependencias };
}

/**
 * "Sucessora liberada somente após conclusão real de TODAS as
 * predecessoras" (DEC-007 §7, parte estrutural desta fase) - dado o
 * grafo e o conjunto de ocorrências já concluídas, devolve as que ficam
 * prontas agora. Não decide o que "concluída" significa (déficit
 * zero/data final válida é responsabilidade do escalonador, Fase 2) -
 * só garante que nenhuma ocorrência libera antes de TODAS as suas
 * predecessoras estarem no conjunto `concluidas`.
 */
export function resolverOcorrenciasLiberadas(
  todasOcorrencias: ChaveOcorrencia[],
  dependencias: DependenciaOcorrencia[],
  concluidas: ReadonlySet<string>,
): ChaveOcorrencia[] {
  const predecessorasPorSucessora = new Map<string, ChaveOcorrencia[]>();
  for (const dependencia of dependencias) {
    const sucStr = chaveOcorrenciaParaString(dependencia.sucessora);
    if (!predecessorasPorSucessora.has(sucStr)) predecessorasPorSucessora.set(sucStr, []);
    predecessorasPorSucessora.get(sucStr)!.push(dependencia.predecessora);
  }

  return todasOcorrencias.filter((ocorrencia) => {
    const chaveStr = chaveOcorrenciaParaString(ocorrencia);
    if (concluidas.has(chaveStr)) return false;
    const predecessoras = predecessorasPorSucessora.get(chaveStr) ?? [];
    return predecessoras.every((predecessora) => concluidas.has(chaveOcorrenciaParaString(predecessora)));
  });
}
