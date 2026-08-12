// Preparação das entradas do Motor - NÃO é uma fase que "termina antes"
// e é esquecida: monta o conjunto de dados que o Motor consulta durante
// toda a sua execução (Capacidade Disponível Inicial e Comprometido são
// consultados, não recalculados, mas ambos são preparados aqui, uma vez
// por simulação).
//
// Fronteira do Motor: esta função entrega "Capacidade Disponível
// Inicial" já pronta (Calendário → Dias Produtivos → Capacidade Diária
// → Produtividade → Horas Adicionais quando existir) - o Motor não
// recalcula nada disso.
//
// Sem "use client": recebe o client Supabase por parâmetro - portável
// entre o preview no navegador e a revalidação autoritativa no
// servidor (PAD-008, seções 7-8). Quem chama decide qual client
// passar; este módulo não importa nenhum fixo.
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverBomAtivo } from "@/modules/bom/lib/resolverBomAtivo";
import { coletarEstruturaBom } from "@/modules/bom/lib/coletarEstruturaBom";
import { contarDiasProdutivosNaJanela } from "./agregarDiasProdutivos";
import { validarEstruturaFabricacaoProjeto } from "./validarEstruturaFabricacaoProjeto";
import type { CandidatoRecurso, EntradasMotor, OperacaoRoteiro } from "./motorAvaliacaoSequencial";
import {
  ProjetoSemItensError,
  RecursoSemCapacidadeCadastradaError,
  RoteiroNaoEncontradoError,
} from "./errors";

type ProjetoItemRow = { id: string; produto_id: string; quantidade: number };

/**
 * Todas as operações do roteiro do projeto, na ordem em que o Motor
 * deve processá-las: por item de projeto (ordenado por `created_at`
 * ascendente - mesmo campo usado hoje pela tela de Orçamento para
 * ordenar itens de projeto, ver useOrcamento.ts; `pn` não é um
 * identificador confiável de ordem, não é usado para isso em nenhum
 * outro lugar do sistema), e dentro de cada item, pela ordem do
 * roteiro (`bom_operacoes.ordem`).
 */
