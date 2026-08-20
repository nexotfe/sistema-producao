// DEC-007 §6.2/§18 - Fase 8a: "base congelada uma vez" - carrega, para
// UM projeto (todos os seus projeto_itens combinados), tudo que
// avaliarCenario.ts precisa para rodar N cenários sem tocar a rede de
// novo: grafo de ocorrências completo (via coletarGrafoOcorrenciasBom.ts,
// um por projeto_item, combinados aqui) + capacidade/produtividade/
// comprometido/compatibilidade por recurso (reaproveitando os mesmos
// helpers de prepararEntradasMotor.ts - motor antigo - nunca duplicados,
// ver comentário lá).
//
// Simplificação conhecida do recorte 8b, registrada no DEC-007 §6.2:
// comprometidoInicialPorRecurso é AGREGADO (calcular_comprometido_v2,
// não por dia) - avaliarCenario.ts precisa descontar esse total ANTES
// de disponibilizar qualquer hora normal/extra ao escalonador, e a
// interface precisa marcar todo resultado como estimativa preliminar.
// 8c substitui isso por reconstrução real por dia (multiprojeto/FIFO).
//
// Sessão autenticada obrigatória (DEC-007 §6.2): coletarGrafoOcorrenciasBom.ts
// chama lista_tecnica_nos_alcancaveis, que depende de empresa_atual_id()
// (por sua vez de auth.uid()) - o `client` recebido aqui precisa carregar
// uma sessão real (navegador autenticado, ou client de servidor com a
// sessão do usuário). Sem isso, a RPC devolve falso "sem BOM" (tem_bom=false)
// para todo nó, sem nenhum erro explícito - já observado e documentado
// na validação com dado real (produto 6158-02, §6.2).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChaveOcorrencia } from "./chaveOcorrencia";
import { chaveOcorrenciaParaString } from "./chaveOcorrencia";
import {
  caminhoBomItemIdsParaChave,
  coletarGrafoOcorrenciasBom,
} from "./coletarGrafoOcorrenciasBom";
import {
  construirGrafoOcorrencias,
  type BomOperacaoRow,
  type DependenciaOcorrencia,
  type OcorrenciaComContexto,
  type SubconjuntoUsado,
  type VinculoSubconjuntoOperacaoConsumidora,
} from "./grafoPrecedencia";
import {
  capacidadesDiariasDosRecursos,
  compatibilidadesDosRecursos,
  produtividadesEComprometidosDosRecursos,
} from "../prepararEntradasMotor";
import type { CandidatoRecurso } from "../motorAvaliacaoSequencial";
import { validarEstruturaFabricacaoProjeto } from "../validarEstruturaFabricacaoProjeto";
import { validarDataIso } from "./validacoes";
import { ProjetoSemItensError } from "../errors";
import { OperacaoSemRecursoError } from "@/modules/bom/lib/errors";
import type { ConvencaoHorasAdicionaisVigencia } from "./resolverConvencaoParaData";

type ProjetoItemRow = { id: string; produto_id: string; quantidade: number };
type BomOperacaoDetalheRow = { id: string; tempo_estimado_minutos: number; recurso_produtivo_id: string | null };

export interface OcorrenciaComTamanho {
  ocorrencia: OcorrenciaComContexto;
  /** (tempoEstimadoMinutos / 60) × quantidadeAcumulada - mesma fórmula de motorAvaliacaoSequencial.ts. */
  necessarioHorasPadrao: number;
  recursoOriginalId: string;
}

