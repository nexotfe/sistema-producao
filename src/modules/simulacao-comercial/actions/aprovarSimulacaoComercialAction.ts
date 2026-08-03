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
// Fase 3 do rollout da Entrega 2 (PAD-008 v2.0 §19): persiste
// nativamente via RPC v4 - a ponte v3 da Fase 2 (adaptarParaV3.ts,
// motivo "distribuicao_nao_suportada_nesta_fase") foi removida junto
// com esta troca. v3/v2/v1 permanecem intactas no banco, sem EXECUTE
// para authenticated (nunca tiveram), como caminho de rollback técnico
// - não chamadas por este componente.
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
import { montarItensParaV4 } from "../lib/montarPayloadV4";
import { validarPayloadAprovacao, type PayloadAprovacao } from "./validarPayloadAprovacao";
import {
  orquestrarAprovacaoAutoritativa,
  type DependenciasAprovacaoAutoritativa,
  type ResultadoAprovacaoAction,
} from "./orquestrarAprovacaoAutoritativa";

const MENSAGEM_VALIDACAO_GENERICA =
  "Não foi possível validar os dados da aprovação. Execute novamente a simulação.";

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

    // `p.itens` aqui é sempre revalidacaoServidor.itensPorOperacao
    // (ver orquestrarAprovacaoAutoritativa.ts) - o resultado RECALCULADO
    // no servidor, nunca o que o navegador enviou. O cliente privilegiado
    // (service_role) só é criado aqui dentro, nunca exposto ao módulo
    // client-side.
    persistir: async (p) => {
      const serviceClient = createSupabaseServiceClient();

      const { data, error } = await serviceClient.rpc("aprovar_projeto_com_simulacao_v4", {
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
        p_itens: montarItensParaV4(p.itens),
        p_chave_idempotencia: p.chaveIdempotencia,
        p_hash_solicitacao: p.hashSolicitacao,
      });

      return {
        // Correção 4 (herdada): error.message nunca é repassado ao
        // usuário - só volta aqui para o orquestrador logar no
        // servidor (console.error) e devolver MENSAGEM_ERRO_GENERICA.
        simulacaoComercialId: error ? null : (data as string),
        erro: error ? error.message : null,
      };
    },
  };

  return orquestrarAprovacaoAutoritativa(params, dependenciasReais);
}
