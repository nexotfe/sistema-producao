"use server";
// Etapa 66E (Fase B) — Server Action real de remoção explícita de
// dependência entre OPs (alterar_dependencia_operacao, p_acao='remover',
// migration candidata 20261108110000 — auditada e validada nas Etapas
// 66B/66C/66D, ainda NÃO aplicada em produção, só no sandbox local).
// Mesmo fluxo de 7 passos de adicionarDependenciaOperacaoOfPcpAction.ts
// - ver aquele arquivo para o detalhamento completo de cada passo. Só a
// permissão exigida e o p_acao mudam.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";
import {
  persistirAlteracaoDependenciaOperacaoOfPcp,
  classificarErroAlteracaoDependenciaOperacaoOfPcp,
  verificarAmbienteDependenciaOperacaoOfPcpHabilitado,
} from "../lib/persistirAlteracaoDependenciaOperacaoOfPcp";
import { gravacoesOpDependenciasPcpHabilitadas } from "../lib/gravacoesOperacionaisPcpHabilitadas";

export type ResultadoRemoverDependenciaOperacaoOfPcp =
  | { ok: true }
  | {
      ok: false;
      motivo:
        | "nao_autenticado"
        | "empresa_nao_encontrada"
        | "op_nao_encontrada"
        | "ambiente_nao_habilitado"
        | "implantacao_bloqueada"
        | "nao_autorizado"
        | "dados_invalidos"
        | "empresas_diferentes"
        | "of_diferente"
        | "of_estado_final"
        | "apontamento_bloqueado"
        | "ciclo_detectado"
        | "motivo_obrigatorio"
        | "erro_desconhecido";
    }
  | { ok: false; motivo: "gravacao_incerta" };

const PERMISSAO_REMOVER_DEPENDENCIA = "pcp.remover_dependencia_operacao";

function logErroTecnicoRemoverDependencia(origem: string, erro: unknown): void {
  console.error(`removerDependenciaOperacaoOfPcpAction: falha tecnica em ${origem}`, erro);
}

export async function removerDependenciaOperacaoOfPcpAction(
  opOrigemId: string,
  opDependenteId: string,
  motivo: string,
): Promise<ResultadoRemoverDependenciaOperacaoOfPcp> {
  // 1. Autenticação real.
  const serverClient = await createSupabaseServerClient();
  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();
  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  // 1.5. Bloqueio provisório de implantação (fechamento objetivo pós-
  // Etapa 66L) — nunca substitui as checagens abaixo, só as antecede.
  if (!gravacoesOpDependenciasPcpHabilitadas()) {
    return { ok: false, motivo: "implantacao_bloqueada" };
  }

  // 2. Empresa da sessão.
  const { data: empresaId, error: erroEmpresa } = await serverClient.rpc("empresa_atual_id");
  if (erroEmpresa) {
    logErroTecnicoRemoverDependencia("empresa_atual_id", erroEmpresa);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (!empresaId) {
    return { ok: false, motivo: "empresa_nao_encontrada" };
  }

  // 3. As DUAS OPs via client de sessão - RLS garante que só aparecem
  // se forem da empresa atual.
  const { data: ops, error: erroOps } = await serverClient
    .from("ordens_fabricacao_operacoes")
    .select("id")
    .in("id", [opOrigemId, opDependenteId]);
  if (erroOps) {
    logErroTecnicoRemoverDependencia("ordens_fabricacao_operacoes", erroOps);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (!ops || ops.length !== 2) {
    return { ok: false, motivo: "op_nao_encontrada" };
  }

  // 4. Ambiente habilitado — Etapa 66F, mesmo probe real de
  // verificarAmbienteDependenciaOperacaoOfPcpHabilitado usado na Action
  // de Adicionar (ver aquele arquivo para o detalhamento).
  const serviceClient = createSupabaseServiceClient();
  const ambienteHabilitado = await verificarAmbienteDependenciaOperacaoOfPcpHabilitado(serviceClient);
  if (!ambienteHabilitado) {
    return { ok: false, motivo: "ambiente_nao_habilitado" };
  }

  // 5. Permissão (client de serviço só para esta checagem).
  const { data: podeRemover, error: erroPermissao } = await serviceClient.rpc("usuario_tem_permissao", {
    p_usuario_id: user.id,
    p_chave: PERMISSAO_REMOVER_DEPENDENCIA,
  });
  if (erroPermissao) {
    logErroTecnicoRemoverDependencia("usuario_tem_permissao", erroPermissao);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (podeRemover !== true) {
    return { ok: false, motivo: "nao_autorizado" };
  }

  // 6. Validação de entrada.
  if (!motivo.trim()) {
    return { ok: false, motivo: "dados_invalidos" };
  }

  // 7. RPC oficial, via canal privilegiado - p_alterado_por é sempre o
  // auth.uid() real. Remover um vínculo que já não existe é idempotente
  // (nunca dá erro) - a própria RPC só audita quando a remoção é
  // efetiva (GET DIAGNOSTICS, Etapa 66B).
  const resultado = await persistirAlteracaoDependenciaOperacaoOfPcp(
    serviceClient,
    opOrigemId,
    opDependenteId,
    "remover",
    user.id,
    motivo.trim(),
  );

  if (resultado.gravacaoIncerta) {
    logErroTecnicoRemoverDependencia("alterar_dependencia_operacao (rede)", { message: resultado.erro ?? "falha de rede" });
    return { ok: false, motivo: "gravacao_incerta" };
  }

  if (resultado.erro) {
    logErroTecnicoRemoverDependencia("alterar_dependencia_operacao", { message: resultado.erro });
    return { ok: false, motivo: classificarErroAlteracaoDependenciaOperacaoOfPcp(resultado.erro) };
  }

  // 8. Resultado.
  return { ok: true };
}
