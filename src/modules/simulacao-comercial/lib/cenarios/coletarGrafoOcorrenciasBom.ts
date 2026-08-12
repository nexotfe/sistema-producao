// DEC-007 §6/§7 - Fase 8a: ponte entre dado real do roteiro e o formato
// que construirGrafoOcorrencias (Fase 1, grafoPrecedencia.ts) exige -
// ChaveOcorrencia por operação, operacoesPorBomId, subconjuntosUsados e
// vinculosMestres (Fase 7). Função IRMÃ de coletarEstruturaBom.ts
// (src/modules/bom/lib/) - mesmo domínio (travessia de estrutura BOM),
// consumidor diferente. O motor antigo (motorAvaliacaoSequencial.ts,
// via prepararEntradasMotor.ts → coletarEstruturaBom.ts) NÃO é tocado
// por este módulo.
//
// Decisão de desenho: em vez de reimplementar a travessia recursiva em
// TypeScript pela terceira vez (coletarEstruturaBom.ts já é a segunda,
// depois de calcular_custo_bom em SQL - o próprio cabeçalho de
// coletarEstruturaBom.ts registra o risco de divergência entre
// implementações independentes da mesma regra), este módulo reaproveita
// lista_tecnica_nos_alcancaveis (RPC SQL, 202608040003_lista_tecnica_consolidada.sql) -
// já testada, já cobre ciclo/produto ausente/excluído/inativo,
// já devolve caminho_bom_item_ids por nó (exatamente o que
// ChaveOcorrencia.caminhoBomItemIds precisa), já roda inteira no
// servidor (1 chamada, não N+1 por subconjunto como coletarEstruturaBom.ts).
//
// Função de leitura (I/O, cliente injetado) e função de transformação
// (pura, sem I/O) são exportadas separadamente - a pura é testável só
// com fixtures, sem cliente nenhum (mesmo padrão de
// mapearVinculosSubconjunto.ts, reaproveitado aqui para os vínculos).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChaveOcorrencia } from "./chaveOcorrencia";
import type {
  BomOperacaoRow,
  OcorrenciaComContexto,
  SubconjuntoUsado,
  VinculoSubconjuntoOperacaoConsumidora,
} from "./grafoPrecedencia";
import {
  mapearVinculosSubconjunto,
  type LinhaBrutaDependenciaSubconjunto,
} from "./mapearVinculosSubconjunto";

/** Uma linha de lista_tecnica_nos_alcancaveis, exatamente como o Supabase client devolve (snake_case). */
export interface NoAlcancavelBruto {
  produto_id: string;
  caminho: string[];
  caminho_bom_item_ids: string[];
  profundidade: number;
  quantidade_acumulada: number;
  bom_resolvido_id: string | null;
  tem_bom: boolean;
  ciclo: boolean;
  produto_ausente: boolean;
  produto_excluido: boolean;
  produto_inativo: boolean;
  tipo_item: string | null;
}

/** Linha crua de bom_operacoes, mesmo formato snake_case do Supabase client. */
export interface BomOperacaoRowBruta {
  id: string;
  bom_id: string;
  ordem: number | null;
  ativo: boolean;
  deleted_at: string | null;
}

export interface GrafoOcorrenciasBom {
  ocorrencias: OcorrenciaComContexto[];
  operacoesPorBomId: Record<string, BomOperacaoRow[]>;
  subconjuntosUsados: SubconjuntoUsado[];
  vinculosMestres: VinculoSubconjuntoOperacaoConsumidora[];
  /**
   * Quantidade acumulada (quantidade do item de origem × quantidade de
   * cada nível de subconjunto atravessado) por nó, chaveada por
   * caminhoBomItemIdsParaChave(chave.caminhoBomItemIds) - mesma
   * multiplicação já usada por coletarEstruturaBom.ts (motor antigo).
   * Necessária para converter tempoEstimadoMinutos em
   * necessarioHorasPadrao (fórmula em motorAvaliacaoSequencial.ts) -
   * quem consome ocorrencias precisa disto, não estava exposto na
   * primeira versão desta ponte.
   */
  quantidadeAcumuladaPorCaminho: Record<string, number>;
}

/** Chave estável para localizar um nó por caminhoBomItemIds - mesma convenção usada internamente neste módulo. */
export function caminhoBomItemIdsParaChave(caminhoBomItemIds: string[]): string {
  return caminhoBomItemIds.join(">");
}

