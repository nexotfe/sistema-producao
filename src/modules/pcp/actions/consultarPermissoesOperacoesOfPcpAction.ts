"use server";
// Etapa 59A — checa as 3 permissões CANDIDATAS para os controles de
// Operações de Produção (nenhuma delas existe ainda em public.permissoes
// - ver investigação da Etapa 59). usuario_tem_permissao já devolve
// false com segurança para uma chave inexistente (confirmado contra
// produção: "chave precisa existir no catálogo global... Chave
// inválida/nula = false", antes até de checar se o usuário é ADM) -
// então hoje TODO usuário vê os 3 controles como não autorizados, o que
// é o comportamento correto e esperado até que o catálogo seja
// atualizado (decisão de negócio, fora desta etapa). O client de
// serviço existe SÓ para esta checagem (mesmo desvio documentado em
// consultarPrazoOfsPcpAction.ts) - nunca para ler dado operacional.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";

const PERMISSAO_CRIAR_OPERACAO = "pcp.criar_operacao_of";
const PERMISSAO_EDITAR_OPERACAO = "pcp.editar_operacao_of";
const PERMISSAO_REMOVER_OPERACAO = "pcp.remover_operacao_of";

export type ResultadoPermissoesOperacoesOfPcp =
  | {
      ok: true;
      podeCriarOperacao: boolean;
      podeEditarOperacao: boolean;
      podeRemoverOperacao: boolean;
    }
  | { ok: false; motivo: "nao_autenticado" | "erro_desconhecido" };

function logErroTecnicoPermissoesOperacoesOfPcp(chave: string, erro: unknown): void {
  console.error(`consultarPermissoesOperacoesOfPcpAction: falha tecnica ao checar ${chave}`, erro);
}

export async function consultarPermissoesOperacoesOfPcpAction(): Promise<ResultadoPermissoesOperacoesOfPcp> {
  const serverClient = await createSupabaseServerClient();

  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();

  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  const serviceClient = createSupabaseServiceClient();

  const [criar, editar, remover] = await Promise.all([
    serviceClient.rpc("usuario_tem_permissao", { p_usuario_id: user.id, p_chave: PERMISSAO_CRIAR_OPERACAO }),
    serviceClient.rpc("usuario_tem_permissao", { p_usuario_id: user.id, p_chave: PERMISSAO_EDITAR_OPERACAO }),
    serviceClient.rpc("usuario_tem_permissao", { p_usuario_id: user.id, p_chave: PERMISSAO_REMOVER_OPERACAO }),
  ]);

  if (criar.error) {
    logErroTecnicoPermissoesOperacoesOfPcp(PERMISSAO_CRIAR_OPERACAO, criar.error);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (editar.error) {
    logErroTecnicoPermissoesOperacoesOfPcp(PERMISSAO_EDITAR_OPERACAO, editar.error);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (remover.error) {
    logErroTecnicoPermissoesOperacoesOfPcp(PERMISSAO_REMOVER_OPERACAO, remover.error);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  return {
    ok: true,
    podeCriarOperacao: criar.data === true,
    podeEditarOperacao: editar.data === true,
    podeRemoverOperacao: remover.data === true,
  };
}
