"use server";
// PCP-P8I-B5.1: consulta da programação vigente, autorizada por
// pcp.visualizar_programacao. Mesmo DESVIO deliberado já documentado
// em solicitarCalculoProgramacaoPcpAction.ts: o client service_role
// precisa existir ANTES da checagem de autorização, porque
// usuario_tem_permissao é service_role-only por desenho (P8I-B2) - o
// client privilegiado é instanciado só para FAZER essa pergunta,
// nunca para ler dado operacional (a leitura real usa o client de
// SESSÃO, abaixo, com RLS aplicada normalmente).
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";
import { buscarProgramacaoVigentePcp, type ProgramacaoVigentePcp } from "../lib/buscarProgramacaoVigentePcp";

const PERMISSAO_VISUALIZAR_PROGRAMACAO = "pcp.visualizar_programacao";

export type ResultadoConsultaProgramacaoVigentePcp =
  | { ok: true; programacao: ProgramacaoVigentePcp | null }
  | { ok: false; motivo: "nao_autenticado" }
  | { ok: false; motivo: "nao_autorizado" };

export async function consultarProgramacaoVigentePcpAction(): Promise<ResultadoConsultaProgramacaoVigentePcp> {
  const serverClient = await createSupabaseServerClient();
  const serviceClient = createSupabaseServiceClient();

  // auth.getUser() (nunca getSession()) - revalida o token contra o
  // servidor de autenticação do Supabase.
  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();

  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  // Nega ANTES de qualquer leitura operacional - nenhuma consulta a
  // pcp_programacoes acontece se esta checagem não passar.
  const { data: autorizado, error: erroAutorizacao } = await serviceClient.rpc("usuario_tem_permissao", {
    p_usuario_id: user.id,
    p_chave: PERMISSAO_VISUALIZAR_PROGRAMACAO,
  });

  if (erroAutorizacao || autorizado !== true) {
    return { ok: false, motivo: "nao_autorizado" };
  }

  // Leitura real com o client de SESSÃO - RLS restringe ao tenant do
  // usuário autenticado, nunca a um empresa_id vindo do navegador (não
  // há nenhum parâmetro de entrada nesta Server Action).
  const programacao = await buscarProgramacaoVigentePcp(serverClient);

  return { ok: true, programacao };
}
