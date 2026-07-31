"use server";
// Aprovação autoritativa da Simulação Comercial (PAD-008, seções 7-8:
// Divergência arquitetural conhecida / Decisão arquitetural).
//
// Diferença real em relação ao fluxo antigo (aprovarSimulacaoComercial,
// em executarSimulacao.ts, mantido só para rollback): esta Server
// Action nunca confia no `resultado` que o cliente envia para
// PERSISTIR - ele é usado só para COMPARAR contra uma reexecução
// independente, feita aqui, com o client de sessão do servidor. Só o
// resultado recalculado no servidor é enviado à RPC v2 - mesmo quando
// idêntico ao do cliente.
//
// auth.getUser() (não getSession()) porque revalida o token contra o
// servidor de autenticação do Supabase - não é falsificável só
// adulterando o que o navegador envia.
//
// validarPayloadAprovacao roda ANTES de qualquer chamada de rede -
// TypeScript não protege esta fronteira em runtime (o payload de uma
// Server Action chega pela rede como qualquer outra chamada).
// Mensagem de erro de validação é sempre genérica para o cliente; o
// motivo técnico vai só para o log do servidor (console.error), nunca
// no retorno.
import { createHash } from "crypto";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";
import { simularCapacidadeProjeto } from "../lib/executarSimulacao";
import { compararResultadosSimulacao, type DiferencaSimulacao } from "../lib/compararResultadosSimulacao";
import { validarPayloadAprovacao, type PayloadAprovacao } from "./validarPayloadAprovacao";

const MENSAGEM_VALIDACAO_GENERICA =
  "Não foi possível validar os dados da aprovação. Execute novamente a simulação.";

export type ResultadoAprovacaoAction =
  | { ok: true; simulacaoComercialId: string }
  | { ok: false; motivo: "nao_autenticado" }
  | { ok: false; motivo: "divergente"; diferencas: DiferencaSimulacao[] }
  | { ok: false; motivo: "erro"; mensagem: string };

// Hash canonico do que sera de fato persistido - projeto, aprovador,
// parametros comerciais e os ITENS RECALCULADOS NO SERVIDOR (nunca os
// do payload do cliente). Itens ordenados por bomOperacaoId para o
// hash nao depender da ordem de retorno. sha256 via crypto nativo do
// Node - sem dependencia nova.
function calcularHashSolicitacao(dados: {
  projetoId: string;
  aprovadoPor: string;
  cenarioDemanda: string;
  modoProducao: string;
  dataNecessidade: string;
  margemSegurancaDias: number;
  janelaInicio: string;
  janelaFim: string;
  itens: PayloadAprovacao["resultado"]["itensPorOperacao"];
}): string {
  const itensOrdenados = [...dados.itens]
    .sort((a, b) => a.bomOperacaoId.localeCompare(b.bomOperacaoId))
    .map((item) => ({
      bomOperacaoId: item.bomOperacaoId,
      recursoOriginalId: item.recursoOriginalId,
      recursoConsideradoId: item.recursoConsideradoId,
      motivoConsideracao: item.motivoConsideracao,
      necessario: item.necessario,
      capacidadeBruta: item.capacidadeBruta,
      capacidadeEfetiva: item.capacidadeEfetiva,
      capacidadeDisponivel: item.capacidadeDisponivel,
      comprometido: item.comprometido,
      livre: item.livre,
      deficit: item.deficit,
    }));

  const canonico = JSON.stringify({
    projetoId: dados.projetoId,
    aprovadoPor: dados.aprovadoPor,
    cenarioDemanda: dados.cenarioDemanda,
    modoProducao: dados.modoProducao,
    dataNecessidade: dados.dataNecessidade,
    margemSegurancaDias: dados.margemSegurancaDias,
    janelaInicio: dados.janelaInicio,
    janelaFim: dados.janelaFim,
    itens: itensOrdenados,
  });

  return createHash("sha256").update(canonico).digest("hex");
}

