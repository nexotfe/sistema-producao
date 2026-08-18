// DEC-007 - previsão comercial por capacidade: carregador das OPs do
// ORÇAMENTO NOVO (o projeto sendo avaliado, ainda não confirmado) -
// deliberadamente SEPARADO de carregarConfirmadosComerciais.ts.
//
// CORREÇÃO (achada em teste visual com dado real, projeto 260011): a
// versão anterior lia `simulacoes_comerciais`/`simulacao_comercial_itens`
// - ERRADO para o orçamento novo. Essas tabelas só existem depois de uma
// aprovação (`aprovar_projeto_com_simulacao_v4`); exigi-las aqui é uma
// contradição lógica, porque o orçamento novo é justamente o que está
// sendo avaliado ANTES de qualquer aprovação - ele nunca teve, e não
// precisa ter, uma simulação vigente. Essa fonte (snapshot aprovado)
// pertence SÓ a projetos já CONFIRMADOS (carregarConfirmadosComerciais.ts,
// nunca tocado por esta correção).
//
// Fonte correta: o roteiro ATUAL do produto (projeto_itens → BOM →
// operações), com as quantidades e os recursos ORIGINAIS cadastrados - a
// mesma travessia que carregarBaseCenarios.ts já usa para o motor antigo
// (coletarGrafoOcorrenciasBom.ts, reaproveitada aqui SEM modificação
// nenhuma naquele arquivo). Diferença deliberada: nunca chama
// construirGrafoOcorrencias/monta grafo de PRECEDÊNCIA - o motor novo
// (avaliarPrevisaoComercialFlexivel.ts) não sequencia operações; cada
// ocorrência é uma necessidade de capacidade independente (ver
// NecessidadeCapacidadeFlexivel - nenhum campo de precedência ali).
//
// CORREÇÃO (subconjunto considerado pronto por padrão, decisão
// confirmada com o usuário): coletarGrafoOcorrenciasBom devolve
// ocorrências da árvore INTEIRA (produto + todos os subconjuntos
// alcançáveis) - até esta correção, as operações de CADA subconjunto
// eram somadas junto com as do produto principal na mesma lista de
// necessidades, disputando a mesma capacidade. Isso está errado: um
// subconjunto é uma fabricação PARALELA e independente, não uma
// sequência dentro do roteiro do pai. Este carregador agora mantém só as
// ocorrências com caminhoBomItemIds vazio (o próprio produtoRaizId desta
// chamada) - subconjuntos ficam de fora por padrão, "prontos" para o
// orçamento principal. Ver a avaliação separada de um subconjunto
// específico ("simulação própria") mais abaixo, no laço principal.
//
// `recursoOriginalId` vem SEMPRE do recurso vinculado à operação do
// roteiro atual (bom_operacoes.recurso_produtivo_id) - nunca herda uma
// distribuição já decidida (não existe nenhuma aqui, ainda não houve
// aprovação). `recursosCompativeisPorPrioridade` vem de um lookup
// FRESCO em recurso_produtivo_compatibilidades (cadastro atual),
// reaproveitando compatibilidadesDosRecursos() de prepararEntradasMotor.ts
// - nunca uma segunda consulta/fórmula.
import type { SupabaseClient } from "@supabase/supabase-js";
import { compatibilidadesDosRecursos } from "../prepararEntradasMotor";
import { validarDataIso } from "./validacoes";
import { validarEstruturaFabricacaoProjeto } from "../validarEstruturaFabricacaoProjeto";
import { caminhoBomItemIdsParaChave, coletarGrafoOcorrenciasBom } from "./coletarGrafoOcorrenciasBom";
import { chaveOcorrenciaParaString } from "./chaveOcorrencia";
import { OperacaoSemRecursoError } from "@/modules/bom/lib/errors";
import type { NecessidadeCapacidadeFlexivel } from "./necessidadeCapacidadeFlexivel";