const caminhoStr = caminhoBomItemIdsParaChave;

/**
 * Transformação pura - dado o resultado já lido do banco (nós
 * alcançáveis + operações + vínculos brutos), monta as 4 entradas que
 * construirGrafoOcorrencias exige. Toda inconsistência vira RangeError
 * explícito - nunca um nó/operação/vínculo é descartado silenciosamente
 * (a mesma disciplina do resto de lib/cenarios/).
 */
export function montarGrafoOcorrenciasBom(params: {
  projetoItemId: string;
  produtoRaizId: string;
  nos: NoAlcancavelBruto[];
  operacoesBrutas: BomOperacaoRowBruta[];
  vinculosBrutos: LinhaBrutaDependenciaSubconjunto[];
}): GrafoOcorrenciasBom {
  const { projetoItemId, produtoRaizId, nos, operacoesBrutas, vinculosBrutos } = params;

  if (nos.length === 0) {
    throw new RangeError(
      `lista_tecnica_nos_alcancaveis não devolveu nenhum nó para produtoRaizId="${produtoRaizId}" - esperado pelo menos o nó raiz.`,
    );
  }

  // --- 1. Ciclo, produto ausente/excluído, roteiro ausente - nunca ignorados. ---
  const porCaminhoStr = new Map<string, NoAlcancavelBruto>();
  for (const no of nos) {
    const chaveCaminho = caminhoStr(no.caminho_bom_item_ids);

    if (porCaminhoStr.has(chaveCaminho)) {
      throw new RangeError(
        `IDs inconsistentes: dois nós devolvidos por lista_tecnica_nos_alcancaveis compartilham o mesmo caminhoBomItemIds="${chaveCaminho}" (produtoId="${no.produto_id}").`,
      );
    }
    porCaminhoStr.set(chaveCaminho, no);

    if (no.ciclo) {
      throw new RangeError(
        `Ciclo detectado na estrutura do roteiro: caminho="${no.caminho.join(">")}" (produtoId="${no.produto_id}") revisita um produto já presente no próprio caminho.`,
      );
    }
    if (no.produto_ausente) {
      throw new RangeError(
        `Produto ausente: produtoId="${no.produto_id}" (caminho="${no.caminho.join(">")}") não foi encontrado em itens_industriais.`,
      );
    }
    if (no.produto_excluido) {
      throw new RangeError(
        `Produto excluído: produtoId="${no.produto_id}" (caminho="${no.caminho.join(">")}") está com deleted_at preenchido.`,
      );
    }
    if (!no.tem_bom || !no.bom_resolvido_id) {
      throw new RangeError(
        no.profundidade === 0
          ? `Roteiro ausente: produtoRaizId="${produtoRaizId}" não tem nenhum BOM ativo resolvível.`
          : `Subconjunto sem roteiro resolvível: produtoId="${no.produto_id}" (caminho="${no.caminho.join(">")}") não tem nenhum BOM ativo resolvível.`,
      );
    }
    if (no.tem_bom && !no.bom_resolvido_id) {
      // Defensivo - nunca deveria acontecer dado o contrato da RPC (tem_bom <=> bom_resolvido_id != null).
      throw new RangeError(
        `Inconsistência interna: nó com temBom=true mas bomResolvidoId nulo (produtoId="${no.produto_id}", caminho="${no.caminho.join(">")}").`,
      );
    }
  }

  const raiz = nos.find((no) => no.profundidade === 0);
  if (!raiz) {
    throw new RangeError(`lista_tecnica_nos_alcancaveis não devolveu o nó raiz (profundidade=0) para produtoRaizId="${produtoRaizId}".`);
  }

  // --- 2. subconjuntosUsados - todo nó não-raiz corresponde a 1 subconjunto usado pelo pai. ---
  const subconjuntosUsados: SubconjuntoUsado[] = [];
  for (const no of nos) {
    if (no.profundidade === 0) continue;

    const caminhoPai = no.caminho_bom_item_ids.slice(0, -1);
    const nodoPai = porCaminhoStr.get(caminhoStr(caminhoPai));
    if (!nodoPai) {
      throw new RangeError(
        `IDs inconsistentes: nó (caminho="${no.caminho.join(">")}") não tem nó-pai correspondente para o caminho reduzido "${caminhoStr(caminhoPai)}".`,
      );
    }
    if (!nodoPai.bom_resolvido_id) {
      // Defensivo - já teria lançado no laço acima (tem_bom/bom_resolvido_id do pai).
      throw new RangeError(`Inconsistência interna: nó-pai sem bomResolvidoId (caminho="${caminhoStr(caminhoPai)}").`);
    }

    const bomItemId = no.caminho_bom_item_ids[no.caminho_bom_item_ids.length - 1];
    subconjuntosUsados.push({
      bomItemId,
      bomIdPai: nodoPai.bom_resolvido_id,
      bomIdSubconjunto: no.bom_resolvido_id as string,
    });
  }

  // --- 3. operacoesPorBomId - agrupado por bom_id, IDs de operação nunca duplicados dentro do mesmo bom. ---
  const operacoesPorBomId: Record<string, BomOperacaoRow[]> = {};
  const idsOperacaoVistosPorBom = new Map<string, Set<string>>();
  for (const opBruta of operacoesBrutas) {
    if (!idsOperacaoVistosPorBom.has(opBruta.bom_id)) {
      idsOperacaoVistosPorBom.set(opBruta.bom_id, new Set());
      operacoesPorBomId[opBruta.bom_id] = [];
    }
    const idsVistos = idsOperacaoVistosPorBom.get(opBruta.bom_id)!;
    if (idsVistos.has(opBruta.id)) {
      throw new RangeError(
        `IDs inconsistentes: bom_operacoes.id="${opBruta.id}" aparece mais de uma vez para bom_id="${opBruta.bom_id}".`,
      );
    }
    idsVistos.add(opBruta.id);

    operacoesPorBomId[opBruta.bom_id].push({
      id: opBruta.id,
      bomId: opBruta.bom_id,
      ordem: opBruta.ordem,
      ativo: opBruta.ativo,
      deletedAt: opBruta.deleted_at,
    });
  }

  // --- 4. ocorrencias - 1 por (nó resolvido × operação ativa do bom desse nó), chave completa. ---
  const ocorrencias: OcorrenciaComContexto[] = [];
  for (const no of nos) {
    const bomId = no.bom_resolvido_id as string;
    const operacoesAtivas = (operacoesPorBomId[bomId] ?? []).filter(
      (op) => op.ativo && op.deletedAt === null && op.ordem !== null,
    );

    for (const op of operacoesAtivas) {
      const chave: ChaveOcorrencia = {
        projetoItemId,
        produtoRaizId,
        caminhoBomItemIds: no.caminho_bom_item_ids,
        bomOperacaoId: op.id,
      };
      ocorrencias.push({ chave, bomOperacaoId: op.id, bomId });
    }
  }

  if (ocorrencias.length === 0) {
    throw new RangeError(
      `Operação ausente: o roteiro raiz (produtoRaizId="${produtoRaizId}", bomId="${raiz.bom_resolvido_id}") não tem nenhuma operação ativa - nenhuma ocorrência pôde ser montada.`,
    );
  }

  // --- 5. vinculosMestres (Fase 7) - reaproveita mapearVinculosSubconjunto sem modificação. ---
  const vinculosMestres = mapearVinculosSubconjunto(vinculosBrutos);

  // --- 6. Vínculo apontando para operação inválida - checagem antecipada e
  //     específica desta camada (além da que construirGrafoOcorrencias já
  //     faz por dentro): a operação consumidora precisa existir, ativa, no
  //     MESMO bom_id do pai do subconjunto vinculado.
  const bomIdPaiPorBomItemId = new Map(subconjuntosUsados.map((s) => [s.bomItemId, s.bomIdPai]));
  for (const vinculo of vinculosMestres) {
    const bomIdPai = bomIdPaiPorBomItemId.get(vinculo.bomItemIdSubconjunto);
    if (!bomIdPai) {
      throw new RangeError(
        `Vínculo mestre inválido: bomItemIdSubconjunto="${vinculo.bomItemIdSubconjunto}" não corresponde a nenhum subconjunto usado por este roteiro.`,
      );
    }
    const operacaoConsumidora = (operacoesPorBomId[bomIdPai] ?? []).find((op) => op.id === vinculo.bomOperacaoIdConsumidora);
    if (!operacaoConsumidora) {
      throw new RangeError(
        `Vínculo mestre inválido: bomOperacaoIdConsumidora="${vinculo.bomOperacaoIdConsumidora}" não corresponde a nenhuma operação de bomId="${bomIdPai}" (bomItemIdSubconjunto="${vinculo.bomItemIdSubconjunto}").`,
      );
    }
    if (!operacaoConsumidora.ativo || operacaoConsumidora.deletedAt !== null) {
      throw new RangeError(
        `Vínculo mestre inválido: a operação consumidora "${vinculo.bomOperacaoIdConsumidora}" (bomId="${bomIdPai}") não está ativa.`,
      );
    }
  }

  const quantidadeAcumuladaPorCaminho: Record<string, number> = {};
  for (const no of nos) {
    quantidadeAcumuladaPorCaminho[caminhoStr(no.caminho_bom_item_ids)] = no.quantidade_acumulada;
  }

  return { ocorrencias, operacoesPorBomId, subconjuntosUsados, vinculosMestres, quantidadeAcumuladaPorCaminho };
}

