"use server";
// Solicitação de cálculo de programação do PCP (PCP-P8I-B4, integrado à
// reserva exclusiva + Worker supervisionada na Etapa 2O.8B-I6-B) -
// wrapper fino sobre orquestrarSolicitacaoCalculoPcp.ts, mesmo padrão
// de aprovarCenarioComercialAction.ts: a lógica testável vive no
// arquivo sem "use server", com dependências injetadas; este arquivo
// só monta as dependências REAIS.
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
// Esta Server Action NUNCA escreve programação oficial - monta a
// entrada do Motor e escalona dentro de uma Worker Thread
// supervisionada; o resultado devolvido ao navegador é só para
// análise. A reserva (iniciar_recalculo_pcp/finalizar_recalculo_pcp,
// contexto='solicitar_calculo') é controle de concorrência, nunca
// decisão de negócio - nunca move prioridade, nunca grava no Histórico
// de Prioridades, nunca inventa justificativa.
//
// PENDÊNCIA DE maxDuration (auditoria I6-B): a documentação do Next.js
// exige que `maxDuration` seja declarado no segmento de PÁGINA para
// afetar Server Actions - não há, hoje, nenhuma página real que chame
// esta action (achado: zero consumidor em src/app). MAX_DURATION_FUNCAO_SEGUNDOS
// (orcamentoTempoMotorPcp.ts) alimenta o cálculo interno de T_efetivo,
// mas a imposição REAL do limite pela Vercel sobre esta Server Action
// especificamente só poderá ser confirmada quando uma página existir e
// declarar `export const maxDuration` com o MESMO valor.
import { Worker } from "node:worker_threads";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";
import { montarEntradaMotorPcpSerializavel, type EntradaMotorPcpSerializavel } from "../lib/motor/montarEntradaMotorPcp";
import { executarComSupervisao, calcularLimiteEfetivoMs } from "../lib/motor/supervisorMotorPcp";
import {
  LIMITE_MOTOR_MS,
  MAX_DURATION_FUNCAO_MS,
  MARGEM_FINALIZACAO_MS,
  LIMITE_MINIMO_VIAVEL_MS,
  TTL_RESERVA_SEGUNDOS,
} from "../lib/motor/orcamentoTempoMotorPcp";
import {
  orquestrarSolicitacaoCalculoPcp,
  type DependenciasSolicitacaoCalculoPcp,
  type PayloadSolicitacaoCalculoPcp,
  type ResultadoSolicitacaoCalculoPcp,
} from "./orquestrarSolicitacaoCalculoPcp";

const PERMISSAO_SOLICITAR_CALCULO = "pcp.solicitar_calculo";
const CONTEXTO_RESERVA = "solicitar_calculo";

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

    calcularLimiteEfetivoMs: (tempoJaConsumidoMs) =>
      calcularLimiteEfetivoMs({
        limiteMotorMs: LIMITE_MOTOR_MS,
        maxDurationFuncaoMs: MAX_DURATION_FUNCAO_MS,
        tempoJaConsumidoMs,
        margemFinalizacaoMs: MARGEM_FINALIZACAO_MS,
        limiteMinimoViavelMs: LIMITE_MINIMO_VIAVEL_MS,
      }),

    iniciarReserva: async (empresaId, userId) => {
      const { data, error } = await serviceClient.rpc("iniciar_recalculo_pcp", {
        p_empresa_id: empresaId,
        p_iniciado_por: userId,
        p_contexto: CONTEXTO_RESERVA,
        p_ttl_segundos: TTL_RESERVA_SEGUNDOS,
      });
      if (error) throw new Error(error.message);
      const linha = data[0];
      return {
        execucaoId: linha.execucao_id as string,
        adquirida: linha.adquirida as boolean,
        motivo: linha.motivo as string,
        responsavelAtualNome: linha.responsavel_atual_nome as string,
      };
    },

    finalizarReserva: async (empresaId, execucaoId, situacao) => {
      const { data, error } = await serviceClient.rpc("finalizar_recalculo_pcp", {
        p_empresa_id: empresaId,
        p_execucao_id: execucaoId,
        p_situacao: situacao,
      });
      if (error) throw new Error(error.message);
      return data as boolean;
    },

    montarEntradaSerializavel: (userId, datasGradeCompartilhada) =>
      montarEntradaMotorPcpSerializavel(serviceClient, userId, datasGradeCompartilhada),

    // new Worker(new URL(...)) INLINE aqui dentro, por exigência de
    // rastreamento de asset do Turbopack (comprovado na I6-A) - nunca
    // movido para um helper. Toda a lógica de supervisão vem de
    // supervisorMotorPcp.ts (módulo único, reutilizado pelos dois
    // caminhos - I6-B e a futura I6-C).
    executarCalculoSupervisionado: async (entrada: EntradaMotorPcpSerializavel, limiteEfetivoMs: number) => {
      const worker = new Worker(new URL("../lib/motor/motorWorker.ts", import.meta.url), {
        workerData: entrada,
      });
      return executarComSupervisao(worker, { limiteMs: limiteEfetivoMs });
    },

    // ETAPA 2O.8B-I6H: concluir_execucao_motor_pcp via service_role (SECURITY
    // DEFINER, service_role-only, mesmo client já usado por
    // iniciarReserva/finalizarReserva acima). p_empresa_id e p_execucao_id
    // SEMPRE vêm dos parâmetros que o próprio orquestrador já resolveu
    // internamente (empresaId de resolverEmpresa, execucaoId da reserva
    // que esta mesma execução acabou de adquirir) - esta função nunca lê
    // paramsRecebidos (payload do cliente) nem resolve empresa/execução
    // por conta própria.
    concluirExecucao: async (params) => {
      const { data, error } = await serviceClient.rpc("concluir_execucao_motor_pcp", {
        p_empresa_id: params.empresaId,
        p_execucao_id: params.execucaoId,
        p_resultado: params.resultado,
        p_empresa_capacidade_versao_origem: params.empresaCapacidadeVersaoOrigem ?? null,
        p_janela_inicio: params.janelaInicio ?? null,
        p_janela_fim: params.janelaFim ?? null,
        p_ocorrencias: params.ocorrencias ?? null,
        p_motivo: params.motivo ?? null,
      });
      if (error) throw new Error(error.message);
      const linha = data[0];
      return {
        aceito: linha.aceito as boolean,
        resultadoEfetivo: linha.resultado_efetivo as string | null,
        programacaoId: linha.programacao_id as string | null,
        motivoRejeicao: linha.motivo_rejeicao as string | null,
      };
    },

    // ETAPA 2O.8B-I6H, condição 3: consulta de recuperação pós-falha de
    // comunicação - DELIBERADAMENTE o client de SESSÃO do usuário
    // (serverClient, RLS normal via pcp_recalculo_execucao_historico_select_tenant),
    // NUNCA o service_role - não precisa de privilégio elevado para ler o
    // próprio histórico, e usar o client de sessão aqui evita abrir uma
    // rota de leitura ampla entre empresas por engano.
    consultarHistoricoExecucao: async (execucaoId) => {
      const { data, error } = await serverClient
        .from("pcp_recalculo_execucao_historico")
        .select("resultado, programacao_id")
        .eq("execucao_id", execucaoId)
        .maybeSingle();
      if (error || !data) return null;
      return {
        resultado: data.resultado as "concluido" | "obsoleto" | "falhou_recuperavel",
        programacaoId: data.programacao_id as string | null,
      };
    },
  };

  return orquestrarSolicitacaoCalculoPcp(params, dependenciasReais);
}
