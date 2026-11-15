"use server";
// PCP-Etapa2O.3 / Etapa2O.8B-I5 Parte 3: movimento de prioridade de um
// projeto na fila do PCP, protegido por reserva exclusiva por empresa -
// wrapper fino sobre orquestrarMovimentoPrioridadePcp.ts, mesmo padrão
// de solicitarCalculoProgramacaoPcpAction.ts: a lógica testável vive no
// arquivo sem "use server", com dependências injetadas; este arquivo
// só monta as dependências REAIS.
//
// Mesmo DESVIO deliberado já documentado em solicitarCalculoProgramacaoPcpAction.ts:
// o client service_role precisa existir ANTES da checagem de
// autorização, porque usuario_tem_permissao() é service_role-only por
// desenho (PCP-P8I-B2). O userId passado a ele já foi validado por
// auth.getUser() no client de sessão, nunca aceito do corpo da requisição.
//
// Esta Server Action GRAVA a nova posição e o evento do Histórico de
// Prioridades (via reordenar_fila_pcp, RPC real) - é a única escrita de
// negócio do fluxo. A reserva (iniciar_recalculo_pcp/finalizar_recalculo_pcp)
// é controle de concorrência, nunca decisão de negócio.
//
// RECÁLCULO REAL, SUPERVISIONADO (Etapa 2O.8B-I6-C): `executarRecalculoConsultivo`
// aciona o Motor real dentro de uma Worker Thread supervisionada,
// reaproveitando executarCalculoMotorSupervisionado (núcleo
// compartilhado com solicitarCalculoProgramacaoPcpAction.ts - nunca uma
// segunda implementação) e a reserva JÁ aberta por este movimento
// (contexto='alterar_prioridade') - nunca adquire uma segunda reserva.
import { Worker } from "node:worker_threads";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";
import {
  montarEntradaMotorPcpSerializavel,
  montarIngredientesMotorPcp,
  type EntradaMotorPcpSerializavel,
} from "../lib/motor/montarEntradaMotorPcp";
import { executarComSupervisao, calcularLimiteEfetivoMs } from "../lib/motor/supervisorMotorPcp";
import {
  LIMITE_MOTOR_MS,
  MAX_DURATION_FUNCAO_MS,
  MARGEM_FINALIZACAO_MS,
  LIMITE_MINIMO_VIAVEL_MS,
  TTL_RESERVA_SEGUNDOS,
} from "../lib/motor/orcamentoTempoMotorPcp";
import { executarCalculoMotorSupervisionado, type DependenciasExecutarCalculoMotorSupervisionado } from "./orquestrarSolicitacaoCalculoPcp";
import {
  orquestrarMovimentoPrioridadePcp,
  type DependenciasMoverPrioridadePcp,
  type PayloadMoverPrioridadePcp,
  type ResultadoMoverPrioridadePcp,
} from "./orquestrarMovimentoPrioridadePcp";
import { resolverGradeProdutivaNecessariaPcp } from "../lib/motor/ampliarGradeProdutivaPcp";
import { executarRecalculoHorizonteDinamicoPcp } from "./executarRecalculoHorizonteDinamicoPcp";

const PERMISSAO_ALTERAR_PRIORIDADE = "pcp.alterar_prioridade";
const CONTEXTO_RESERVA = "alterar_prioridade";

function validarPayload(paramsRecebidos: unknown): PayloadMoverPrioridadePcp | null {
  if (typeof paramsRecebidos !== "object" || paramsRecebidos === null) return null;
  const { projetoId, vizinhoAnteriorProjetoId, vizinhoSeguinteProjetoId, motivo } =
    paramsRecebidos as Record<string, unknown>;
  if (typeof projetoId !== "string" || !projetoId) return null;
  if (vizinhoAnteriorProjetoId !== null && typeof vizinhoAnteriorProjetoId !== "string") return null;
  if (vizinhoSeguinteProjetoId !== null && typeof vizinhoSeguinteProjetoId !== "string") return null;
  if (typeof motivo !== "string") return null;
  return {
    projetoId,
    vizinhoAnteriorProjetoId: (vizinhoAnteriorProjetoId as string | null) ?? null,
    vizinhoSeguinteProjetoId: (vizinhoSeguinteProjetoId as string | null) ?? null,
    motivo,
  };
}