/**
 * Leitura (I/O, cliente injetado) - 3 consultas: (1) lista_tecnica_nos_alcancaveis
 * (RPC, cobre toda a travessia recursiva + ciclo/produto ausente/excluído,
 * já testada), (2) bom_operacoes ativas de todos os bomId resolvidos em
 * lote, (3) vínculos mestres (Fase 7) vivos de todos os bomItemId de
 * subconjunto em lote. empresaId filtra (2) e (3) explicitamente - nunca
 * confia só em RLS para isolamento de tenant (mesmo padrão do resto do
 * projeto). A RPC em si é escopada por empresa_atual_id() internamente
 * (SECURITY INVOKER); empresaId aqui é o resolvido pelo chamador para a
 * sessão atual, usado só nas consultas que este módulo monta por fora.
 */
export async function coletarGrafoOcorrenciasBom(
  client: SupabaseClient,
  params: { empresaId: string; projetoItemId: string; produtoRaizId: string; quantidadeRaiz: number },
): Promise<GrafoOcorrenciasBom> {
  const { empresaId, projetoItemId, produtoRaizId, quantidadeRaiz } = params;

  const { data: nosData, error: erroNos } = await client.rpc("lista_tecnica_nos_alcancaveis", {
    p_produto_raiz_id: produtoRaizId,
    p_quantidade_raiz: quantidadeRaiz,
  });
  if (erroNos) {
    throw new Error(`Erro ao consultar lista_tecnica_nos_alcancaveis para produtoRaizId="${produtoRaizId}": ${erroNos.message}`);
  }
  const nos = (nosData ?? []) as NoAlcancavelBruto[];

  const bomIdsResolvidos = Array.from(
    new Set(nos.map((no) => no.bom_resolvido_id).filter((id): id is string => id !== null)),
  );

  const operacoesBrutas: BomOperacaoRowBruta[] = [];
  if (bomIdsResolvidos.length > 0) {
    const { data: opsData, error: erroOps } = await client
      .from("bom_operacoes")
      .select("id,bom_id,ordem,ativo,deleted_at")
      .eq("empresa_id", empresaId)
      .in("bom_id", bomIdsResolvidos)
      .eq("ativo", true)
      .is("deleted_at", null);
    if (erroOps) {
      throw new Error(`Erro ao consultar bom_operacoes para produtoRaizId="${produtoRaizId}": ${erroOps.message}`);
    }
    operacoesBrutas.push(...((opsData ?? []) as BomOperacaoRowBruta[]));
  }

  const bomItemIdsSubconjunto = nos
    .filter((no) => no.profundidade > 0)
    .map((no) => no.caminho_bom_item_ids[no.caminho_bom_item_ids.length - 1]);

  const vinculosBrutos: LinhaBrutaDependenciaSubconjunto[] = [];
  if (bomItemIdsSubconjunto.length > 0) {
    const { data: vincData, error: erroVinc } = await client
      .from("bom_operacao_dependencias_subconjunto")
      .select("bom_item_id,bom_operacao_id,deleted_at,ativo")
      .eq("empresa_id", empresaId)
      .in("bom_item_id", bomItemIdsSubconjunto)
      .is("deleted_at", null);
    if (erroVinc) {
      throw new Error(`Erro ao consultar bom_operacao_dependencias_subconjunto para produtoRaizId="${produtoRaizId}": ${erroVinc.message}`);
    }
    vinculosBrutos.push(...((vincData ?? []) as LinhaBrutaDependenciaSubconjunto[]));
  }

  return montarGrafoOcorrenciasBom({
    projetoItemId,
    produtoRaizId,
    nos,
    operacoesBrutas,
    vinculosBrutos,
  });
}
