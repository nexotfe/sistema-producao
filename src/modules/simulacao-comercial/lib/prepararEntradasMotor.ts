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
"use client";

import { supabase } from "@/lib/supabaseClient";
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
async function coletarOperacoesDoProjeto(projetoId: string): Promise<OperacaoRoteiro[]> {
  const { data: itensData, error: erroItens } = await supabase
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
    const bomId = await resolverBomAtivo(item.produto_id);
    if (!bomId) {
      throw new RoteiroNaoEncontradoError(item.produto_id);
    }

    const operacoesItem = await coletarEstruturaBom(bomId, Number(item.quantidade));
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

async function capacidadeDiariaDoRecurso(recursoId: string): Promise<number> {
  const { data, error } = await supabase
    .from("recursos_produtivos")
    .select("capacidade_horas_dia")
    .eq("id", recursoId)
    .single();

  if (error || !data || data.capacidade_horas_dia === null) {
    throw new RecursoSemCapacidadeCadastradaError(recursoId);
  }

  return Number(data.capacidade_horas_dia);
}

async function produtividadeEfetivaDoRecurso(recursoId: string): Promise<number> {
  const { data, error } = await supabase.rpc("calcular_produtividade_efetiva", {
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

async function comprometidoDoRecurso(recursoId: string, projetoExcluidoId: string): Promise<number> {
  const { data, error } = await supabase.rpc("calcular_comprometido_v1", {
    p_recurso_produtivo_id: recursoId,
    p_projeto_excluido_id: projetoExcluidoId,
  });

  if (error) {
    throw new Error(
      `Erro ao chamar calcular_comprometido_v1 para recurso ${recursoId}: ${error.message}`,
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
  recursoIds: string[],
): Promise<Record<string, CandidatoRecurso[]>> {
  if (recursoIds.length === 0) return {};

  const { data, error } = await supabase
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

export interface CapacidadeRecurso {
  capacidadeBruta: number;
  capacidadeEfetiva: number;
  capacidadeDisponivel: number;
}

export interface EntradasMotorPreparadas {
  entradas: EntradasMotor;
  /** Necessário para a consolidação final (4d) reportar os 3 sub-valores de capacidade separadamente, não só o total que o Motor consome. */
  capacidadePorRecurso: Record<string, CapacidadeRecurso>;
}

export async function prepararEntradasMotor(
  empresaId: string,
  projetoId: string,
  janelaInicio: string,
  janelaFim: string,
): Promise<EntradasMotorPreparadas> {
  const operacoesOrdenadas = await coletarOperacoesDoProjeto(projetoId);

  const recursosOriginais = Array.from(
    new Set(operacoesOrdenadas.map((op) => op.recursoOriginalId)),
  ).sort();

  // O Motor pode considerar recursos compatíveis (destino), não só os
  // originais - precisam ter capacidade/comprometido pré-carregados
  // também, senão o Motor os trataria como capacidade 0.
  const compatibilidades = await compatibilidadesDosRecursos(recursosOriginais);
  const recursosDestino = Object.values(compatibilidades).flatMap((lista) =>
    lista.map((c) => c.recursoId),
  );
  const recursoIds = Array.from(new Set([...recursosOriginais, ...recursosDestino])).sort();

  const { diasProdutivos } = await contarDiasProdutivosNaJanela(
    empresaId,
    janelaInicio,
    janelaFim,
  );

  const capacidadeDisponivelInicial: Record<string, number> = {};
  const comprometido: Record<string, number> = {};
  const capacidadePorRecurso: Record<string, CapacidadeRecurso> = {};

  for (const recursoId of recursoIds) {
    const capacidadeDiaria = await capacidadeDiariaDoRecurso(recursoId);
    const produtividade = await produtividadeEfetivaDoRecurso(recursoId);

    // Capacidade Bruta = Dias Produtivos × Capacidade Diária
    // Capacidade Efetiva = Capacidade Bruta × Produtividade
    // Capacidade Disponível = Capacidade Efetiva + Horas Adicionais
    //   (Horas Adicionais/Modo de Produção ainda não existe no sistema
    //   - tratado como 0, não inventado aqui).
    const capacidadeBruta = diasProdutivos * capacidadeDiaria;
    const capacidadeEfetiva = capacidadeBruta * produtividade;
    const capacidadeDisponivel = capacidadeEfetiva;

    capacidadePorRecurso[recursoId] = {
      capacidadeBruta,
      capacidadeEfetiva,
      capacidadeDisponivel,
    };
    capacidadeDisponivelInicial[recursoId] = capacidadeDisponivel;

    comprometido[recursoId] = await comprometidoDoRecurso(recursoId, projetoId);
  }

  return {
    entradas: {
      operacoesOrdenadas,
      capacidadeDisponivelInicial,
      comprometido,
      compatibilidades,
    },
    capacidadePorRecurso,
  };
}