export interface DiagnosticoOrcamentoNovo {
  readonly empresaId: string;
  readonly projetoId: string;
  readonly motivo: string;
}

type ProjetoItemRow = { id: string; produto_id: string; quantidade: number };
type BomOperacaoDetalheRow = { id: string; tempo_estimado_minutos: number; recurso_produtivo_id: string | null };

interface OcorrenciaColetada {
  readonly chaveTrabalho: string;
  readonly projetoItemId: string;
  readonly bomOperacaoId: string;
  readonly quantidadeAcumulada: number;
}

/**
 * `disponivelAPartirDe` = a mesma data de referência do horizonte
 * (resolvida pelo CHAMADOR, mesmo parâmetro conceitual usado por
 * carregarConfirmadosComerciais.ts) - aplicada a TODAS as necessidades
 * deste projeto (não há, nesta simulação, uma data por operação
 * distinta da data de início do horizonte comercial).
 *
 * Orçamento sem itens vira DIAGNÓSTICO (necessidades=[]) - nunca lança.
 * `montarPrevisaoComercialProjeto.ts` já trata necessidades vazias como
 * "sem_necessidades" (nenhum cálculo, nunca uma data presumida) - esta
 * função só precisa reportar o motivo, nunca decidir o que a tela faz
 * com isso.
 */
