"use server";
// Etapa 65A — Server Action real de remoção lógica de uma OP
// (marcar_op_nao_aplicavel, já em produção, auditada nas Etapas
// 65/65A). "Remover" nunca é exclusão física - só marca
// nao_aplicavel=true. Botão da UI real segue desconectado desta Action
// (preparação, sem gravação habilitada). Mesmo fluxo de 7 passos de
// adicionarOperacaoOfPcpAction.ts - ver aquele arquivo para o
// detalhamento completo de cada passo.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";
import {
  persistirRemocaoOperacaoOfPcp,
  classificarErroRemocaoOperacaoOfPcp,
} from "../lib/persistirRemocaoOperacaoOfPcp";
import { gravacoesOpDependenciasPcpHabilitadas } from "../lib/gravacoesOperacionaisPcpHabilitadas";

export type ResultadoRemoverOperacaoOfPcp =
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
        | "dependencias_pendentes"
        | "motivo_obrigatorio"
        | "erro_desconhecido";
    }
  | { ok: false; motivo: "gravacao_incerta" };

const PERMISSAO_REMOVER_OPERACAO = "pcp.remover_operacao_of";

function logErroTecnicoRemoverOperacao(origem: string, erro: unknown): void {
  console.error(`removerOperacaoOfPcpAction: falha tecnica em ${origem}`, erro);
}

export async function removerOperacaoOfPcpAction(opId: string, motivo: string): Promise<ResultadoRemoverOperacaoOfPcp> {
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
    logErroTecnicoRemoverOperacao("empresa_atual_id", erroEmpresa);
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
    logErroTecnicoRemoverOperacao("ordens_fabricacao_operacoes", erroOp);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (!opRow) {
    return { ok: false, motivo: "op_nao_encontrada" };
  }

  // 4. Permissão (client de serviço só para esta checagem).
  const serviceClient = createSupabaseServiceClient();
  const { data: podeRemover, error: erroPermissao } = await serviceClient.rpc("usuario_tem_permissao", {
    p_usuario_id: user.id,
    p_chave: PERMISSAO_REMOVER_OPERACAO,
  });
  if (erroPermissao) {
    logErroTecnicoRemoverOperacao("usuario_tem_permissao", erroPermissao);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (podeRemover !== true) {
    return { ok: false, motivo: "nao_autorizado" };
  }

  // 5. Validação de entrada.
  if (!motivo.trim()) {
    return { ok: false, motivo: "dados_invalidos" };
  }

  // 6. RPC oficial, via canal privilegiado - p_marcado_por é sempre o
  // auth.uid() real. A própria RPC reconfirma, com os locks já
  // adquiridos (nível 1 dependências, depois nível 3 OP), que não há
  // dependência relacionada nem apontamento - nunca remove dependência
  // automaticamente, só rejeita e lista.
  const resultado = await persistirRemocaoOperacaoOfPcp(serviceClient, opId, user.id, motivo.trim());

  if (resultado.gravacaoIncerta) {
    logErroTecnicoRemoverOperacao("marcar_op_nao_aplicavel (rede)", { message: resultado.erro ?? "falha de rede" });
    return { ok: false, motivo: "gravacao_incerta" };
  }

  if (resultado.erro) {
    logErroTecnicoRemoverOperacao("marcar_op_nao_aplicavel", { message: resultado.erro });
    return { ok: false, motivo: classificarErroRemocaoOperacaoOfPcp(resultado.erro) };
  }

  // 7. Resultado.
  return { ok: true };
}
