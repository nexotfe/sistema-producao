// NEXOTFE — Operações de Produção (Fase 1, só leitura): lê o
// planejamento operacional VIGENTE da OP (Y) em ordens_fabricacao_operacoes
// - nunca o roteiro original (X, bom_operacoes) nem a execução real (Z,
// of_apontamentos). Client de SESSÃO (SELECT já concedido a authenticated,
// RLS tenant "empresa_id = empresa_atual_id()" - PCP-P6E, migration
// 20261015120000) - nunca service_role.
//
// "Situação" é provisória nesta fase (3 estados, decisão do usuário):
//   - "nao_aplicavel": coluna ordens_fabricacao_operacoes.nao_aplicavel,
//     verificada ANTES de qualquer outra coisa - uma OP não aplicável
//     nunca é apresentada como concluída por execução, mesmo que
//     op_esta_resolvida (por trás de ops_resolvidas) também a considere
//     resolvida por esse mesmo motivo.
//   - "concluida": ops_resolvidas (RPC oficial, Etapa 52E, já em
//     produção, GRANT EXECUTE a authenticated, filtro de empresa
//     interno) devolve resolvida=true - nunca reimplementado aqui.
//   - "pendente": nem nao_aplicavel, nem resolvida - significa SÓ que a
//     OP ainda não foi resolvida; pode já estar iniciada (distinção
//     "em andamento"/"pausada" fica para fase posterior, depende de
//     of_apontamentos_efetivos, hoje service_role-only).
import type { SupabaseClient } from "@supabase/supabase-js";

export type SituacaoOperacaoOfPcp = "nao_aplicavel" | "concluida" | "pendente";

/** origem="roteiro": instanciada do Roteiro (BOM) vigente no nascimento da OF. origem="y": criada operacionalmente (PCP), nunca existiu no Roteiro. */
export type OrigemOperacaoOfPcp = "roteiro" | "y";

export interface OperacaoOfPcp {
  readonly opId: string;
  readonly codigoOperacional: string;
  readonly descricao: string;
  readonly sequencia: number;
  readonly recursoId: string | null;
  readonly recursoNome: string | null;
  readonly tempoPlanejadoMinutos: number | null;
  readonly situacao: SituacaoOperacaoOfPcp;
  readonly motivoNaoAplicavel: string | null;
  readonly origem: OrigemOperacaoOfPcp;
  /**
   * Etapa 59A — existe pelo menos 1 linha em of_apontamentos para esta OP
   * (apontamento cru, não "efetivo" - só a EXISTÊNCIA importa aqui, nunca
   * o conteúdo/correções). "pendente" sozinho NUNCA prova ausência de
   * apontamento (a OP pode já estar iniciada) - este campo é o sinal
   * real para decidir se Editar/Remover devem ficar bloqueados, mesmo
   * reaproveitando exatamente a mesma regra que alterar_y_operacao/
   * marcar_op_nao_aplicavel já aplicam no banco (produção confirmada).
   */
  readonly temApontamento: boolean;
}

export type RespostaOperacoesOfPcp =
  | { readonly ok: true; readonly operacoes: readonly OperacaoOfPcp[] }
  | { readonly ok: false; readonly motivo: "erro_desconhecido" };

// Mesmo limite de 500 ids/chamada aplicado pela própria RPC (migration
// 20261106130000) - mesmo padrão de divisão em lotes já usado em
// buscarPrazoOfsPcp.ts, nunca presumindo o limite só do lado do banco.
const TAMANHO_LOTE_OPS_RESOLVIDAS = 500;

function emLotes<T>(itens: readonly T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    lotes.push(itens.slice(i, i + tamanho));
  }
  return lotes;
}

function logErroTecnicoOperacoesOfPcp(origem: string, erro: { message: string; code?: string }): void {
  console.error(`buscarOperacoesOfPcp: falha tecnica em ${origem}`, { code: erro.code, message: erro.message });
}