async function coletarOperacoesDoProjeto(
  client: SupabaseClient,
  projetoId: string,
): Promise<OperacaoRoteiro[]> {
  const { data: itensData, error: erroItens } = await client
    .from("projeto_itens")
    .select("id,produto_id,quantidade")
    .eq("projeto_id", projetoId)
    .eq("ativo", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (erroItens) {
    throw new Error(
      `Erro ao consultar projeto_itens para projeto_id=${projetoId}: ${erroItens.message}`,
    );
  }

  const itens = (itensData ?? []) as ProjetoItemRow[];
  if (itens.length === 0) {
    throw new ProjetoSemItensError(projetoId);
  }

  const operacoes: OperacaoRoteiro[] = [];
  for (const item of itens) {
    const bomId = await resolverBomAtivo(client, item.produto_id);
    if (!bomId) {
      throw new RoteiroNaoEncontradoError(item.produto_id);
    }

    const operacoesItem = await coletarEstruturaBom(
      client,
      bomId,
      Number(item.quantidade),
      0,
      [item.produto_id],
    );
    for (const op of operacoesItem) {
      operacoes.push({
        bomOperacaoId: op.bomOperacaoId,
        recursoOriginalId: op.recursoProdutivoId,
        tempoEstimadoMinutos: op.tempoEstimadoMinutos,
        quantidade: op.quantidadeAcumulada,
      });
    }
  }

  return operacoes;
}

// Correção de N+1 (medida em produção: ~6s de ~7s do preview completo,
// dominados por este loop, antes desta correção): uma única consulta
// em lote (.in()) para todos os recursos envolvidos, em vez de uma
// consulta .single() por recurso. Mesma checagem de negócio de antes -
// capacidade ausente ou nula ainda lança RecursoSemCapacidadeCadastradaError
// para o PRIMEIRO recurso (na ordem de `recursoIds`, já determinística)
// que falhar, idêntico ao comportamento do loop sequencial anterior.
//
// Exportada (Fase 8a, DEC-007 §6.2) para carregarBaseCenarios.ts
// reaproveitar - única fonte de capacidade/produtividade/comprometido/
// compatibilidade por recurso, nunca duplicada entre o motor antigo e o
// motor de cenários (mesmo risco de divergência já registrado no
// cabeçalho de coletarEstruturaBom.ts). Comportamento desta função e
// de prepararBaseFixaMotor/prepararEntradasMotor (motor antigo)
// permanece inalterado - só a visibilidade mudou.
export async function capacidadesDiariasDosRecursos(
  client: SupabaseClient,
  recursoIds: string[],
): Promise<Record<string, number>> {
  if (recursoIds.length === 0) {
    return {};
  }

  const { data, error } = await client
    .from("recursos_produtivos")
    .select("id,capacidade_horas_dia")
    .in("id", recursoIds);

  if (error) {
    throw new Error(`Erro ao consultar capacidade_horas_dia em lote: ${error.message}`);
  }

  const capacidadePorId = new Map<string, number | null>(
    (data ?? []).map((linha) => [linha.id as string, linha.capacidade_horas_dia as number | null]),
  );

  const resultado: Record<string, number> = {};
  for (const recursoId of recursoIds) {
    const capacidade = capacidadePorId.get(recursoId);
    if (capacidade === undefined || capacidade === null) {
      throw new RecursoSemCapacidadeCadastradaError(recursoId);
    }
    resultado[recursoId] = Number(capacidade);
  }

  return resultado;
}

async function produtividadeEfetivaDoRecurso(
  client: SupabaseClient,
  recursoId: string,
): Promise<number> {
  const { data, error } = await client.rpc("calcular_produtividade_efetiva", {
    p_recurso_id: recursoId,
  });

  if (error) {
    throw new Error(
      `Erro ao chamar calcular_produtividade_efetiva para recurso ${recursoId}: ${error.message}`,
    );
  }

  // Produtividade não cadastrada (nem no recurso, nem no grupo) -
  // tratada como 100% (1) em vez de erro: diferente de capacidade
  // (obrigatória para o cálculo fazer sentido), produtividade sem
  // configuração é uma omissão aceitável, não um erro de cadastro.
  return data === null ? 1 : Number(data);
}

async function comprometidoDoRecurso(
  client: SupabaseClient,
  recursoId: string,
  projetoExcluidoId: string,
): Promise<number> {
  // v2 (Entrega 2): soma snapshots legados e novos (UNION, por formato -
  // ver migration da distribuição parcial) e só considera projetos com
  // situacao_comercial='pedido_recebido' - oportunidade comercial
  // (orçamento em elaboração, proposta, negociação, aprovação interna
  // da simulação) nunca compromete capacidade. calcular_comprometido_v1
  // permanece intocada como caminho de rollback, não é mais chamada
  // por este módulo.
  const { data, error } = await client.rpc("calcular_comprometido_v2", {
    p_recurso_produtivo_id: recursoId,
    p_projeto_excluido_id: projetoExcluidoId,
  });

  if (error) {
    throw new Error(
      `Erro ao chamar calcular_comprometido_v2 para recurso ${recursoId}: ${error.message}`,
    );
  }

  return Number(data ?? 0);
}

// Correção de N+1: calcular_produtividade_efetiva e calcular_comprometido_v2
// recebem exatamente 1 recurso por chamada (sem variante em lote no
// banco) - a lógica de cada chamada individual (produtividadeEfetivaDoRecurso/
// comprometidoDoRecurso) não muda nem é substituída; só deixam de ser
// aguardadas sequencialmente e passam a ser disparadas em paralelo.
// Promise.allSettled (não Promise.all) preserva a mesma semântica de
// erro do loop sequencial anterior: se mais de um recurso falhar, o
// erro relatado é sempre o do PRIMEIRO da lista `recursoIds` (ordem já
// determinística) - nunca o que "chegou primeiro" da rede, que seria
// não determinístico com execução paralela via Promise.all puro.
export async function produtividadesEComprometidosDosRecursos(
  client: SupabaseClient,
  recursoIds: string[],
  projetoId: string,
): Promise<{
  produtividadePorRecurso: Record<string, number>;
  comprometidoInicialPorRecurso: Record<string, number>;
}> {
  const resultados = await Promise.allSettled(
    recursoIds.map(async (recursoId) => {
      const [produtividade, comprometido] = await Promise.all([
        produtividadeEfetivaDoRecurso(client, recursoId),
        comprometidoDoRecurso(client, recursoId, projetoId),
      ]);
      return { recursoId, produtividade, comprometido };
    }),
  );

  for (const resultado of resultados) {
    if (resultado.status === "rejected") {
      throw resultado.reason;
    }
  }

  const produtividadePorRecurso: Record<string, number> = {};
  const comprometidoInicialPorRecurso: Record<string, number> = {};

  for (const resultado of resultados) {
    if (resultado.status === "fulfilled") {
      produtividadePorRecurso[resultado.value.recursoId] = resultado.value.produtividade;
      comprometidoInicialPorRecurso[resultado.value.recursoId] = resultado.value.comprometido;
    }
  }

  return { produtividadePorRecurso, comprometidoInicialPorRecurso };
}

type CompatibilidadeRow = {
  recurso_origem_id: string;
  recurso_destino_id: string;
  prioridade: number;
};

export async function compatibilidadesDosRecursos(
  client: SupabaseClient,
  recursoIds: string[],
): Promise<Record<string, CandidatoRecurso[]>> {
  if (recursoIds.length === 0) return {};

  const { data, error } = await client
    .from("recurso_produtivo_compatibilidades")
    .select("recurso_origem_id,recurso_destino_id,prioridade")
    .in("recurso_origem_id", recursoIds)
    .eq("ativo", true)
    .is("deleted_at", null)
    .order("recurso_origem_id", { ascending: true })
    .order("prioridade", { ascending: true });

  if (error) {
    throw new Error(`Erro ao consultar recurso_produtivo_compatibilidades: ${error.message}`);
  }

  const porOrigem: Record<string, CandidatoRecurso[]> = {};
  for (const linha of (data ?? []) as CompatibilidadeRow[]) {
    if (!porOrigem[linha.recurso_origem_id]) {
      porOrigem[linha.recurso_origem_id] = [];
    }
    porOrigem[linha.recurso_origem_id].push({
      recursoId: linha.recurso_destino_id,
      prioridade: linha.prioridade,
    });
  }

  return porOrigem;
}

// Entrega 2: nomes inequívocos, cada um documentando exatamente se já
// inclui ou não o desconto de comprometido - para nunca subtrair
// comprometido duas vezes nem esquecer de subtrair.
export interface CapacidadeRecurso {
  /** Dias produtivos × capacidade diária - sem produtividade, sem comprometido. */
  capacidadeBruta: number;
  /** Fração 0-1 (recursos_produtivos.produtividade / grupos_recursos.produtividade_padrao) - guardada crua para o cálculo de horas de máquina na camada de enriquecimento (executarSimulacao.ts). Nunca reentra no cálculo de capacidade remanescente. */
  produtividade: number;
  /** = capacidadeBruta × produtividade. Ainda SEM desconto de comprometido. */
  capacidadeEfetiva: number;
  /** calcular_comprometido_v2 para este recurso - horas já comprometidas por OUTROS projetos com pedido_recebido, ANTES desta simulação consumir qualquer saldo. */
  comprometidoInicial: number;
  /** = max(0, capacidadeEfetiva - comprometidoInicial). JÁ LÍQUIDO - é o único lugar onde este desconto acontece. Nunca subtrair comprometidoInicial de novo a partir daqui. */
  capacidadeDisponivelInicial: number;
}

export interface EntradasMotorPreparadas {
  entradas: EntradasMotor;
  /** Base completa por recurso (bruta, produtividade, efetiva, comprometido inicial, disponível inicial) - para a consolidação final (4d) e para o snapshot persistido reportarem cada valor separadamente, não só o líquido que o Motor consome. */
  capacidadePorRecurso: Record<string, CapacidadeRecurso>;
}

// Entrega 3 (Calculador Reverso, Fase 1): tudo que NÃO depende de uma
// janela específica (roteiro, compatibilidades, e a base de capacidade
// por recurso ANTES de multiplicar por dias produtivos) - calculado UMA
// VEZ. O calculador reverso reavalia dezenas de janelas candidatas
// (busca binária); refazer estas consultas a cada candidata seria um
// N+1 novo, multiplicado pela busca. calcularCapacidadeParaJanela,
// abaixo, é a parte pura (sem I/O) que muda por janela - o preview
// normal (prepararEntradasMotor) e o calculador reverso
// (estimarInicioNecessario.ts) chamam as MESMAS duas funções, nunca
// reimplementam a fórmula em paralelo.
export interface BaseFixaMotor {
  operacoesOrdenadas: OperacaoRoteiro[];
  recursoIds: string[];
  compatibilidades: Record<string, CandidatoRecurso[]>;
  capacidadeDiariaPorRecurso: Record<string, number>;
  produtividadePorRecurso: Record<string, number>;
  comprometidoInicialPorRecurso: Record<string, number>;
}

export async function prepararBaseFixaMotor(
  client: SupabaseClient,
  empresaId: string,
  projetoId: string,
): Promise<BaseFixaMotor> {
  // Requisito obrigatório (pendência registrada na entrega da Lista
  // Técnica Consolidada): estrutura de fabricação inválida bloqueia
  // ANTES de qualquer consulta de roteiro/recursos - mesmo ponto único
  // para preview (client do navegador) e revalidação autoritativa
  // (serverClient, ver orquestrarAprovacaoAutoritativa.ts).
  await validarEstruturaFabricacaoProjeto(client, projetoId);

  const operacoesOrdenadas = await coletarOperacoesDoProjeto(client, projetoId);

  const recursosOriginais = Array.from(
    new Set(operacoesOrdenadas.map((op) => op.recursoOriginalId)),
  ).sort();

  // O Motor pode considerar recursos compatíveis (destino), não só os
  // originais - precisam ter capacidade/comprometido pré-carregados
  // também, senão o Motor os trataria como capacidade 0.
  const compatibilidades = await compatibilidadesDosRecursos(client, recursosOriginais);
  const recursosDestino = Object.values(compatibilidades).flatMap((lista) =>
    lista.map((c) => c.recursoId),
  );
  const recursoIds = Array.from(new Set([...recursosOriginais, ...recursosDestino])).sort();

  // As duas fontes abaixo são independentes entre si (uma consulta em
  // lote; a outra, chamadas de RPC em paralelo) - disparadas juntas.
  const [capacidadeDiariaPorRecurso, { produtividadePorRecurso, comprometidoInicialPorRecurso }] =
    await Promise.all([
      capacidadesDiariasDosRecursos(client, recursoIds),
      produtividadesEComprometidosDosRecursos(client, recursoIds, projetoId),
    ]);

  return {
    operacoesOrdenadas,
    recursoIds,
    compatibilidades,
    capacidadeDiariaPorRecurso,
    produtividadePorRecurso,
    comprometidoInicialPorRecurso,
  };
}

/**
 * Pura, sem I/O - dada a base fixa (já carregada) e uma contagem de dias
 * produtivos para UMA janela candidata, calcula a capacidade disponível
 * inicial por recurso. Único lugar onde comprometido é subtraído da
 * capacidade - nem o preview normal, nem o calculador reverso (que chama
 * esta função uma vez por janela candidata da busca binária) subtraem
 * de novo em nenhum outro ponto.
 */
export function calcularCapacidadeParaJanela(
  baseFixa: BaseFixaMotor,
  diasProdutivos: number,
): { capacidadeDisponivelInicial: Record<string, number>; capacidadePorRecurso: Record<string, CapacidadeRecurso> } {
  const capacidadeDisponivelInicial: Record<string, number> = {};
  const capacidadePorRecurso: Record<string, CapacidadeRecurso> = {};

  for (const recursoId of baseFixa.recursoIds) {
    const capacidadeDiaria = baseFixa.capacidadeDiariaPorRecurso[recursoId];
    const produtividade = baseFixa.produtividadePorRecurso[recursoId];
    const comprometidoInicial = baseFixa.comprometidoInicialPorRecurso[recursoId];

    // Capacidade Bruta = Dias Produtivos × Capacidade Diária
    // Capacidade Efetiva = Capacidade Bruta × Produtividade
    //   (Horas Adicionais/Modo de Produção ainda não existe no sistema
    //   - tratado como 0, não inventado aqui - por isso Capacidade
    //   Efetiva já seria "Capacidade Disponível" na fórmula original;
    //   aqui ela ainda NÃO tem o desconto de comprometido).
    const capacidadeBruta = diasProdutivos * capacidadeDiaria;
    const capacidadeEfetiva = capacidadeBruta * produtividade;
    const capacidadeDisponivelInicialRecurso = Math.max(0, capacidadeEfetiva - comprometidoInicial);

    capacidadePorRecurso[recursoId] = {
      capacidadeBruta,
      produtividade,
      capacidadeEfetiva,
      comprometidoInicial,
      capacidadeDisponivelInicial: capacidadeDisponivelInicialRecurso,
    };
    capacidadeDisponivelInicial[recursoId] = capacidadeDisponivelInicialRecurso;
  }

  return { capacidadeDisponivelInicial, capacidadePorRecurso };
}

/**
 * Wrapper fino: preview normal (executarSimulacao.ts) continua chamando
 * só esta função, comportamento e contrato inalterados - por dentro,
 * agora delega para prepararBaseFixaMotor + calcularCapacidadeParaJanela,
 * compostas com contarDiasProdutivosNaJanela.
 */
export async function prepararEntradasMotor(
  client: SupabaseClient,
  empresaId: string,
  projetoId: string,
  janelaInicio: string,
  janelaFim: string,
): Promise<EntradasMotorPreparadas> {
  const baseFixa = await prepararBaseFixaMotor(client, empresaId, projetoId);

  const { diasProdutivos } = await contarDiasProdutivosNaJanela(
    client,
    empresaId,
    janelaInicio,
    janelaFim,
  );

  const { capacidadeDisponivelInicial, capacidadePorRecurso } = calcularCapacidadeParaJanela(
    baseFixa,
    diasProdutivos,
  );

  return {
    entradas: {
      operacoesOrdenadas: baseFixa.operacoesOrdenadas,
      // Já líquido (ver capacidadePorRecurso[recursoId].capacidadeDisponivelInicial)
      // - o núcleo não recebe mais `comprometido` separado, exatamente
      // para eliminar o risco de subtrair duas vezes.
      capacidadeDisponivelInicial,
      compatibilidades: baseFixa.compatibilidades,
    },
    capacidadePorRecurso,
  };
}