export interface BaseCenarios {
  empresaId: string;
  projetoId: string;
  ocorrencias: OcorrenciaComTamanho[];
  dependencias: DependenciaOcorrencia[];
  /** Ocorrências sem nenhuma predecessora - recebem a data candidata a cada tentativa do Calculador Reverso (§8). */
  chavesRaizOrcamentoNovo: ChaveOcorrencia[];
  /** Ocorrências sem nenhuma sucessora - cuja conclusão determina viabilidade do orçamento. */
  chavesFinaisOrcamentoNovo: ChaveOcorrencia[];
  recursoIds: string[];
  compatibilidades: Record<string, CandidatoRecurso[]>;
  capacidadeDiariaPorRecurso: Record<string, number>;
  produtividadePorRecurso: Record<string, number>;
  /**
   * AGREGADO (calcular_comprometido_v2), não por dia - simplificação
   * conhecida do recorte 8b (DEC-007 §6.2). avaliarCenario.ts consome
   * isto como desconto inicial, nunca como capacidade líquida já pronta.
   */
  comprometidoInicialPorRecurso: Record<string, number>;
  /**
   * recursos_produtivos.valor_hora por recurso (DEC-007, redesenho Fase
   * 8b - regras semanais/convenção coletiva) - base do custo automático
   * de hora adicional de recurso INTERNO (calcularValorHoraAdicional.ts).
   * Nunca usado para recurso externo/temporário (custeio próprio,
   * manual).
   */
  valorHoraPorRecurso: Record<string, number>;
  /**
   * TODAS as convenções coletivas cujo intervalo de vigência cruza
   * [disponibilidadeOriginalMaterial, prazoInterno] (nunca só "a vigente
   * agora" - o cenário pode atravessar uma mudança de vigência).
   * Resolução por data em memória via resolverConvencaoParaData.ts.
   * Array vazio = nenhuma convenção cadastrada cobrindo este período -
   * bloqueia regras de hora adicional em recurso interno, nunca assume
   * custo zero.
   */
  convencoesHorasAdicionais: ConvencaoHorasAdicionaisVigencia[];
  /**
   * Piso de disponibilidade de material por ocorrência-RAIZ
   * (chaveOcorrenciaParaString → data ISO) - restrição OPERACIONAL que
   * vale para TODO cenário avaliado sobre esta base, inclusive o
   * cenário-base (sem nenhuma decisão) - DEC-007 §6.2.7. Preenchido por
   * `carregarBaseCenarios()` a partir de `disponibilidadeOriginalMaterial`
   * (parâmetro OBRIGATÓRIO da função - nunca opcional, nunca `{}` por
   * omissão - ver comentário de `carregarBaseCenarios`), aplicado a TODA
   * ocorrência-raiz do projeto (produção só começa de verdade quando o
   * material chega). Ocorrências não-raiz nunca têm entrada aqui - o
   * piso delas continua vindo inteiramente da predecessora (escalonador,
   * `max(dataInicioJanela, fim da predecessora + 1 dia)`), nunca
   * diretamente de material. Copiado e congelado (`Object.freeze`) antes
   * de entrar na base - runtime, não só tipo.
   */
  restricaoMaterialPorChave: Readonly<Record<string, string>>;
}

function mergeOperacoesPorBomId(
  destino: Record<string, BomOperacaoRow[]>,
  origem: Record<string, BomOperacaoRow[]>,
): void {
  for (const [bomId, operacoes] of Object.entries(origem)) {
    if (!destino[bomId]) {
      destino[bomId] = [];
    }
    const idsExistentes = new Set(destino[bomId].map((op) => op.id));
    for (const op of operacoes) {
      if (!idsExistentes.has(op.id)) {
        destino[bomId].push(op);
        idsExistentes.add(op.id);
      }
    }
  }
}

function mergeSubconjuntosUsados(destino: SubconjuntoUsado[], origem: SubconjuntoUsado[]): void {
  const existentes = new Set(destino.map((s) => s.bomItemId));
  for (const subconjunto of origem) {
    if (!existentes.has(subconjunto.bomItemId)) {
      destino.push(subconjunto);
      existentes.add(subconjunto.bomItemId);
    }
  }
}

function mergeVinculosMestres(
  destino: VinculoSubconjuntoOperacaoConsumidora[],
  origem: VinculoSubconjuntoOperacaoConsumidora[],
): void {
  const existentes = new Set(destino.map((v) => v.bomItemIdSubconjunto));
  for (const vinculo of origem) {
    if (!existentes.has(vinculo.bomItemIdSubconjunto)) {
      destino.push(vinculo);
      existentes.add(vinculo.bomItemIdSubconjunto);
    }
  }
}

