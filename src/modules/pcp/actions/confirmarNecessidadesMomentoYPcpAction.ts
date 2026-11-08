"use server";
// Etapa 63 — confirmação REAL das necessidades de matéria-prima via
// confirmar_necessidades_momento_y (função já em produção, auditada nas
// Etapas 61/62). Client de SESSÃO - nunca service_role (a função já
// valida papel PCP/ADM internamente; usar service_role aqui contornaria
// essa checagem, exatamente o que a diretriz de permissões proíbe).
//
// Achado da Etapa 63 (auditoria desta etapa, pg_get_functiondef
// confirmado): a própria função SQL NÃO verifica o interruptor
// 'pcp.ci_ce_momento_y.ativo' da empresa - só as leituras
// (determinar_regime_momento_y_of/sugerir_proposta_momento_y) o usam, e
// só como diagnóstico (ver buscarPropostaMomentoY.ts). Uma OF pode estar
// em regime "pendente_momento_y" mesmo com o interruptor desligado (ver
// o mesmo comentário). Sem alterar a função SQL (fora do escopo
// autorizado), esta Action adiciona a proteção que falta: nunca chama a
// RPC se o interruptor estiver desligado para a empresa atual. Como
// nenhuma empresa real tem o interruptor ligado hoje, esta checagem
// bloqueia QUALQUER confirmação real em produção até uma decisão de
// negócio separada ligar o interruptor para uma empresa específica.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import {
  persistirConfirmacaoMomentoYPcp,
  classificarErroConfirmacaoMomentoYPcp,
  type ItemConfirmacaoMomentoYPayload,
  type MotivoRejeicaoConfirmacaoMomentoYPcp,
} from "../lib/persistirConfirmacaoMomentoYPcp";

export interface ItemConfirmacaoMomentoYPcp {
  readonly materiaPrimaId: string;
  readonly origemFornecimento: "empresa" | "cliente";
  readonly quantidadeConfirmada: number;
  readonly quantidadeCi: number;
  readonly observacaoTecnica: string;
}

export type ResultadoConfirmarNecessidadesMomentoYPcp =
  | {
      ok: true;
      totalMateriais: number;
      totalReservasCi: number;
      totalItensRequisicaoCe: number;
      requisicaoCompraId: string | null;
    }
  | { ok: false; motivo: "nao_autenticado" | "empresa_nao_encontrada" | MotivoRejeicaoConfirmacaoMomentoYPcp }
  /** A chamada de rede à RPC falhou sem completar um ciclo requisição/resposta - não se sabe se a confirmação foi gravada. O chamador NUNCA deve tratar isto como "falhou" nem "funcionou" - precisa reconsultar a OF antes de decidir. */
  | { ok: false; motivo: "gravacao_incerta" };

function logErroTecnicoConfirmacaoMomentoY(origem: string, erro: { message: string; code?: string }): void {
  console.error(`confirmarNecessidadesMomentoYPcpAction: falha tecnica em ${origem}`, { code: erro.code, message: erro.message });
}

export async function confirmarNecessidadesMomentoYPcpAction(
  ofId: string,
  propostaOriginal: unknown,
  itensConfirmados: readonly ItemConfirmacaoMomentoYPcp[],
): Promise<ResultadoConfirmarNecessidadesMomentoYPcp> {
  const serverClient = await createSupabaseServerClient();

  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();
  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  const { data: empresaId, error: erroEmpresa } = await serverClient.rpc("empresa_atual_id");
  if (erroEmpresa) {
    logErroTecnicoConfirmacaoMomentoY("empresa_atual_id", erroEmpresa);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (!empresaId) {
    return { ok: false, motivo: "empresa_nao_encontrada" };
  }

  // Proteção que a RPC real não faz (ver comentário do arquivo) -
  // revalidada agora, nunca a partir do valor lido quando a tela abriu.
  const { data: interruptorAtivo, error: erroInterruptor } = await serverClient.rpc("momento_y_ativo_para_empresa", {
    p_empresa_id: empresaId,
  });
  if (erroInterruptor) {
    logErroTecnicoConfirmacaoMomentoY("momento_y_ativo_para_empresa", erroInterruptor);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (!interruptorAtivo) {
    return { ok: false, motivo: "interruptor_desligado" };
  }

  const payload: ItemConfirmacaoMomentoYPayload[] = itensConfirmados.map((item) => ({
    materia_prima_id: item.materiaPrimaId,
    origem_fornecimento: item.origemFornecimento,
    quantidade_confirmada: item.quantidadeConfirmada,
    quantidade_ci: item.quantidadeCi,
    observacao_tecnica: item.observacaoTecnica,
  }));

  const resultado = await persistirConfirmacaoMomentoYPcp(serverClient, ofId, propostaOriginal, payload);

  if (resultado.gravacaoIncerta) {
    logErroTecnicoConfirmacaoMomentoY("confirmar_necessidades_momento_y (rede)", { message: resultado.erro ?? "falha de rede" });
    return { ok: false, motivo: "gravacao_incerta" };
  }

  if (resultado.erro) {
    logErroTecnicoConfirmacaoMomentoY("confirmar_necessidades_momento_y", { message: resultado.erro });
    return { ok: false, motivo: classificarErroConfirmacaoMomentoYPcp(resultado.erro) };
  }

  const dados = resultado.resposta;
  if (!dados) {
    logErroTecnicoConfirmacaoMomentoY("confirmar_necessidades_momento_y (resposta vazia)", { message: "RPC retornou sucesso sem payload" });
    return { ok: false, motivo: "erro_desconhecido" };
  }

  return {
    ok: true,
    totalMateriais: dados.total_materiais,
    totalReservasCi: dados.total_reservas_ci,
    totalItensRequisicaoCe: dados.total_itens_requisicao_ce,
    requisicaoCompraId: dados.requisicao_compra_id,
  };
}