export async function moverPrioridadeProjetoPcpAction(
  paramsRecebidos: unknown,
): Promise<ResultadoMoverPrioridadePcp> {
  const payload = validarPayload(paramsRecebidos);
  if (!payload) {
    return { ok: false, motivo: "payload_invalido", detalhe: "payload malformado - projetoId/motivo ausentes ou com tipo inválido." };
  }

  const serverClient = await createSupabaseServerClient();
  const serviceClient = createSupabaseServiceClient();

  const dependenciasReais: DependenciasMoverPrioridadePcp = {
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
        p_chave: PERMISSAO_ALTERAR_PRIORIDADE,
      });
      if (error) return false;
      return data === true;
    },

    resolverEmpresa: async (userId) => {
      const { data, error } = await serviceClient.from("usuarios").select("empresa_id").eq("id", userId).maybeSingle();
      if (error || !data) return null;
      return data.empresa_id as string;
    },

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

    reordenarFila: async ({ empresaId, projetoId, movidoPor, execucaoId, motivo, vizinhoAnteriorProjetoId, vizinhoSeguinteProjetoId }) => {
      const { data, error } = await serviceClient.rpc("reordenar_fila_pcp", {
        p_empresa_id: empresaId,
        p_projeto_id: projetoId,
        p_movido_por: movidoPor,
        p_execucao_id: execucaoId,
        p_motivo: motivo,
        p_vizinho_anterior_projeto_id: vizinhoAnteriorProjetoId,
        p_vizinho_seguinte_projeto_id: vizinhoSeguinteProjetoId,
      });
      if (error) throw new Error(error.message);
      const linha = data[0];
      return { posicaoNova: linha.posicao_nova as number, eventoHistoricoId: linha.evento_historico_id as string };
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

    // PCP-B1-HORIZONTE: substitui a antiga janela fixa (dataInicial/
    // dataFinal vindos do payload da UI, hoje..+6 dias) por um horizonte
    // DINÂMICO, calculado a partir do backlog elegível real da empresa -
    // nunca um número de dias fixo (7/90/365/400). Duas fases:
    //
    // Fase 1 (estimativa, barata): monta os ingredientes reais do Motor
    // (mesma função que montarEntradaMotorPcpSerializavel usa por
    // dentro - nenhuma segunda implementação de busca/regra de negócio)
    // com uma grade-placeholder de 1 dia (ocorrências/dependências/
    // candidatos não dependem da grade, só o calendário depende) e
    // calcula um PONTO DE PARTIDA (gargalo de recurso + caminho
    // crítico, estimarHorizonteNecessarioPcp.ts) - nunca uma garantia.
    //
    // Fase 2 (execução real + verificação + ampliação sob orçamento):
    // roda o Motor de verdade com essa grade; se algum item tiver
    // déficit residual E sua última alocação cair no último dia
    // PRODUTIVO da grade (nunca o último dia corrido - dias sem
    // expediente no fim da janela não podem mascarar esse sinal), isso
    // é tratado como possível horizonte insuficiente - a grade é
    // ampliada e o Motor roda de novo, DENTRO do mesmo orçamento de
    // tempo já existente (nunca um novo teto de dias). Se uma ampliação
    // não mudar NENHUM resultado (nem déficit, nem data), ou se o
    // orçamento se esgotar, a função retorna falha explícita
    // ("horizonte_nao_confirmado_dentro_do_orcamento") - NUNCA finge que
    // o backlog inteiro foi programado.
    executarRecalculoConsultivo: async (userId, empresaId, inicioOrcamentoMs) => {
      const depsExecucaoMotor: DependenciasExecutarCalculoMotorSupervisionado = {
        lerVersaoCapacidade: async (empresaIdLeitura: string) => {
          const { data, error } = await serviceClient
            .from("empresa_capacidade_versoes")
            .select("versao")
            .eq("empresa_id", empresaIdLeitura)
            .maybeSingle();
          if (error || !data) return null;
          return data.versao as number;
        },
        calcularLimiteEfetivoMs: (tempoJaConsumidoMs: number) =>
          calcularLimiteEfetivoMs({
            limiteMotorMs: LIMITE_MOTOR_MS,
            maxDurationFuncaoMs: MAX_DURATION_FUNCAO_MS,
            tempoJaConsumidoMs,
            margemFinalizacaoMs: MARGEM_FINALIZACAO_MS,
            limiteMinimoViavelMs: LIMITE_MINIMO_VIAVEL_MS,
          }),
        montarEntradaSerializavel: (userIdEntrada: string, datas: string[]) =>
          montarEntradaMotorPcpSerializavel(serviceClient, userIdEntrada, datas),
        // new Worker(new URL(...)) INLINE aqui dentro, exigência de
        // rastreamento de asset do Turbopack (comprovada na I6-A) -
        // mesmo módulo supervisorMotorPcp.ts reutilizado por todos os
        // caminhos, nunca um segundo supervisor.
        executarCalculoSupervisionado: async (entrada: EntradaMotorPcpSerializavel, limiteEfetivoMs: number) => {
          const worker = new Worker(new URL("../lib/motor/motorWorker.ts", import.meta.url), { workerData: entrada });
          return executarComSupervisao(worker, { limiteMs: limiteEfetivoMs });
        },
      };

      const hoje = new Date().toISOString().slice(0, 10);

      // A lógica de estimativa/ampliação/verificação em si é 100%
      // testável sem I/O real (executarRecalculoHorizonteDinamicoPcp.ts)
      // - este bloco só monta as dependências REAIS (service client,
      // Worker, relógio), mesmo princípio de todo o resto do arquivo.
      return executarRecalculoHorizonteDinamicoPcp({
        dataInicio: hoje,
        agoraMs: () => Date.now(),
        margemRestanteMs: () => MAX_DURATION_FUNCAO_MS - (Date.now() - inicioOrcamentoMs) - MARGEM_FINALIZACAO_MS,
        limiteMinimoViavelMs: LIMITE_MINIMO_VIAVEL_MS,
        montarIngredientesEstimativa: async () => {
          const ingredientes = await montarIngredientesMotorPcp(serviceClient, userId, [hoje]);
          return {
            ocorrencias: ingredientes.ocorrencias,
            dependencias: ingredientes.dependencias,
            candidatos: ingredientes.candidatosIngredientes,
          };
        },
        resolverGradeProdutiva: (params) =>
          resolverGradeProdutivaNecessariaPcp({
            client: serviceClient,
            empresaId,
            dataInicio: params.dataInicio,
            diasProdutivosNecessarios: params.diasProdutivosNecessarios,
            agoraMs: () => Date.now(),
            prazoFinalMs: params.prazoFinalMs,
          }),
        executarCalculoMotor: (datasGradeCompartilhada) =>
          executarCalculoMotorSupervisionado(userId, empresaId, datasGradeCompartilhada, inicioOrcamentoMs, depsExecucaoMotor),
      });
    },

    // ETAPA 2O.8B-I6H: mesma ligação real de solicitarCalculoProgramacaoPcpAction.ts
    // - p_empresa_id/p_execucao_id sempre vêm dos parâmetros já resolvidos
    // pelo orquestrador (nunca de paramsRecebidos/payload do cliente).
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

    // ETAPA 2O.8B-I6H, condição 3: client de SESSÃO (serverClient, RLS
    // normal) - NUNCA service_role, mesmo princípio de
    // solicitarCalculoProgramacaoPcpAction.ts.
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

  return orquestrarMovimentoPrioridadePcp(payload, dependenciasReais);
}