/**
 * recursos_produtivos.valor_hora por recurso (DEC-007, redesenho Fase
 * 8b) - consulta local, nova, não reaproveita prepararEntradasMotor.ts
 * (o motor antigo/Simulação Comercial não precisa de valor-hora para
 * custeio de capacidade - isso é um conceito exclusivo do redesenho de
 * Cenários). Mesmo padrão de 1 consulta em lote já usado no resto deste
 * módulo.
 */
async function valoresHoraPorRecurso(client: SupabaseClient, recursoIds: string[]): Promise<Record<string, number>> {
  if (recursoIds.length === 0) return {};

  const { data, error } = await client.from("recursos_produtivos").select("id,valor_hora").in("id", recursoIds);
  if (error) {
    throw new Error(`Erro ao consultar valor_hora de recursos_produtivos: ${error.message}`);
  }

  const resultado: Record<string, number> = {};
  for (const linha of (data ?? []) as { id: string; valor_hora: number }[]) {
    resultado[linha.id] = Number(linha.valor_hora);
  }
  return resultado;
}

type ConvencaoHorasAdicionaisRow = {
  percentual_segunda_sexta: number;
  percentual_sabado: number;
  percentual_domingo: number;
  percentual_feriado: number;
  vigente_desde: string;
  vigente_ate: string | null;
};

/**
 * Todas as convenções coletivas cujo intervalo de vigência cruza
 * [dataInicio, dataFim] - RPC `convencoes_horas_adicionais_no_periodo`
 * (migration 202608130001), nunca um SELECT ad-hoc duplicando a mesma
 * lógica de interseção de intervalo aqui - single source of truth no
 * banco, reaproveitada também pela tela administrativa da convenção.
 */
async function convencoesHorasAdicionaisNoPeriodo(
  client: SupabaseClient,
  dataInicio: string,
  dataFim: string,
): Promise<ConvencaoHorasAdicionaisVigencia[]> {
  const { data, error } = await client.rpc("convencoes_horas_adicionais_no_periodo", {
    p_data_inicio: dataInicio,
    p_data_fim: dataFim,
  });
  if (error) {
    throw new Error(`Erro ao consultar convenções de horas adicionais: ${error.message}`);
  }

  return ((data ?? []) as ConvencaoHorasAdicionaisRow[]).map((linha) => ({
    percentualSegundaSexta: Number(linha.percentual_segunda_sexta),
    percentualSabado: Number(linha.percentual_sabado),
    percentualDomingo: Number(linha.percentual_domingo),
    percentualFeriado: Number(linha.percentual_feriado),
    vigenteDesde: linha.vigente_desde,
    vigenteAte: linha.vigente_ate,
  }));
}

/**
 * "Base congelada uma vez" (DEC-007 §18/§6.2.7). `disponibilidadeOriginalMaterial`
 * é OBRIGATÓRIO - a data (calculada pela janela comercial, ANTES desta
 * chamada, fora deste módulo) que vira o piso de TODA ocorrência-raiz do
 * projeto (`restricaoMaterialPorChave`). Nunca opcional, nunca `{}` por
 * omissão: sem essa restrição, o cenário-base ficaria livre para
 * começar cedo demais, o que já causou um resultado incorreto
 * (diasGanhosVsBase negativo após negociação bem-sucedida - DEC-007
 * §6.2.6/§6.2.7) quando a restrição só existia como convenção manual
 * nos testes. Validada como data ISO genuína - string vazia/inválida
 * lança RangeError explícito, nunca silenciosamente ignorada.
 *
 * `prazoInterno` (DEC-007, redesenho Fase 8b) também é OBRIGATÓRIO -
 * junto com `disponibilidadeOriginalMaterial` (o início da janela
 * produtiva), delimita o período usado para carregar TODAS as
 * convenções coletivas de hora adicional que cruzam o cenário
 * (`convencoesHorasAdicionais` - nunca só "a vigente agora", o cenário
 * pode atravessar uma mudança de vigência).
 */
