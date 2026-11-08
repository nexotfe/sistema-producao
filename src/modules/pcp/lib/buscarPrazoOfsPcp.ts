// PCP — Etapa 52: conecta a interpretação pura da Etapa 51
// (classificarPrazoOfPcp) aos dados reais já calculados/persistidos
// pelo Motor, para um lote de OFs de uma só vez (nunca uma consulta por
// OF/linha da tabela). Client de SESSÃO (RLS normal em
// ordens_fabricacao_operacoes e em todas as tabelas que
// buscarProgramacaoVigentePcp já consulta) — nunca service_role. Não
// recalcula nada, não grava nada, não decide ainda nenhuma cor.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarProgramacaoVigentePcp, type ProgramacaoVigentePcp } from "./buscarProgramacaoVigentePcp";
import {
  classificarPrazoOfPcp,
  type InterpretacaoPrazoOfPcp,
  type ProgramacaoVigenteParaPrazoPcp,
} from "./interpretacao/classificarPrazoOfPcp";

function paraProgramacaoVigenteParaPrazo(programacao: ProgramacaoVigentePcp): ProgramacaoVigenteParaPrazoPcp {
  return {
    empresaCapacidadeVersaoOrigem: programacao.empresaCapacidadeVersaoOrigem,
    versaoCapacidadeAtual: programacao.versaoCapacidadeAtual,
    janelaInicio: programacao.janelaInicio,
    janelaFim: programacao.janelaFim,
    operacoes: programacao.operacoes.map((o) => ({
      ofId: o.ofId,
      opId: o.opId,
      status: o.statusCalculoMotor,
      dataFimPrevista: o.dataFimPrevista,
      deficitResidual: o.deficitResidualHorasPadrao,
      alocacoesLength: o.alocacoes.length,
    })),
  };
}

export interface DependenciasBuscarPrazoOfsPcp {
  /** Injeção só para teste (fixture) - em produção é sempre buscarProgramacaoVigentePcp real. */
  readonly buscarProgramacaoVigente?: typeof buscarProgramacaoVigentePcp;
}

// Etapa 53: mesmo limite de 500 ids por chamada aplicado pela própria
// RPC ops_resolvidas (migration 20261106130000) - dividir em lotes aqui
// evita depender de nunca ultrapassá-lo, em vez de só confiar no limite
// do lado do banco.
const TAMANHO_LOTE_OPS_RESOLVIDAS = 500;

function emLotes<T>(itens: readonly T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    lotes.push(itens.slice(i, i + tamanho));
  }
  return lotes;
}

/**
 * Para cada OF em `ofIds`, devolve a interpretação de prazo já calculada
 * pelo Motor (Etapa 51) - nunca a última operação cadastrada, nunca uma
 * data inventada. `opsNecessariasDaOf` vem de ordens_fabricacao_operacoes
 * (a cópia operacional real da OF, nunca o roteiro original) filtrada só
 * por nao_aplicavel=false, e agora (Etapa 53) também exclui operações já
 * resolvidas de verdade (apontamento real de 'finalizar'), via a RPC
 * oficial `ops_resolvidas` (Etapa 52C/D/E, aplicada e validada em
 * produção) - nunca reimplementa a regra de conclusão aqui.
 */
export async function buscarPrazoOfsPcp(
  client: SupabaseClient,
  ofIds: readonly string[],
  hoje: string,
  dependencias: DependenciasBuscarPrazoOfsPcp = {},
): Promise<Map<string, InterpretacaoPrazoOfPcp>> {
  const resultado = new Map<string, InterpretacaoPrazoOfPcp>();
  if (ofIds.length === 0) return resultado;

  const buscarProgramacao = dependencias.buscarProgramacaoVigente ?? buscarProgramacaoVigentePcp;

  // Uma única busca da programação vigente por carregamento (Etapa 52,
  // seção 2) - nunca repetida por OF.
  const programacao = await buscarProgramacao(client);
  const programacaoParaPrazo = programacao ? paraProgramacaoVigenteParaPrazo(programacao) : null;

  // Uma única consulta para TODAS as OFs pedidas (Etapa 52, seção 5) -
  // nunca uma por OF/linha. Traz TODAS as operações (aplicáveis ou não -
  // Etapa 53A precisa saber se existe alguma não aplicável, para nunca
  // confundir "nunca teve operação" com "só tem não aplicável"). RLS de
  // ordens_fabricacao_operacoes (empresa_id = empresa_atual_id()) cuida
  // do isolamento, sem filtro explícito aqui.
  const { data: operacoesRows, error } = await client
    .from("ordens_fabricacao_operacoes")
    .select("id, of_id, nao_aplicavel")
    .in("of_id", ofIds);
  if (error) {
    throw new Error(`buscarPrazoOfsPcp: erro ao consultar ordens_fabricacao_operacoes: ${error.message}`);
  }

  const opsCandidatasPorOf = new Map<string, string[]>();
  const existemNaoAplicaveisPorOf = new Set<string>();
  for (const linha of operacoesRows ?? []) {
    const ofId = linha.of_id as string;
    if (linha.nao_aplicavel as boolean) {
      existemNaoAplicaveisPorOf.add(ofId);
      continue;
    }
    const lista = opsCandidatasPorOf.get(ofId) ?? [];
    lista.push(linha.id as string);
    opsCandidatasPorOf.set(ofId, lista);
  }

  // Etapa 53: exclui operações já resolvidas de verdade, reutilizando a
  // RPC oficial em lotes de até 500 ids - nunca uma chamada por OP. Uma
  // falha em QUALQUER lote propaga (nunca é absorvida silenciosamente -
  // uma previsão calculada a partir de uma resposta parcial seria uma
  // previsão aparentemente confiável, mas não confiável de verdade).
  const todosOpIdsCandidatos = Array.from(opsCandidatasPorOf.values()).flat();
  const resolvidaPorOpId = new Map<string, boolean>();
  if (todosOpIdsCandidatos.length > 0) {
    const lotes = emLotes(todosOpIdsCandidatos, TAMANHO_LOTE_OPS_RESOLVIDAS);
    const respostas = await Promise.all(
      lotes.map((lote) => client.rpc("ops_resolvidas", { p_op_ids: lote })),
    );
    for (const { data: linhasResolvidas, error: erroResolvidas } of respostas) {
      if (erroResolvidas) {
        throw new Error(`buscarPrazoOfsPcp: erro ao consultar ops_resolvidas: ${erroResolvidas.message}`);
      }
      for (const linha of linhasResolvidas ?? []) {
        resolvidaPorOpId.set(linha.op_id as string, linha.resolvida as boolean);
      }
    }
  }

  for (const ofId of ofIds) {
    const opsCandidatas = opsCandidatasPorOf.get(ofId) ?? [];
    // Ausente do resultado de ops_resolvidas (id de outra empresa, já
    // excluída por outro motivo, ou qualquer lacuna) nunca é tratado
    // como resolvida - só um true explícito remove a operação do
    // conjunto necessário; qualquer outra coisa mantém ela pendente.
    const opsNecessarias = opsCandidatas.filter((opId) => resolvidaPorOpId.get(opId) !== true);
    const existemOperacoesResolvidas = opsCandidatas.some((opId) => resolvidaPorOpId.get(opId) === true);
    resultado.set(
      ofId,
      classificarPrazoOfPcp({
        ofId,
        opsNecessariasDaOf: opsNecessarias,
        existemOperacoesNaoAplicaveis: existemNaoAplicaveisPorOf.has(ofId),
        existemOperacoesResolvidas,
        programacaoVigente: programacaoParaPrazo,
        hoje,
      }),
    );
  }
  return resultado;
}
