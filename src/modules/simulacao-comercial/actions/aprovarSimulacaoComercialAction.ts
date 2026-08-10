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
// Fase 2 do rollout de DEC-006: persiste nativamente via RPC v5
// (aprovar_projeto_com_simulacao_v5), que acrescenta os 4 campos do
// Calculador Reverso ao snapshot. v4/v3/v2/v1 permanecem intactas no
// banco, sem EXECUTE para authenticated (nunca tiveram), só como
// caminho de rollback técnico manual - não há fallback automático para
// v4 nesta função: falha na chamada da v5 é sempre um erro visível ao
// usuário, nunca uma persistência silenciosa por outra via.
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
import { simularCapacidadeProjetoComBaseFixa } from "../lib/executarSimulacao";
import { prepararJanelaComercial } from "../lib/prepararJanelaComercial";
import { prepararBaseFixaMotor } from "../lib/prepararEntradasMotor";
import {
  prepararContextoCalculadorReverso,
  calcularEstimativaInicioNecessarioComContexto,
} from "../lib/prepararCalculadorReverso";
import { persistirViaRpcV5 } from "../lib/persistirViaRpcV5";
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

    // DEC-006 (correção): prepara a base fixa (roteiro/recursos/
    // comprometido) e o contexto de calendário UMA ÚNICA VEZ,
    // sequencialmente - mesmo padrão já usado no preview do cliente
    // (SimulacaoCapacidade.tsx). Compartilhada entre executarMotor e
    // estimarInicioNecessario logo abaixo, nunca preparada duas vezes.
    prepararBaseAutoritativa: async (empresaId, projetoId, prazoInterno) => {
      const baseFixa = await prepararBaseFixaMotor(serverClient, empresaId, projetoId);
      const { P, contexto, diasCivisExaminados } = await prepararContextoCalculadorReverso(
        serverClient,
        empresaId,
        prazoInterno,
      );
      return { baseFixa, contexto, P, diasCivisExaminados };
    },

    executarMotor: (empresaId, base, janelaInicio, janelaFim) =>
      simularCapacidadeProjetoComBaseFixa(serverClient, empresaId, base.baseFixa, janelaInicio, janelaFim, {
        contexto: base.contexto,
      }),

    // DEC-006 - recálculo autoritativo do Calculador Reverso, sobre a
    // MESMA base/contexto já preparados por prepararBaseAutoritativa.
    estimarInicioNecessario: (empresaId, base, prazoInterno, dataDisponibilidadeProducao) =>
      calcularEstimativaInicioNecessarioComContexto(
        serverClient,
        empresaId,
        base.baseFixa,
        base.P,
        base.contexto,
        prazoInterno,
        dataDisponibilidadeProducao,
        base.diasCivisExaminados,
      ),

    // `p.itens` aqui é sempre revalidacaoServidor.itensPorOperacao e
    // `p.estimativa` é sempre o resultadoEstimativa recalculado (ver
    // orquestrarAprovacaoAutoritativa.ts) - nunca o que o navegador
    // enviou. O cliente privilegiado (service_role) só é criado aqui
    // dentro, nunca exposto ao módulo client-side. persistirViaRpcV5
    // isola a chamada de rede à RPC v5 (mapeamento dos 17 parâmetros +
    // chamada) atrás de um client injetável, testável com um client
    // Supabase simulado (persistirViaRpcV5.test.ts) - correção 4
    // (error.message nunca repassado ao usuário) continua valendo, só
    // que agora dentro do helper.
    persistir: (p) => {
      const serviceClient = createSupabaseServiceClient();

      return persistirViaRpcV5(serviceClient, {
        aprovadoPor: p.aprovadoPor,
        projetoId: p.projetoId,
        cenarioDemanda: p.cenarioDemanda,
        modoProducao: p.modoProducao,
        dataNecessidade: p.dataNecessidade,
        margemSegurancaDias: p.margemSegurancaDias,
        dataPrevistaAprovacaoPedido: p.dataPrevistaAprovacaoPedido,
        dataChegadaPrevista: p.dataChegadaPrevista,
        janelaInicio: p.janelaInicio,
        janelaFim: p.janelaFim,
        estimativa: p.estimativa,
        itens: p.itens,
        chaveIdempotencia: p.chaveIdempotencia,
        hashSolicitacao: p.hashSolicitacao,
      });
    },
  };

  return orquestrarAprovacaoAutoritativa(params, dependenciasReais);
}