export async function carregarBaseCenarios(
  client: SupabaseClient,
  empresaId: string,
  projetoId: string,
  disponibilidadeOriginalMaterial: string,
  prazoInterno: string,
): Promise<BaseCenarios> {
  validarDataIso(disponibilidadeOriginalMaterial, "disponibilidadeOriginalMaterial");
  validarDataIso(prazoInterno, "prazoInterno");
  await validarEstruturaFabricacaoProjeto(client, projetoId);

  const { data: itensData, error: erroItens } = await client
    .from("projeto_itens")
    .select("id,produto_id,quantidade")
    .eq("empresa_id", empresaId)
    .eq("projeto_id", projetoId)
    .eq("ativo", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (erroItens) {
    throw new Error(`Erro ao consultar projeto_itens para projeto_id=${projetoId}: ${erroItens.message}`);
  }

  const itens = (itensData ?? []) as ProjetoItemRow[];
  if (itens.length === 0) {
    throw new ProjetoSemItensError(projetoId);
  }

  // --- 1. Grafo de ocorrências por item, combinados (dedupe por chave estável de cada estrutura). ---
  const operacoesPorBomId: Record<string, BomOperacaoRow[]> = {};
  const subconjuntosUsados: SubconjuntoUsado[] = [];
  const vinculosMestres: VinculoSubconjuntoOperacaoConsumidora[] = [];
  const ocorrenciasComQuantidade: { ocorrencia: OcorrenciaComContexto; quantidadeAcumulada: number }[] = [];

  for (const item of itens) {
    const grafo = await coletarGrafoOcorrenciasBom(client, {
      empresaId,
      projetoItemId: item.id,
      produtoRaizId: item.produto_id,
      quantidadeRaiz: Number(item.quantidade),
    });

    mergeOperacoesPorBomId(operacoesPorBomId, grafo.operacoesPorBomId);
    mergeSubconjuntosUsados(subconjuntosUsados, grafo.subconjuntosUsados);
    mergeVinculosMestres(vinculosMestres, grafo.vinculosMestres);

    for (const ocorrencia of grafo.ocorrencias) {
      const chaveCaminho = caminhoBomItemIdsParaChave(ocorrencia.chave.caminhoBomItemIds);
      const quantidadeAcumulada = grafo.quantidadeAcumuladaPorCaminho[chaveCaminho];
      if (quantidadeAcumulada === undefined) {
        // Defensivo - nunca deveria acontecer, coletarGrafoOcorrenciasBom sempre preenche
        // quantidadeAcumuladaPorCaminho para todo caminho que aparece em ocorrencias.
        throw new RangeError(
          `Inconsistência interna: quantidadeAcumuladaPorCaminho não tem entrada para o caminho "${chaveCaminho}" (projetoItemId="${item.id}").`,
        );
      }
      ocorrenciasComQuantidade.push({ ocorrencia, quantidadeAcumulada });
    }
  }

  // --- 2. Detalhe (tempo estimado + recurso) de cada operação referenciada - 1 consulta em lote, IDs globalmente únicos (PK). ---
  const bomOperacaoIds = Array.from(new Set(ocorrenciasComQuantidade.map((o) => o.ocorrencia.bomOperacaoId)));
  const { data: detalheData, error: erroDetalhe } = await client
    .from("bom_operacoes")
    .select("id,tempo_estimado_minutos,recurso_produtivo_id")
    .eq("empresa_id", empresaId)
    .in("id", bomOperacaoIds);

  if (erroDetalhe) {
    throw new Error(`Erro ao consultar detalhe de bom_operacoes para projeto_id=${projetoId}: ${erroDetalhe.message}`);
  }

  const detalhePorBomOperacaoId = new Map<string, { tempoEstimadoMinutos: number; recursoProdutivoId: string | null }>(
    ((detalheData ?? []) as BomOperacaoDetalheRow[]).map((linha) => [
      linha.id,
      { tempoEstimadoMinutos: Number(linha.tempo_estimado_minutos), recursoProdutivoId: linha.recurso_produtivo_id },
    ]),
  );

  const ocorrencias: OcorrenciaComTamanho[] = ocorrenciasComQuantidade.map(({ ocorrencia, quantidadeAcumulada }) => {
    const detalhe = detalhePorBomOperacaoId.get(ocorrencia.bomOperacaoId);
    if (!detalhe) {
      throw new RangeError(
        `Operação ausente: bom_operacoes.id="${ocorrencia.bomOperacaoId}" não foi encontrada na consulta de detalhe (empresa_id="${empresaId}").`,
      );
    }
    if (!detalhe.recursoProdutivoId) {
      throw new OperacaoSemRecursoError(ocorrencia.bomOperacaoId);
    }

    return {
      ocorrencia,
      necessarioHorasPadrao: (detalhe.tempoEstimadoMinutos / 60) * quantidadeAcumulada,
      recursoOriginalId: detalhe.recursoProdutivoId,
    };
  });

  // --- 3. Grafo de dependências - construído UMA VEZ, reaproveitado por todo cenário depois. ---
  const { dependencias } = construirGrafoOcorrencias({
    ocorrencias: ocorrencias.map((o) => o.ocorrencia),
    operacoesPorBomId,
    subconjuntosUsados,
    vinculosMestres,
  });

  const chavesComPredecessora = new Set(dependencias.map((d) => chaveOcorrenciaParaString(d.sucessora)));
  const chavesComSucessora = new Set(dependencias.map((d) => chaveOcorrenciaParaString(d.predecessora)));

  const chavesRaizOrcamentoNovo = ocorrencias
    .map((o) => o.ocorrencia.chave)
    .filter((chave) => !chavesComPredecessora.has(chaveOcorrenciaParaString(chave)));
  const chavesFinaisOrcamentoNovo = ocorrencias
    .map((o) => o.ocorrencia.chave)
    .filter((chave) => !chavesComSucessora.has(chaveOcorrenciaParaString(chave)));

  // --- 4. Capacidade/produtividade/comprometido/compatibilidade - mesmos helpers do motor antigo, nunca duplicados. ---
  const recursosOriginais = Array.from(new Set(ocorrencias.map((o) => o.recursoOriginalId))).sort();
  const compatibilidades = await compatibilidadesDosRecursos(client, recursosOriginais);
  const recursosDestino = Object.values(compatibilidades).flatMap((lista) => lista.map((c) => c.recursoId));
  const recursoIds = Array.from(new Set([...recursosOriginais, ...recursosDestino])).sort();

  const [
    capacidadeDiariaPorRecurso,
    { produtividadePorRecurso, comprometidoInicialPorRecurso },
    valorHoraPorRecurso,
    convencoesHorasAdicionais,
  ] = await Promise.all([
    capacidadesDiariasDosRecursos(client, recursoIds),
    produtividadesEComprometidosDosRecursos(client, recursoIds, projetoId),
    valoresHoraPorRecurso(client, recursoIds),
    convencoesHorasAdicionaisNoPeriodo(client, disponibilidadeOriginalMaterial, prazoInterno),
  ]);

  // --- 5. Piso de material - a MESMA disponibilidadeOriginalMaterial em
  // TODA ocorrência-raiz (produção só começa de verdade quando o
  // material chega, independente de qual raiz é) - chavesRaizOrcamentoNovo
  // já veio deduplicada por chave (projetoItemId distingue itens
  // diferentes que reaproveitam o mesmo bomId), então nunca há colisão
  // aqui. Copiado para um objeto novo e congelado - nunca reexpõe um
  // Record mutável, mesma disciplina de imutabilidade em runtime do
  // resto do módulo (ver copiarECongelarChave em avaliarCenario.ts).
  const restricaoMaterialPorChave = Object.freeze(
    Object.fromEntries(chavesRaizOrcamentoNovo.map((chave) => [chaveOcorrenciaParaString(chave), disponibilidadeOriginalMaterial])),
  );

  return {
    empresaId,
    projetoId,
    ocorrencias,
    dependencias,
    chavesRaizOrcamentoNovo,
    chavesFinaisOrcamentoNovo,
    recursoIds,
    compatibilidades,
    capacidadeDiariaPorRecurso,
    produtividadePorRecurso,
    comprometidoInicialPorRecurso,
    valorHoraPorRecurso,
    convencoesHorasAdicionais,
    restricaoMaterialPorChave,
  };
}
