"use server";
// Etapa 66E (Fase B) — checa as 2 permissões reais de dependências entre
// OPs (migration candidata 20261108110000, auditada e validada nas
// Etapas 66B/66C/66D — ainda NÃO aplicada em produção). Mesmo padrão de
// consultarPermissoesOperacoesOfPcpAction.ts, mantido em arquivo
// separado porque dependência é um conceito distinto da edição de
// tempo/recurso/sequência (Etapa 66A item 5 — "manter a alteração de
// dependências separada da edição"), não só na UI como também aqui.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";
import { verificarAmbienteDependenciaOperacaoOfPcpHabilitado } from "../lib/persistirAlteracaoDependenciaOperacaoOfPcp";

const PERMISSAO_CRIAR_DEPENDENCIA = "pcp.criar_dependencia_operacao";
const PERMISSAO_REMOVER_DEPENDENCIA = "pcp.remover_dependencia_operacao";

export type ResultadoPermissoesDependenciasOperacoesOfPcp =
  | {
      ok: true;
      podeCriarDependencia: boolean;
      podeRemoverDependencia: boolean;
      // Etapa 66F — probe real (nunca simulado) de que a migration
      // candidata já foi aplicada neste ambiente. A UI usa isto para
      // desabilitar os controles com uma explicação clara, mas a
      // garantia real contra escrita vem das próprias Server Actions
      // (verificarAmbienteDependenciaOperacaoOfPcpHabilitado), nunca
      // só deste campo.
      ambienteHabilitado: boolean;
    }
  | { ok: false; motivo: "nao_autenticado" | "erro_desconhecido" };

function logErroTecnicoPermissoesDependenciasOfPcp(chave: string, erro: unknown): void {
  console.error(`consultarPermissoesDependenciasOperacoesOfPcpAction: falha tecnica ao checar ${chave}`, erro);
}

export async function consultarPermissoesDependenciasOperacoesOfPcpAction(): Promise<ResultadoPermissoesDependenciasOperacoesOfPcp> {
  const serverClient = await createSupabaseServerClient();

  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();

  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  const serviceClient = createSupabaseServiceClient();

  const [criar, remover, ambienteHabilitado] = await Promise.all([
    serviceClient.rpc("usuario_tem_permissao", { p_usuario_id: user.id, p_chave: PERMISSAO_CRIAR_DEPENDENCIA }),
    serviceClient.rpc("usuario_tem_permissao", { p_usuario_id: user.id, p_chave: PERMISSAO_REMOVER_DEPENDENCIA }),
    verificarAmbienteDependenciaOperacaoOfPcpHabilitado(serviceClient),
  ]);

  if (criar.error) {
    logErroTecnicoPermissoesDependenciasOfPcp(PERMISSAO_CRIAR_DEPENDENCIA, criar.error);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (remover.error) {
    logErroTecnicoPermissoesDependenciasOfPcp(PERMISSAO_REMOVER_DEPENDENCIA, remover.error);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  return {
    ok: true,
    podeCriarDependencia: criar.data === true,
    podeRemoverDependencia: remover.data === true,
    ambienteHabilitado,
  };
}