export async function buscarOperacoesOfPcp(client: SupabaseClient, ofId: string): Promise<RespostaOperacoesOfPcp> {
  const { data: opsRows, error: erroOps } = await client
    .from("ordens_fabricacao_operacoes")
    .select(
      "id, codigo_operacional, descricao, sequencia_vigente, recurso_vigente_id, tempo_vigente_minutos, nao_aplicavel, motivo_nao_aplicavel, origem",
    )
    .eq("of_id", ofId)
    .order("sequencia_vigente", { ascending: true });

  if (erroOps) {
    logErroTecnicoOperacoesOfPcp("ordens_fabricacao_operacoes", erroOps);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  const linhasOp = opsRows ?? [];
  if (linhasOp.length === 0) {
    return { ok: true, operacoes: [] };
  }

  const recursoIds = Array.from(
    new Set(linhasOp.map((linha) => linha.recurso_vigente_id as string | null).filter((id): id is string => id !== null)),
  );
  const { data: recursosRows, error: erroRecursos } =
    recursoIds.length > 0
      ? await client.from("recursos_produtivos").select("id, nome").in("id", recursoIds)
      : { data: [] as { id: string; nome: string }[], error: null };
  if (erroRecursos) {
    logErroTecnicoOperacoesOfPcp("recursos_produtivos", erroRecursos);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  const nomeRecursoPorId = new Map((recursosRows ?? []).map((linha) => [linha.id as string, linha.nome as string]));

  // Prioridade a nao_aplicavel (condição 3): só consulta ops_resolvidas
  // para as OPs que ainda dependem dessa verificação - uma OP
  // não aplicável nunca precisa (nem deve) ser confirmada como
  // "concluída por execução".
  const opIdsParaResolver = linhasOp
    .filter((linha) => !(linha.nao_aplicavel as boolean))
    .map((linha) => linha.id as string);

  const resolvidaPorOpId = new Map<string, boolean>();
  if (opIdsParaResolver.length > 0) {
    const lotes = emLotes(opIdsParaResolver, TAMANHO_LOTE_OPS_RESOLVIDAS);
    const respostas = await Promise.all(lotes.map((lote) => client.rpc("ops_resolvidas", { p_op_ids: lote })));
    for (const { data: linhasResolvidas, error: erroResolvidas } of respostas) {
      if (erroResolvidas) {
        logErroTecnicoOperacoesOfPcp("ops_resolvidas", erroResolvidas);
        return { ok: false, motivo: "erro_desconhecido" };
      }
      for (const linha of linhasResolvidas ?? []) {
        resolvidaPorOpId.set(linha.op_id as string, linha.resolvida as boolean);
      }
    }
  }

  // Etapa 59A — existência de apontamento real por OP (cru, só para
  // saber SE existe ao menos 1 linha - mesmo sinal que alterar_y_operacao
  // /marcar_op_nao_aplicavel já usam em produção para bloquear edição).
  const todosOpIds = linhasOp.map((linha) => linha.id as string);
  const { data: apontamentosRows, error: erroApontamentos } = await client
    .from("of_apontamentos")
    .select("op_id")
    .in("op_id", todosOpIds);
  if (erroApontamentos) {
    logErroTecnicoOperacoesOfPcp("of_apontamentos", erroApontamentos);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  const opIdsComApontamento = new Set((apontamentosRows ?? []).map((linha) => linha.op_id as string));

  const operacoes: OperacaoOfPcp[] = linhasOp.map((linha) => {
    const opId = linha.id as string;
    const naoAplicavel = linha.nao_aplicavel as boolean;
    const recursoId = linha.recurso_vigente_id as string | null;

    let situacao: SituacaoOperacaoOfPcp;
    if (naoAplicavel) {
      situacao = "nao_aplicavel";
    } else if (resolvidaPorOpId.get(opId) === true) {
      situacao = "concluida";
    } else {
      situacao = "pendente";
    }

    return {
      opId,
      codigoOperacional: linha.codigo_operacional as string,
      descricao: linha.descricao as string,
      sequencia: linha.sequencia_vigente as number,
      recursoId,
      recursoNome: recursoId ? nomeRecursoPorId.get(recursoId) ?? null : null,
      tempoPlanejadoMinutos: (linha.tempo_vigente_minutos as number | null) ?? null,
      situacao,
      motivoNaoAplicavel: (linha.motivo_nao_aplicavel as string | null) ?? null,
      origem: linha.origem as OrigemOperacaoOfPcp,
      temApontamento: opIdsComApontamento.has(opId),
    };
  });

  return { ok: true, operacoes };
}