export async function carregarNecessidadesOrcamentoNovo(
  client: SupabaseClient,
  empresaId: string,
  projetoId: string,
  disponivelAPartirDe: string,
): Promise<{ necessidades: readonly NecessidadeCapacidadeFlexivel[]; diagnosticos: readonly DiagnosticoOrcamentoNovo[] }> {
  validarDataIso(disponivelAPartirDe, "disponivelAPartirDe");

  const { data: itensData, error: erroItens } = await client
    .from("projeto_itens")
    .select("id,produto_id,quantidade")
    .eq("empresa_id", empresaId)
    .eq("projeto_id", projetoId)
    .eq("ativo", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (erroItens) {
    throw new Error(`Erro ao consultar projeto_itens do orçamento novo (projeto ${projetoId}): ${erroItens.message}`);
  }

  const itens = (itensData ?? []) as ProjetoItemRow[];
  if (itens.length === 0) {
    return {
      necessidades: [],
      diagnosticos: [{ empresaId, projetoId, motivo: "Orçamento sem itens - as necessidades do orçamento novo não podem ser calculadas." }],
    };
  }

  // Mesma validação de completude do roteiro já usada por
  // carregarBaseCenarios.ts (reaproveitada, nunca duplicada) - nunca
  // calcula necessidade sobre uma estrutura de fabricação incompleta
  // (subconjunto sem BOM resolvível, por exemplo).
  await validarEstruturaFabricacaoProjeto(client, projetoId);

  // --- Ocorrências direto do roteiro ATUAL - 1 travessia por projeto_item, sem grafo de precedência. ---
  const ocorrenciasColetadas: OcorrenciaColetada[] = [];
  for (const item of itens) {
    const grafo = await coletarGrafoOcorrenciasBom(client, {
      empresaId,
      projetoItemId: item.id,
      produtoRaizId: item.produto_id,
      quantidadeRaiz: Number(item.quantidade),
    });

    for (const ocorrencia of grafo.ocorrencias) {
      // Subconjunto considerado pronto por padrão (decisão confirmada com
      // o usuário): caminhoBomItemIds vazio = ocorrência do próprio
      // produtoRaizId desta chamada; não-vazio = ocorrência de um
      // subconjunto (profundidade > 0) alcançado pela travessia. O
      // orçamento novo do produto principal nunca soma as OPs de um
      // subconjunto às suas próprias - eram somadas e contadas junto até
      // aqui (achado real durante a Etapa B: bug ainda não corrigido).
      // "Simulação própria" de um subconjunto específico (quando o
      // orçamentista escolher) é uma chamada SEPARADA a
      // carregarNecessidadesOrcamentoNovo/coletarGrafoOcorrenciasBom, com
      // o produtoId do subconjunto como produtoRaizId - o mesmo filtro
      // abaixo automaticamente devolve só as OPs dele nessa chamada,
      // nunca misturadas com as do pai. Nunca as duas coisas na mesma
      // chamada - evita dupla contagem por construção, não por convenção.
      if (ocorrencia.chave.caminhoBomItemIds.length > 0) {
        continue;
      }

      const chaveCaminho = caminhoBomItemIdsParaChave(ocorrencia.chave.caminhoBomItemIds);
      const quantidadeAcumulada = grafo.quantidadeAcumuladaPorCaminho[chaveCaminho];
      if (quantidadeAcumulada === undefined) {
        // Defensivo - nunca deveria acontecer, coletarGrafoOcorrenciasBom
        // sempre preenche quantidadeAcumuladaPorCaminho para todo caminho
        // que aparece em ocorrencias.
        throw new RangeError(
          `Inconsistência interna: quantidadeAcumuladaPorCaminho não tem entrada para o caminho "${chaveCaminho}" (projetoItemId="${item.id}").`,
        );
      }
      ocorrenciasColetadas.push({
        chaveTrabalho: chaveOcorrenciaParaString(ocorrencia.chave),
        projetoItemId: item.id,
        bomOperacaoId: ocorrencia.bomOperacaoId,
        quantidadeAcumulada,
      });
    }
  }

  // --- Detalhe (tempo estimado + recurso original) de cada operação referenciada - 1 consulta em lote. ---
  const bomOperacaoIds = Array.from(new Set(ocorrenciasColetadas.map((o) => o.bomOperacaoId)));
  const { data: detalheData, error: erroDetalhe } = await client
    .from("bom_operacoes")
    .select("id,tempo_estimado_minutos,recurso_produtivo_id")
    .eq("empresa_id", empresaId)
    .in("id", bomOperacaoIds);
  if (erroDetalhe) {
    throw new Error(`Erro ao consultar detalhe de bom_operacoes do orçamento novo (projeto ${projetoId}): ${erroDetalhe.message}`);
  }

  const detalhePorBomOperacaoId = new Map(
    ((detalheData ?? []) as BomOperacaoDetalheRow[]).map((linha) => [linha.id, linha]),
  );

  const necessidadesSemCompatibilidade = ocorrenciasColetadas.map((oc) => {
    const detalhe = detalhePorBomOperacaoId.get(oc.bomOperacaoId);
    if (!detalhe) {
      throw new RangeError(
        `Operação ausente: bom_operacoes.id="${oc.bomOperacaoId}" não foi encontrada na consulta de detalhe (empresa_id="${empresaId}").`,
      );
    }
    if (!detalhe.recurso_produtivo_id) {
      throw new OperacaoSemRecursoError(oc.bomOperacaoId);
    }
    return {
      empresaId,
      projetoId,
      projetoItemId: oc.projetoItemId,
      chaveTrabalho: oc.chaveTrabalho,
      recursoOriginalId: detalhe.recurso_produtivo_id,
      horasNecessariasPadrao: (Number(detalhe.tempo_estimado_minutos) / 60) * oc.quantidadeAcumulada,
      disponivelAPartirDe,
    };
  });

  const recursosOriginais = Array.from(new Set(necessidadesSemCompatibilidade.map((n) => n.recursoOriginalId)));
  const compatibilidades = await compatibilidadesDosRecursos(client, recursosOriginais);

  const necessidades: NecessidadeCapacidadeFlexivel[] = necessidadesSemCompatibilidade.map((n) => ({
    ...n,
    recursosCompativeisPorPrioridade: (compatibilidades[n.recursoOriginalId] ?? []).map((c) => c.recursoId),
  }));

  return { necessidades, diagnosticos: [] };
}
