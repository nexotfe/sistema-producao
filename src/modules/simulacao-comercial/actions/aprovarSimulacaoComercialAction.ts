"use server";
// Aprovação autoritativa da Simulação Comercial (PAD-008, seções 7-8) -
// wrapper fino sobre orquestrarAprovacaoAutoritativa.ts (correção da
// auditoria da Entrega 1, ponto 5: a lógica de orquestração foi
// extraída para um arquivo sem "use server", testável com dependências
// injetadas). Este arquivo só monta as dependências REAIS (clients
// Supabase de sessão e privilegiado) e as injeta no orquestrador -
// Next.js exige que um arquivo "use server" exporte só funções
// assíncronas, então tipos/constantes do orquestrador vivem lá, não
// aqui.
//
// auth.getUser() (não getSession()) porque revalida o token contra o
// servidor de autenticação do Supabase - não é falsificável só
// adulterando o que o navegador envia.
//
// validarPayloadAprovacao roda ANTES de qualquer chamada de rede -
// TypeScript não protege esta fronteira em runtime (o payload de uma
// Server Action chega pela rede como qualquer outra chamada).
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";
import { simularCapacidadeProjeto } from "../lib/executarSimulacao";
import { prepararJanelaComercial } from "../lib/prepararJanelaComercial";
import { adaptarItensParaV3, type ItemAprovacaoV3 } from "../lib/adaptarParaV3";
import { validarPayloadAprovacao, type PayloadAprovacao } from "./validarPayloadAprovacao";
import {
  orquestrarAprovacaoAutoritativa,
  type DependenciasAprovacaoAutoritativa,
  type ResultadoAprovacaoAction,
  type ResultadoPersistencia,
} from "./orquestrarAprovacaoAutoritativa";

const MENSAGEM_VALIDACAO_GENERICA =
  "Não foi possível validar os dados da aprovação. Execute novamente a simulação.";

// Fase 2 do rollout da Entrega 2 (PAD-008 v2.0 §19): a persistência
// ainda vai pela RPC v3 + adaptarItensParaV3 (lib/adaptarParaV3.ts,
// testável isoladamente - "use server" só pode exportar funções
// assíncronas, por isso a lógica pura mora lá, não aqui). Troca para a
// RPC v4 nativa (sem adaptador, sem a limitação de "só 1 recurso por
// operação") é a Fase 3 do rollout - alteração separada, futura.
async function persistirViaV3(
  serviceClient: ReturnType<typeof createSupabaseServiceClient>,
  p: Parameters<DependenciasAprovacaoAutoritativa["persistir"]>[0],
): Promise<ResultadoPersistencia> {
  const adaptacao = adaptarItensParaV3(p.itens);

  if (!adaptacao.ok) {
    return {
      simulacaoComercialId: null,
      erro: null,
      naoSuportadoNestaFase: {
        mensagem: `Esta simulação distribui carga parcialmente entre recursos em ${adaptacao.operacoesNaoRepresentaveis.length} operação(ões) - recurso ainda não disponível para aprovação nesta fase do rollout. Ajuste o roteiro/compatibilidades para que cada operação seja atendida integralmente por um único recurso, ou aguarde a conclusão da ativação da distribuição parcial.`,
      },
    };
  }

  const itensAdaptados: ItemAprovacaoV3[] = adaptacao.itens;

  const { data, error } = await serviceClient
    .rpc("aprovar_projeto_com_simulacao_v3", {
      p_aprovado_por: p.aprovadoPor,
      p_projeto_id: p.projetoId,
      p_cenario_demanda: p.cenarioDemanda,
      p_modo_producao: p.modoProducao,
      p_data_necessidade: p.dataNecessidade,
      p_margem_seguranca_dias: p.margemSegurancaDias,
      p_data_prevista_aprovacao_pedido: p.dataPrevistaAprovacaoPedido,
      p_data_chegada_prevista: p.dataChegadaPrevista,
      p_janela_inicio: p.janelaInicio,
      p_janela_fim: p.janelaFim,
      p_itens: itensAdaptados,
      p_chave_idempotencia: p.chaveIdempotencia,
      p_hash_solicitacao: p.hashSolicitacao,
    });

  return {
    simulacaoComercialId: error ? null : (data as string),
    erro: error ? error.message : null,
  };
}

export type { ResultadoAprovacaoAction };

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
  const serverClient = await createSupabaseServerClient();

  const dependenciasReais: DependenciasAprovacaoAutoritativa = {
    autenticar: async () => {
      const {
        data: { user },
        error,
      } = await serverClient.auth.getUser();
      return error || !user ? null : user.id;
    },

    buscarEmpresaId: async (userId) => {
      const { data: usuario, error } = await serverClient
        .from("usuarios")
        .select("empresa_id")
        .eq("id", userId)
        .single();
      return error || !usuario?.empresa_id ? null : usuario.empresa_id;
    },

    prepararJanela: (empresaId, premissas) =>
      prepararJanelaComercial(serverClient, empresaId, premissas),

    executarMotor: (empresaId, projetoId, janelaInicio, janelaFim) =>
      simularCapacidadeProjeto(serverClient, empresaId, projetoId, janelaInicio, janelaFim),

    // Fase 2 do rollout da Entrega 2: ainda persiste via v3 + adaptador
    // (ver persistirViaV3 acima). A troca para v4 nativa (sem
    // adaptador, sem a limitação de "só 1 recurso por operação") é a
    // Fase 3 - uma alteração separada, futura, não incluída aqui.
    persistir: (p) => persistirViaV3(createSupabaseServiceClient(), p),
  };

  return orquestrarAprovacaoAutoritativa(params, dependenciasReais);
}
