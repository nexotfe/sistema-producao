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

    const operacoesItem = await coletarEstruturaBom(client, bomId, Number(item.quantidade));
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

async function capacidadeDiariaDoRecurso(
  client: SupabaseClient,
  recursoId: string,
): Promise<number> {
  const { data, error } = await client
    .from("recursos_produtivos")
    .select("capacidade_horas_dia")
    .eq("id", recursoId)
    .single();

  if (error || !data || data.capacidade_horas_dia === null) {
    throw new RecursoSemCapacidadeCadastradaError(recursoId);
  }

  return Number(data.capacidade_horas_dia);
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

type CompatibilidadeRow = {
  recurso_origem_id: string;
  recurso_destino_id: string;
  prioridade: number;
};

async function compatibilidadesDosRecursos(
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

export async function prepararEntradasMotor(
  client: SupabaseClient,
  empresaId: string,
  projetoId: string,
  janelaInicio: string,
  janelaFim: string,
): Promise<EntradasMotorPreparadas> {
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

  const { diasProdutivos } = await contarDiasProdutivosNaJanela(
    client,
    empresaId,
    janelaInicio,
    janelaFim,
  );

  const capacidadeDisponivelInicial: Record<string, number> = {};
  const capacidadePorRecurso: Record<string, CapacidadeRecurso> = {};

  for (const recursoId of recursoIds) {
    const capacidadeDiaria = await capacidadeDiariaDoRecurso(client, recursoId);
    const produtividade = await produtividadeEfetivaDoRecurso(client, recursoId);

    // Capacidade Bruta = Dias Produtivos × Capacidade Diária
    // Capacidade Efetiva = Capacidade Bruta × Produtividade
    //   (Horas Adicionais/Modo de Produção ainda não existe no sistema
    //   - tratado como 0, não inventado aqui - por isso Capacidade
    //   Efetiva já seria "Capacidade Disponível" na fórmula original;
    //   aqui ela ainda NÃO tem o desconto de comprometido).
    const capacidadeBruta = diasProdutivos * capacidadeDiaria;
    const capacidadeEfetiva = capacidadeBruta * produtividade;

    const comprometidoInicial = await comprometidoDoRecurso(client, recursoId, projetoId);

    // Único lugar de todo o módulo onde comprometido é subtraído da
    // capacidade - o núcleo (motorAvaliacaoSequencial.ts) recebe este
    // valor já líquido e nunca subtrai comprometido de novo.
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

  return {
    entradas: {
      operacoesOrdenadas,
      // Já líquido (ver capacidadePorRecurso[recursoId].capacidadeDisponivelInicial)
      // - o núcleo não recebe mais `comprometido` separado, exatamente
      // para eliminar o risco de subtrair duas vezes.
      capacidadeDisponivelInicial,
      compatibilidades,
    },
    capacidadePorRecurso,
  };
}
