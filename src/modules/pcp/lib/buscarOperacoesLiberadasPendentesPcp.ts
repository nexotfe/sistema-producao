// NEXOTFE — Planejamento Diário (PCP): leitura das operações PENDENTES
// das OFs formalmente LIBERADAS (estado_execucao='liberada') - fonte
// independente do último cálculo do Motor (nunca pcp_programacao_operacoes/
// status_calculo_motor, confirmado inadequado: aquela tabela é um
// snapshot congelado da última execução, e uma OF liberada depois dela
// simplesmente não apareceria lá).
//
// Situação da OP (pendente/concluída/não aplicável) usa EXATAMENTE a
// mesma lógica já validada em buscarOperacoesOfPcp.ts - prioridade a
// nao_aplicavel, depois a RPC oficial ops_resolvidas - nunca
// reimplementada aqui. Client de SESSÃO (RLS normal) - nunca service_role.
import type { SupabaseClient } from "@supabase/supabase-js";

const TAMANHO_LOTE = 500;

export interface ItemOperacaoLiberadaPendentePcp {
  readonly opId: string;
  readonly codigoOperacional: string;
  readonly descricao: string;
  readonly ofId: string;
  readonly numeroOf: string;
  readonly projetoId: string;
  /** ordens_fabricacao_operacoes.recurso_vigente_id - recurso planejado da própria OP, nunca uma alocação do Motor. */
  readonly recursoId: string | null;
}

export type RespostaOperacoesLiberadasPendentesPcp =
  | { readonly ok: true; readonly itens: readonly ItemOperacaoLiberadaPendentePcp[]; readonly nomeEmpresa: string }
  | { readonly ok: false; readonly motivo: "erro_desconhecido" };

function emLotes<T>(itens: readonly T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    lotes.push(itens.slice(i, i + tamanho));
  }
  return lotes;
}

function logErroTecnico(origem: string, erro: { message: string; code?: string }): void {
  console.error(`buscarOperacoesLiberadasPendentesPcp: falha tecnica em ${origem}`, { code: erro.code, message: erro.message });
}

export async function buscarOperacoesLiberadasPendentesPcp(client: SupabaseClient): Promise<RespostaOperacoesLiberadasPendentesPcp> {
  // Nome da empresa (RLS "empresas select propria empresa" já restringe
  // a exatamente a própria linha) - mesmo padrão trivial já usado em
  // buscarProgramacaoVigentePcp.ts, nunca uma segunda fonte de verdade.
  const { data: empresaRow, error: erroEmpresa } = await client.from("empresas").select("nome").maybeSingle();
  if (erroEmpresa) {
    logErroTecnico("empresas", erroEmpresa);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  const nomeEmpresa = empresaRow?.nome ?? "";

  const { data: ofsRows, error: erroOfs } = await client
    .from("ordens_fabricacao")
    .select("id, numero_of, projeto_id")
    .eq("estado_execucao", "liberada");
  if (erroOfs) {
    logErroTecnico("ordens_fabricacao", erroOfs);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  const ofs = ofsRows ?? [];
  if (ofs.length === 0) return { ok: true, itens: [], nomeEmpresa };

  const numeroOfPorId = new Map(ofs.map((of) => [of.id as string, of.numero_of as string]));
  const projetoIdPorOfId = new Map(ofs.map((of) => [of.id as string, of.projeto_id as string]));
  const ofIds = ofs.map((of) => of.id as string);

  const linhasOp: { id: string; codigo_operacional: string; descricao: string; of_id: string; recurso_vigente_id: string | null; nao_aplicavel: boolean }[] = [];
  for (const lote of emLotes(ofIds, TAMANHO_LOTE)) {
    const { data, error } = await client
      .from("ordens_fabricacao_operacoes")
      .select("id, codigo_operacional, descricao, of_id, recurso_vigente_id, nao_aplicavel")
      .in("of_id", lote);
    if (error) {
      logErroTecnico("ordens_fabricacao_operacoes", error);
      return { ok: false, motivo: "erro_desconhecido" };
    }
    linhasOp.push(...(data ?? []));
  }

  if (linhasOp.length === 0) return { ok: true, itens: [], nomeEmpresa };

  // Mesma prioridade da Etapa 59A: só consulta ops_resolvidas para quem
  // ainda depende dessa checagem - nao_aplicavel nunca passa por ela.
  const opIdsParaResolver = linhasOp.filter((linha) => !linha.nao_aplicavel).map((linha) => linha.id);
  const resolvidaPorOpId = new Map<string, boolean>();
  for (const lote of emLotes(opIdsParaResolver, TAMANHO_LOTE)) {
    if (lote.length === 0) continue;
    const { data, error } = await client.rpc("ops_resolvidas", { p_op_ids: lote });
    if (error) {
      logErroTecnico("ops_resolvidas", error);
      return { ok: false, motivo: "erro_desconhecido" };
    }
    for (const linha of data ?? []) {
      resolvidaPorOpId.set(linha.op_id as string, linha.resolvida as boolean);
    }
  }

  const itens: ItemOperacaoLiberadaPendentePcp[] = linhasOp
    .filter((linha) => !linha.nao_aplicavel && resolvidaPorOpId.get(linha.id) !== true)
    .map((linha) => ({
      opId: linha.id,
      codigoOperacional: linha.codigo_operacional,
      descricao: linha.descricao,
      ofId: linha.of_id,
      numeroOf: numeroOfPorId.get(linha.of_id) ?? "",
      projetoId: projetoIdPorOfId.get(linha.of_id) ?? "",
      recursoId: linha.recurso_vigente_id,
    }));

  return { ok: true, itens, nomeEmpresa };
}
