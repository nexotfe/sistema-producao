"use server";
// Solicitação de cálculo de programação do PCP (PCP-P8I-B4) - wrapper
// fino sobre orquestrarSolicitacaoCalculoPcp.ts, mesmo padrão de
// aprovarCenarioComercialAction.ts: a lógica testável vive no arquivo
// sem "use server", com dependências injetadas; este arquivo só monta
// as dependências REAIS.
//
// DESVIO DELIBERADO do padrão Comercial (registrado em PCP-P8I-B4):
// no Comercial, o client service_role só é criado DEPOIS de
// autorizar, usando o client de sessão (RLS) para a checagem. Aqui
// isso não é possível - usuario_tem_permissao() é service_role-only
// por desenho (PCP-P8I-B2), então o client privilegiado precisa
// existir para FAZER a própria pergunta de autorização, não só para
// agir sobre um "sim". Isto continua seguro porque o userId passado a
// ele já foi validado por auth.getUser() no client de sessão, nunca
// aceito do corpo da requisição.
//
// Esta Server Action NUNCA escreve nada - monta a entrada do Motor e
// escalona em memória; o resultado devolvido ao navegador é só para
// análise (ver cabeçalho do orquestrador).
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";
import { montarEntradaMotorPcp } from "../lib/motor/montarEntradaMotorPcp";
import {
  orquestrarSolicitacaoCalculoPcp,
  type DependenciasSolicitacaoCalculoPcp,
  type PayloadSolicitacaoCalculoPcp,
  type ResultadoSolicitacaoCalculoPcp,
} from "./orquestrarSolicitacaoCalculoPcp";

const PERMISSAO_SOLICITAR_CALCULO = "pcp.solicitar_calculo";

function validarPayload(paramsRecebidos: unknown): PayloadSolicitacaoCalculoPcp | null {
  if (typeof paramsRecebidos !== "object" || paramsRecebidos === null) return null;
  const { dataInicial, dataFinal } = paramsRecebidos as Record<string, unknown>;
  if (typeof dataInicial !== "string" || typeof dataFinal !== "string") return null;
  return { dataInicial, dataFinal };
}

export async function solicitarCalculoProgramacaoPcpAction(
  paramsRecebidos: unknown,
): Promise<ResultadoSolicitacaoCalculoPcp> {
  // Mesma disciplina das demais Server Actions: a assinatura tipada do
  // chamador não é proteção real em runtime - o payload chega pela
  // rede como qualquer chamada.
  const params = validarPayload(paramsRecebidos);
  if (!params) {
    return { ok: false, motivo: "janela_invalida", detalhe: "payload malformado - dataInicial/dataFinal ausentes ou não são string." };
  }

  const serverClient = await createSupabaseServerClient();
  // Criado antes da autorização, por necessidade (ver cabeçalho acima) -
  // nunca usado para resolver identidade a partir do payload.
  const serviceClient = createSupabaseServiceClient();

  const dependenciasReais: DependenciasSolicitacaoCalculoPcp = {
    autenticar: async () => {
      const {
        data: { user },
        error,
      } = await serverClient.auth.getUser();
      return error || !user ? null : user.id;
    },

    autorizar: async (userId) => {
      const { data, error } = await serviceClient.rpc("usuario_tem_permissao", {
        p_usuario_id: userId,
        p_chave: PERMISSAO_SOLICITAR_CALCULO,
      });
      if (error) return false;
      return data === true;
    },

    resolverEmpresa: async (userId) => {
      const { data, error } = await serviceClient.from("usuarios").select("empresa_id").eq("id", userId).maybeSingle();
      if (error || !data) return null;
      return data.empresa_id as string;
    },

    lerVersaoCapacidade: async (empresaId) => {
      const { data, error } = await serviceClient
        .from("empresa_capacidade_versoes")
        .select("versao")
        .eq("empresa_id", empresaId)
        .maybeSingle();
      if (error || !data) return null;
      return data.versao as number;
    },

    montarEntrada: (userId, datasGradeCompartilhada) => montarEntradaMotorPcp(serviceClient, userId, datasGradeCompartilhada),
  };

  return orquestrarSolicitacaoCalculoPcp(params, dependenciasReais);
}