export async function aprovarSimulacaoComercialAction(
  paramsRecebidos: PayloadAprovacao,
): Promise<ResultadoAprovacaoAction> {
  // A assinatura tipada acima ajuda quem chama de dentro do próprio
  // projeto (autocomplete, erro de compilação em uso incorreto), mas
  // não é proteção real: o payload de uma Server Action chega pela
  // rede como qualquer chamada, e nada impede em runtime que alguém
  // envie algo que não respeita este tipo. A validação abaixo trata
  // `paramsRecebidos` como não confiável de qualquer forma, igual
  // faria com `unknown` - é ela, não o tipo declarado, que decide se o
  // restante da função roda. `params`, usado daqui pra baixo, só passa
  // a existir depois de validado.
  const validacao = validarPayloadAprovacao(paramsRecebidos);

  if (!validacao.valido) {
    console.error(
      `aprovarSimulacaoComercialAction: payload rejeitado na validação - ${validacao.motivo}`,
    );
    return { ok: false, motivo: "erro", mensagem: MENSAGEM_VALIDACAO_GENERICA };
  }

  const params = validacao.dados;

  try {
    const serverClient = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await serverClient.auth.getUser();

    if (userError || !user) {
      return { ok: false, motivo: "nao_autenticado" };
    }

    const { data: usuario, error: usuarioError } = await serverClient
      .from("usuarios")
      .select("empresa_id")
      .eq("id", user.id)
      .single();

    if (usuarioError || !usuario?.empresa_id) {
      return {
        ok: false,
        motivo: "erro",
        mensagem: "Empresa do usuário não encontrada.",
      };
    }

    // Reexecução autoritativa: mesmo adaptador + núcleo do preview,
    // agora rodando no servidor, contra o estado corrente do banco -
    // nunca confia no que o cliente calculou.
    const revalidacaoServidor = await simularCapacidadeProjeto(
      serverClient,
      usuario.empresa_id,
      params.projetoId,
      params.janelaInicio,
      params.janelaFim,
    );

    const comparacao = compararResultadosSimulacao(
      params.resultado,
      revalidacaoServidor,
    );

    if (!comparacao.identico) {
      return { ok: false, motivo: "divergente", diferencas: comparacao.diferencas };
    }

    // A partir daqui, só o client privilegiado é usado, só para
    // persistir - e só com o resultado recalculado no servidor, nunca
    // com params.resultado (mesmo que tenham dado idênticos acima).
    const hashSolicitacao = calcularHashSolicitacao({
      projetoId: params.projetoId,
      aprovadoPor: user.id,
      cenarioDemanda: params.cenarioDemanda,
      modoProducao: params.modoProducao,
      dataNecessidade: params.dataNecessidade,
      margemSegurancaDias: params.margemSegurancaDias,
      janelaInicio: params.janelaInicio,
      janelaFim: params.janelaFim,
      itens: revalidacaoServidor.itensPorOperacao,
    });

    const serviceClient = createSupabaseServiceClient();

    const { data, error } = await serviceClient.rpc(
      "aprovar_projeto_com_simulacao_v2",
      {
        p_aprovado_por: user.id,
        p_projeto_id: params.projetoId,
        p_cenario_demanda: params.cenarioDemanda,
        p_modo_producao: params.modoProducao,
        p_data_necessidade: params.dataNecessidade,
        p_margem_seguranca_dias: params.margemSegurancaDias,
        p_janela_inicio: params.janelaInicio,
        p_janela_fim: params.janelaFim,
        p_itens: revalidacaoServidor.itensPorOperacao.map((item) => ({
          bom_operacao_id: item.bomOperacaoId,
          recurso_original_id: item.recursoOriginalId,
          recurso_considerado_id: item.recursoConsideradoId,
          motivo_consideracao: item.motivoConsideracao,
          necessario: item.necessario,
          capacidade_bruta: item.capacidadeBruta,
          capacidade_efetiva: item.capacidadeEfetiva,
          capacidade_disponivel: item.capacidadeDisponivel,
          comprometido: item.comprometido,
          livre: item.livre,
          deficit: item.deficit,
        })),
        p_chave_idempotencia: params.chaveIdempotencia,
        p_hash_solicitacao: hashSolicitacao,
      },
    );

    if (error) {
      return {
        ok: false,
        motivo: "erro",
        mensagem: `Erro ao aprovar projeto com simulação: ${error.message}`,
      };
    }

    return { ok: true, simulacaoComercialId: data as string };
  } catch (erroCapturado) {
    return {
      ok: false,
      motivo: "erro",
      mensagem:
        erroCapturado instanceof Error
          ? erroCapturado.message
          : "Erro inesperado ao aprovar simulação.",
    };
  }
}
