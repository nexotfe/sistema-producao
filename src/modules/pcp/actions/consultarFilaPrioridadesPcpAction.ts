"use server";
// PCP-Etapa2O.5: consulta da fila de prioridades, autorizada por
// pcp.visualizar_programacao. Mesmo DESVIO deliberado já documentado em
// consultarProgramacaoVigentePcpAction.ts: o client service_role precisa
// existir ANTES da checagem de autorização, porque usuario_tem_permissao
// é service_role-only por desenho (P8I-B2) - o client privilegiado é
// instanciado só para FAZER essa pergunta, nunca para ler dado
// operacional (a leitura real usa o client de SESSÃO, abaixo, com RLS
// aplicada normalmente).
//
// DECISÃO DE PERMISSÃO (Etapa 2O.5, item 4 do pedido): não existe, hoje,
// uma chave dedicada a "visualizar prioridades" no catálogo (6 chaves:
// visualizar_programacao, alterar_prioridade, solicitar_calculo,
// aprovar_programacao, liberar_of, cancelar_of). Reaproveita-se
// 'pcp.visualizar_programacao' - a fila de prioridades é a ENTRADA do
// mesmo cálculo cuja SAÍDA (a programação) essa chave já autoriza ver;
// quem pode ver o resultado do Motor razoavelmente pode ver a ordem que
// o alimenta. 'pcp.alterar_prioridade' continua sendo a ÚNICA chave que
// autoriza ESCREVER (moverPrioridadeProjetoPcpAction.ts) - nunca
// reaproveitada aqui, nunca o inverso (ver quem só pode visualizar não
// pode mover).
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";
import { buscarFilaPrioridadesPcp, type ItemFilaPrioridadesPcp } from "../lib/buscarFilaPrioridadesPcp";

const PERMISSAO_VISUALIZAR_PROGRAMACAO = "pcp.visualizar_programacao";

export type ResultadoConsultaFilaPrioridadesPcp =
  | { ok: true; fila: readonly ItemFilaPrioridadesPcp[] }
  | { ok: false; motivo: "nao_autenticado" }
  | { ok: false; motivo: "nao_autorizado" };

export async function consultarFilaPrioridadesPcpAction(): Promise<ResultadoConsultaFilaPrioridadesPcp> {
  const serverClient = await createSupabaseServerClient();
  const serviceClient = createSupabaseServiceClient();

  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();

  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  const { data: autorizado, error: erroAutorizacao } = await serviceClient.rpc("usuario_tem_permissao", {
    p_usuario_id: user.id,
    p_chave: PERMISSAO_VISUALIZAR_PROGRAMACAO,
  });

  // Diagnostico temporario (NEXOTFE - investigacao do erro "nao_autorizado"
  // em /pcp/prioridades, 2026-10-27): distingue falha TECNICA na chamada da
  // RPC de uma resposta valida igual a false - nunca a mesma causa. Loga
  // só campos diagnosticos do erro do PostgREST (code/message/details/hint
  // - nunca token, cookie, header ou dado pessoal); a resposta enviada ao
  // navegador continua idêntica nos dois casos.
  if (erroAutorizacao) {
    console.error("consultarFilaPrioridadesPcpAction: falha tecnica na RPC usuario_tem_permissao", {
      code: erroAutorizacao.code,
      message: erroAutorizacao.message,
      details: erroAutorizacao.details,
      hint: erroAutorizacao.hint,
    });
    return { ok: false, motivo: "nao_autorizado" };
  }

  if (autorizado !== true) {
    console.error(
      "consultarFilaPrioridadesPcpAction: RPC usuario_tem_permissao respondeu false para",
      PERMISSAO_VISUALIZAR_PROGRAMACAO,
    );
    return { ok: false, motivo: "nao_autorizado" };
  }

  const fila = await buscarFilaPrioridadesPcp(serverClient);

  return { ok: true, fila };
}
