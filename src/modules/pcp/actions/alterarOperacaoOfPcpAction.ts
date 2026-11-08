"use server";
// Etapa 65A — Server Action real de alteração do Y de uma OP
// (alterar_y_operacao, já em produção, auditada nas Etapas 65/65A).
// Botão da UI real segue desconectado desta Action (preparação, sem
// gravação habilitada). Mesmo fluxo de 7 passos de
// adicionarOperacaoOfPcpAction.ts - ver aquele arquivo para o
// detalhamento completo de cada passo.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";
import {
  persistirAlteracaoOperacaoOfPcp,
  classificarErroAlteracaoOperacaoOfPcp,
} from "../lib/persistirAlteracaoOperacaoOfPcp";
import { gravacoesOpDependenciasPcpHabilitadas } from "../lib/gravacoesOperacionaisPcpHabilitadas";

export interface AlteracoesOperacaoOfPcp {
  readonly recursoVigenteId: string | null;
  readonly tempoVigenteMinutos: number | null;
  readonly sequenciaVigente: number | null;
  readonly motivo: string;
}

export type ResultadoAlterarOperacaoOfPcp =
  | { ok: true }
  | {
      ok: false;
      motivo:
        | "nao_autenticado"
        | "empresa_nao_encontrada"
        | "op_nao_encontrada"
        | "implantacao_bloqueada"
        | "nao_autorizado"
        | "dados_invalidos"
        | "of_estado_final"
        | "apontamento_bloqueado"
        | "erro_desconhecido";
      campo?: string;
    }
  | { ok: false; motivo: "gravacao_incerta" };

const PERMISSAO_EDITAR_OPERACAO = "pcp.editar_operacao_of";

function logErroTecnicoAlterarOperacao(origem: string, erro: unknown): void {
  console.error(`alterarOperacaoOfPcpAction: falha tecnica em ${origem}`, erro);
}

function validarEntrada(alteracoes: AlteracoesOperacaoOfPcp): { campo: string } | null {
  if (alteracoes.sequenciaVigente !== null && (!Number.isInteger(alteracoes.sequenciaVigente) || alteracoes.sequenciaVigente < 0)) {
    return { campo: "sequencia" };
  }
  if (
    alteracoes.tempoVigenteMinutos !== null &&
    (!Number.isFinite(alteracoes.tempoVigenteMinutos) || alteracoes.tempoVigenteMinutos < 0)
  ) {
    return { campo: "tempo" };
  }
  if (!alteracoes.motivo.trim()) return { campo: "motivo" };
  return null;
}

export async function alterarOperacaoOfPcpAction(
  opId: string,
  alteracoes: AlteracoesOperacaoOfPcp,
): Promise<ResultadoAlterarOperacaoOfPcp> {
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
    logErroTecnicoAlterarOperacao("empresa_atual_id", erroEmpresa);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (!empresaId) {
    return { ok: false, motivo: "empresa_nao_encontrada" };
  }

  // 3. OP via client de sessão - RLS garante que só aparece se for da empresa atual.
  const { data: opRow, error: erroOp } = await serverClient
    .from("ordens_fabricacao_operacoes")
    .select("id")
    .eq("id", opId)
    .maybeSingle();
  if (erroOp) {
    logErroTecnicoAlterarOperacao("ordens_fabricacao_operacoes", erroOp);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (!opRow) {
    return { ok: false, motivo: "op_nao_encontrada" };
  }

  // 4. Permissão (client de serviço só para esta checagem).
  const serviceClient = createSupabaseServiceClient();
  const { data: podeEditar, error: erroPermissao } = await serviceClient.rpc("usuario_tem_permissao", {
    p_usuario_id: user.id,
    p_chave: PERMISSAO_EDITAR_OPERACAO,
  });
  if (erroPermissao) {
    logErroTecnicoAlterarOperacao("usuario_tem_permissao", erroPermissao);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (podeEditar !== true) {
    return { ok: false, motivo: "nao_autorizado" };
  }

  // 5. Validação de entrada.
  const erroValidacao = validarEntrada(alteracoes);
  if (erroValidacao) {
    return { ok: false, motivo: "dados_invalidos", campo: erroValidacao.campo };
  }

  // 6. RPC oficial, via canal privilegiado - p_alterado_por é sempre o auth.uid() real.
  // A própria RPC reconfirma, com lock já adquirido, que a OP não tem
  // apontamento - nunca confiamos só na leitura feita quando a tela
  // abriu (TOCTOU, corrigido na Etapa 2O.5G já aplicada em produção).
  const resultado = await persistirAlteracaoOperacaoOfPcp(
    serviceClient,
    opId,
    user.id,
    alteracoes.recursoVigenteId,
    alteracoes.tempoVigenteMinutos,
    alteracoes.sequenciaVigente,
    alteracoes.motivo.trim(),
  );

  if (resultado.gravacaoIncerta) {
    logErroTecnicoAlterarOperacao("alterar_y_operacao (rede)", { message: resultado.erro ?? "falha de rede" });
    return { ok: false, motivo: "gravacao_incerta" };
  }

  if (resultado.erro) {
    logErroTecnicoAlterarOperacao("alterar_y_operacao", { message: resultado.erro });
    return { ok: false, motivo: classificarErroAlteracaoOperacaoOfPcp(resultado.erro) };
  }

  // 7. Resultado.
  return { ok: true };
}
