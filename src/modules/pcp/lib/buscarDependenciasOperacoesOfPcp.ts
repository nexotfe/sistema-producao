// Etapa 59A — leitura real de of_operacao_dependencias para as OPs de
// uma OF. Client de SESSÃO (SELECT concedido a authenticated, RLS tenant
// "empresa_id = empresa_atual_id()" - PCP-P6E, migration 20261015120000)
// - nunca service_role. Só leitura: nenhuma dependência é criada/removida
// aqui (isso continua exclusivo de alterar_dependencia_operacao).
//
// marcar_op_nao_aplicavel (produção, confirmado via pg_get_functiondef)
// já rejeita a OP se ela aparecer como op_origem_id OU op_dependente_id
// em qualquer linha - esta função lê exatamente essas mesmas linhas,
// para a interface mostrar o impedimento ANTES do clique, nunca só
// depois de um erro do banco.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DependenciaRelacionadaOfPcp {
  readonly opRelacionadaId: string;
  readonly codigoOperacionalRelacionada: string;
  /** "origem": esta OP é pré-requisito da relacionada. "dependente": a relacionada é pré-requisito desta OP. */
  readonly papel: "origem" | "dependente";
}

export type RespostaDependenciasOperacoesOfPcp =
  | { readonly ok: true; readonly dependenciasPorOpId: ReadonlyMap<string, readonly DependenciaRelacionadaOfPcp[]> }
  | { readonly ok: false; readonly motivo: "erro_desconhecido" };

function logErroTecnicoDependenciasOfPcp(origem: string, erro: { message: string; code?: string }): void {
  console.error(`buscarDependenciasOperacoesOfPcp: falha tecnica em ${origem}`, { code: erro.code, message: erro.message });
}

export async function buscarDependenciasOperacoesOfPcp(
  client: SupabaseClient,
  opIds: readonly string[],
): Promise<RespostaDependenciasOperacoesOfPcp> {
  const dependenciasPorOpId = new Map<string, DependenciaRelacionadaOfPcp[]>();
  if (opIds.length === 0) {
    return { ok: true, dependenciasPorOpId };
  }

  const [{ data: comoOrigem, error: erroOrigem }, { data: comoDependente, error: erroDependente }] = await Promise.all([
    client.from("of_operacao_dependencias").select("op_origem_id, op_dependente_id").in("op_origem_id", opIds as string[]),
    client.from("of_operacao_dependencias").select("op_origem_id, op_dependente_id").in("op_dependente_id", opIds as string[]),
  ]);

  if (erroOrigem) {
    logErroTecnicoDependenciasOfPcp("of_operacao_dependencias (origem)", erroOrigem);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (erroDependente) {
    logErroTecnicoDependenciasOfPcp("of_operacao_dependencias (dependente)", erroDependente);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  const linhasOrigem = comoOrigem ?? [];
  const linhasDependente = comoDependente ?? [];
  const idsRelacionados = Array.from(
    new Set([
      ...linhasOrigem.map((l) => l.op_dependente_id as string),
      ...linhasDependente.map((l) => l.op_origem_id as string),
    ]),
  );

  const { data: opsRelacionadas, error: erroOps } =
    idsRelacionados.length > 0
      ? await client.from("ordens_fabricacao_operacoes").select("id, codigo_operacional").in("id", idsRelacionados)
      : { data: [] as { id: string; codigo_operacional: string }[], error: null };
  if (erroOps) {
    logErroTecnicoDependenciasOfPcp("ordens_fabricacao_operacoes (relacionadas)", erroOps);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  const codigoPorOpId = new Map((opsRelacionadas ?? []).map((l) => [l.id as string, l.codigo_operacional as string]));

  function adicionar(opId: string, dep: DependenciaRelacionadaOfPcp) {
    const atual = dependenciasPorOpId.get(opId) ?? [];
    atual.push(dep);
    dependenciasPorOpId.set(opId, atual);
  }

  // Esta OP é origem (pré-requisito) de op_dependente_id.
  for (const linha of linhasOrigem) {
    const opId = linha.op_origem_id as string;
    const relacionadaId = linha.op_dependente_id as string;
    adicionar(opId, {
      opRelacionadaId: relacionadaId,
      codigoOperacionalRelacionada: codigoPorOpId.get(relacionadaId) ?? relacionadaId,
      papel: "origem",
    });
  }

  // Esta OP depende de op_origem_id.
  for (const linha of linhasDependente) {
    const opId = linha.op_dependente_id as string;
    const relacionadaId = linha.op_origem_id as string;
    adicionar(opId, {
      opRelacionadaId: relacionadaId,
      codigoOperacionalRelacionada: codigoPorOpId.get(relacionadaId) ?? relacionadaId,
      papel: "dependente",
    });
  }

  return { ok: true, dependenciasPorOpId };
}
