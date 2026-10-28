// Orquestrador do movimento de prioridade do PCP (Etapa 2O.3, integrado
// a reserva exclusiva na Etapa 2O.8B-I5 Parte 3) - mesmo princípio
// estrutural de orquestrarSolicitacaoCalculoPcp.ts: extraído sem "use
// server", dependências injetadas, testável sem sessão real.
//
// CONTRATO DE SEGURANÇA: autorização (usuario_tem_permissao,
// 'pcp.alterar_prioridade') é verificada ANTES de qualquer escrita -
// `naoAutenticado`/`naoAutorizado` retornam imediatamente, sem chamar
// `resolverEmpresa`, `iniciarReserva` nem `reordenarFila`. empresaId é
// SEMPRE resolvido aqui a partir do userId validado por `autenticar`
// (auth.getUser(), nunca auth.getSession()) - nunca aceito de
// `paramsRecebidos`.
//
// IDENTIDADE EM TODA A CADEIA (auditoria Parte 3, ressalva 4): o MESMO
// userId (vindo exclusivamente de deps.autenticar) é usado para
// adquirir a reserva (iniciarReserva) E para mover a fila
// (reordenarFila.movidoPor) - nunca dois valores diferentes, nunca lido
// de paramsRecebidos. A RPC reordenar_fila_pcp revalida isso de forma
// independente no banco (movido_por precisa ser EXATAMENTE o
// iniciado_por da reserva) - esta função nunca é a única barreira.
//
// PERMISSÃO POR CONTEXTO (auditoria Parte 3, ressalva da reabertura da
// Parte 1): a reserva é sempre adquirida com p_contexto='alterar_prioridade'
// neste fluxo - a função iniciar_recalculo_pcp decide internamente que
// isso exige 'pcp.alterar_prioridade' (nunca 'pcp.solicitar_calculo').
// A checagem de `autorizar` aqui e a checagem interna da RPC são
// INTENCIONALMENTE redundantes (defesa em profundidade, nunca uma
// substituindo a outra) - preserva a decisão original da Etapa 2O.3 de
// que mover prioridade exige somente 'pcp.alterar_prioridade', sem
// acoplar 'pcp.solicitar_calculo'.
//
// RECÁLCULO REAL, SUPERVISIONADO (Etapa 2O.8B-I6-C): `executarRecalculoConsultivo`
// agora aciona o Motor REAL dentro de uma Worker Thread supervisionada
// (mesmo supervisorMotorPcp.ts e mesma executarCalculoMotorSupervisionado
// de orquestrarSolicitacaoCalculoPcp.ts - nunca um segundo supervisor,
// nunca uma segunda reserva: esta reaproveita a reserva JÁ aberta por
// este próprio movimento, contexto='alterar_prioridade'). Antes da
// I6-C, este recálculo era deliberadamente simulado (achado registrado
// no histórico deste arquivo) - a simulação foi removida.
//
// VALIDAÇÃO AUTOMÁTICA (auditoria Parte 3/I6-C): a situação final da
// reserva ('concluida' ou 'falhou') reflete agora o `ok` do resultado
// REAL do cálculo (ResultadoCalculoMotorSupervisionado) - nunca apenas
// "a chamada não lançou exceção". Uma Worker interrompida pelo
// supervisor, ou com erro real, devolve um valor normal (ok:false),
// não uma exceção - por isso a regra não pode mais se basear só em
// try/catch (suficiente quando o recálculo era sempre simulado,
// insuficiente agora que pode falhar de formas reais e não-excepcionais).
// O try/catch permanece só como rede de segurança para uma exceção
// genuinamente inesperada. "Motor concluiu o cálculo" (ok:true)
// continua sendo uma afirmação sobre o CONTRATO TÉCNICO do cálculo
// consultivo - nunca sobre a previsão ter sido validada/persistida
// (isso é adiado para a futura integração com o Histórico de Previsões).
//
// ORÇAMENTO DE TEMPO (auditoria I6-C, condição 3): `inicioExecucao` é
// capturado no INÍCIO desta função (antes de autenticar) - o tempo já
// gasto com autenticação, aquisição da reserva e reordenação da fila
// ENTRA no orçamento de T_efetivo do recálculo decorrente. Se não
// houver margem segura depois de tudo isso, o recálculo não começa
// (sem_margem_segura_para_executar) - mas a prioridade e o histórico,
// já persistidos, nunca são desfeitos por isso.
//
// FINALIZAÇÃO DA RESERVA COM TRATAMENTO EXPLÍCITO (auditoria Parte 3,
// ressalva 3): se finalizarReserva falhar (exceção ou retorno false)
// DEPOIS que a prioridade e o histórico já foram persistidos com
// sucesso, o resultado retornado NUNCA aparenta que tudo terminou
// normalmente - `liberacaoReserva.liberada` é explicitamente false,
// com detalhe do que falhou. A reserva continua 'em_andamento' nesse
// caso, o que já bloqueia sozinho qualquer nova movimentação daquela
// empresa até uma recuperação segura (iniciarReserva de uma próxima
// tentativa receberá adquirida:false) - nenhum código extra de bloqueio
// é necessário, é uma consequência do próprio desenho da Parte 1.
//
// CONTRATO DE INTEGRIDADE: a reordenação (RPC real, já commitada) e o
// recálculo (consultivo, nunca persiste) NUNCA estão na mesma transação
// SQL. Se a reordenação tem sucesso e o recálculo falha depois, a
// prioridade NUNCA é desfeita - falha de análise não reverte uma
// decisão de negócio já registrada (decisão do proprietário, Etapa
// 2O.3, preservada sem alteração na Parte 3).
import type { ResultadoCalculoMotorSupervisionado, ResultadoMontagemOcorrenciasPersistenciaPcp } from "./orquestrarSolicitacaoCalculoPcp";
import { montarOcorrenciasParaPersistenciaPcp } from "./orquestrarSolicitacaoCalculoPcp";
import {
  liberarReservaComTratamentoExplicito,
  concluirExecucaoComTratamentoExplicito,
  type DependenciasReservaRecalculoPcp,
  type ResultadoIniciarReservaPcp,
  type ResultadoLiberacaoReservaPcp,
  type DependenciasConclusaoExecucaoMotorPcp,
  type ResultadoConclusaoExecucaoMotorPcp,
} from "./reservaExclusivaRecalculoPcp";

export type { ResultadoIniciarReservaPcp, ResultadoLiberacaoReservaPcp, ResultadoConclusaoExecucaoMotorPcp };

export interface PayloadMoverPrioridadePcp {
  projetoId: string;
  vizinhoAnteriorProjetoId: string | null;
  vizinhoSeguinteProjetoId: string | null;
  motivo: string;
  dataInicial: string;
  dataFinal: string;
}

/**
 * Etapa 2O.8B-I6-C: idêntico ao resultado do núcleo de cálculo
 * compartilhado (orquestrarSolicitacaoCalculoPcp.ts) - nunca um
 * formato paralelo. "falha_inesperada" cobre só uma exceção
 * genuinamente não prevista no contrato de executarRecalculoConsultivo
 * (rede de segurança, nunca o caminho normal).
 */
export type ResultadoRecalculoConsultivoPosMovimento =
  | ResultadoCalculoMotorSupervisionado
  | { ok: false; motivo: "falha_inesperada"; detalhe: string };

export interface DependenciasMoverPrioridadePcp extends DependenciasReservaRecalculoPcp, DependenciasConclusaoExecucaoMotorPcp {
  /** auth.getUser() no client de sessão - null se não autenticado. */
  autenticar: () => Promise<string | null>;
  /** usuario_tem_permissao(userId, 'pcp.alterar_prioridade') no client service_role. */
  autorizar: (userId: string) => Promise<boolean>;
  /** Resolve empresa_id a partir do userId JÁ validado - nunca do payload. */
  resolverEmpresa: (userId: string) => Promise<string | null>;
  // iniciarReserva/finalizarReserva herdados de DependenciasReservaRecalculoPcp
  // (reservaExclusivaRecalculoPcp.ts) - SEMPRE com contexto='alterar_prioridade'
  // na ligação real deste caminho (nunca escolhido pelo payload).
  /** reordenar_fila_pcp real (service_role) - nova assinatura com execucao_id + motivo. Lança em caso de erro da RPC. */
  reordenarFila: (params: {
    empresaId: string;
    projetoId: string;
    movidoPor: string;
    execucaoId: string;
    motivo: string;
    vizinhoAnteriorProjetoId: string | null;
    vizinhoSeguinteProjetoId: string | null;
  }) => Promise<{ posicaoNova: number; eventoHistoricoId: string }>;
  /**
   * Real a partir da I6-C - aciona o Motor real via supervisor+Worker,
   * reaproveitando a reserva já aberta por este movimento (nunca
   * adquire uma segunda). `inicioOrcamentoMs` inclui o tempo já gasto
   * desde o início desta operação (auth + reserva + reordenação).
   * Nunca lança por desenho (erros são absorvidos no próprio resultado
   * tipado); se lançar ainda assim, o orquestrador trata como falha
   * inesperada, nunca como sucesso.
   */
  executarRecalculoConsultivo: (
    userId: string,
    empresaId: string,
    dataInicial: string,
    dataFinal: string,
    inicioOrcamentoMs: number,
  ) => Promise<ResultadoRecalculoConsultivoPosMovimento>;
}

export type ResultadoMoverPrioridadePcp =
  | { ok: false; motivo: "nao_autenticado" }
  | { ok: false; motivo: "nao_autorizado" }
  | { ok: false; motivo: "empresa_nao_resolvida" }
  | { ok: false; motivo: "payload_invalido"; detalhe: string }
  /** A reserva não foi adquirida (ocupada por outra movimentação, ou em recuperação pendente) - nada foi tentado na fila. */
  | { ok: false; motivo: "reserva_ocupada"; detalhe: { responsavelAtualNome: string; situacao: string } }
  /** Erro inesperado ao tentar adquirir a reserva (ex.: usuário deixou de ter a permissão entre a checagem externa e a interna da RPC). */
  | { ok: false; motivo: "falha_ao_iniciar_reserva"; detalhe: string }
  /** A reordenação EM SI falhou - a prioridade não mudou. A reserva é liberada como 'falhou' em melhor esforço (log em caso de falha nessa liberação, nunca reportado ao chamador como erro adicional). */
  | { ok: false; motivo: "falha_reordenacao"; detalhe: string }
  /**
   * A reordenação teve sucesso (prioridade e histórico JÁ persistidos,
   * nunca desfeitos a partir daqui, mesmo que `recalculo.ok` seja
   * false). `liberacaoReserva.liberada` pode ser false mesmo com
   * ok:true - isso NUNCA significa que a movimentação falhou,
   * significa que a reserva ficou 'em_andamento' e precisa de
   * recuperação antes de uma próxima tentativa.
   */
  | {
      ok: true;
      posicaoNova: number;
      eventoHistoricoId: string;
      recalculo: ResultadoRecalculoConsultivoPosMovimento;
      /**
       * ETAPA 2O.8B-I6H: null especificamente quando `recalculo` for
       * "falha_inesperada" ou "estado_desconhecido_apos_falha" - os
       * ÚNICOS casos de incerteza genuína sobre o Motor/Worker, em que
       * NADA é feito com a reserva (ver corpo da função). Em qualquer
       * outro caso (sucesso ou falha CONFIRMADA do cálculo), é sempre o
       * resultado real de concluirExecucaoComTratamentoExplicito - nunca
       * omitido (mesmo princípio de transparência da antiga liberacaoReserva).
       */
      conclusaoExecucao: ResultadoConclusaoExecucaoMotorPcp | null;
    };

const REGEX_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function validarPayload(payload: PayloadMoverPrioridadePcp): string | null {
  if (!payload.projetoId) return "projetoId é obrigatório.";
  if (payload.vizinhoAnteriorProjetoId === null && payload.vizinhoSeguinteProjetoId === null) {
    return "informe ao menos um vizinho (anterior ou seguinte) - mesma exigência de reordenar_fila_pcp.";
  }
  if (payload.vizinhoAnteriorProjetoId === payload.projetoId || payload.vizinhoSeguinteProjetoId === payload.projetoId) {
    return "o próprio projeto não pode ser seu vizinho.";
  }
  if (!payload.motivo || payload.motivo.trim().length === 0) {
    return "motivo (justificativa) é obrigatório.";
  }
  if (!REGEX_DATA_ISO.test(payload.dataInicial) || !REGEX_DATA_ISO.test(payload.dataFinal)) {
    return "dataInicial/dataFinal devem estar no formato YYYY-MM-DD.";
  }
  if (payload.dataInicial > payload.dataFinal) {
    return "dataInicial não pode ser posterior a dataFinal.";
  }
  return null;
}

export async function orquestrarMovimentoPrioridadePcp(
  payload: PayloadMoverPrioridadePcp,
  deps: DependenciasMoverPrioridadePcp,
): Promise<ResultadoMoverPrioridadePcp> {
  // Orçamento de tempo do recálculo decorrente conta a partir de AQUI
  // (auditoria I6-C, condição 3) - inclui autenticação, aquisição da
  // reserva e reordenação da fila, nunca só o tempo a partir do
  // recálculo em si.
  const inicioExecucao = Date.now();

  const userId = await deps.autenticar();
  if (!userId) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  const autorizado = await deps.autorizar(userId);
  if (!autorizado) {
    return { ok: false, motivo: "nao_autorizado" };
  }

  const empresaId = await deps.resolverEmpresa(userId);
  if (!empresaId) {
    return { ok: false, motivo: "empresa_nao_resolvida" };
  }

  const erroPayload = validarPayload(payload);
  if (erroPayload) {
    return { ok: false, motivo: "payload_invalido", detalhe: erroPayload };
  }

  let reserva: ResultadoIniciarReservaPcp;
  try {
    reserva = await deps.iniciarReserva(empresaId, userId);
  } catch (erro) {
    return { ok: false, motivo: "falha_ao_iniciar_reserva", detalhe: erro instanceof Error ? erro.message : String(erro) };
  }
  if (!reserva.adquirida) {
    return {
      ok: false,
      motivo: "reserva_ocupada",
      detalhe: { responsavelAtualNome: reserva.responsavelAtualNome, situacao: reserva.motivo },
    };
  }

  let posicaoNova: number;
  let eventoHistoricoId: string;
  try {
    const resultado = await deps.reordenarFila({
      empresaId,
      projetoId: payload.projetoId,
      movidoPor: userId,
      execucaoId: reserva.execucaoId,
      motivo: payload.motivo,
      vizinhoAnteriorProjetoId: payload.vizinhoAnteriorProjetoId,
      vizinhoSeguinteProjetoId: payload.vizinhoSeguinteProjetoId,
    });
    posicaoNova = resultado.posicaoNova;
    eventoHistoricoId = resultado.eventoHistoricoId;
  } catch (erro) {
    const liberacao = await liberarReservaComTratamentoExplicito(deps, empresaId, reserva.execucaoId, "falhou");
    if (!liberacao.liberada) {
      // Melhor esforço: a prioridade nunca mudou neste ramo, então não
      // há risco de "aparentar sucesso" - só registramos para
      // diagnóstico, sem adicionar um segundo motivo de erro ao chamador.
      console.error("orquestrarMovimentoPrioridadePcp: falha ao liberar reserva após falha de reordenação:", liberacao.detalhe);
    }
    return { ok: false, motivo: "falha_reordenacao", detalhe: erro instanceof Error ? erro.message : String(erro) };
  }

  let recalculo: ResultadoRecalculoConsultivoPosMovimento;
  try {
    recalculo = await deps.executarRecalculoConsultivo(userId, empresaId, payload.dataInicial, payload.dataFinal, inicioExecucao);
  } catch (erro) {
    recalculo = { ok: false, motivo: "falha_inesperada", detalhe: erro instanceof Error ? erro.message : String(erro) };
  }
  // "Motor concluiu o cálculo" (ok:true) nunca significa "exceção não
  // foi lançada" - uma Worker interrompida ou com erro real devolve um
  // valor normal (ok:false), por desenho (ver cabeçalho do arquivo).

  // ETAPA 2O.8B-I6H, MUDANÇA DE COMPORTAMENTO DELIBERADA: "falha_inesperada"
  // e "estado_desconhecido_apos_falha" são os ÚNICOS casos de incerteza
  // GENUÍNA sobre o Motor/Worker - o primeiro porque executarRecalculoConsultivo
  // lançou algo fora do seu próprio contrato ("nunca lança por desenho");
  // o segundo porque o supervisor não conseguiu confirmar o encerramento
  // da Worker dentro da margem de segurança (supervisorMotorPcp.ts).
  // Diferente de QUALQUER outro motivo de ResultadoCalculoMotorSupervisionado
  // (sempre uma falha CONFIRMADA, pela garantia do supervisor), aqui
  // genuinamente não sabemos o que aconteceu - NUNCA presumir, NUNCA
  // tocar a reserva por conta própria (nem concluirExecucao, nem o
  // antigo finalizarReserva) - deixa seguir seu curso normal
  // (expira_em/recuperacao_pendente, DEC-009). A prioridade e o
  // Histórico de Prioridades, já persistidos antes deste ponto, nunca
  // são afetados por essa incerteza.
  if (!recalculo.ok && (recalculo.motivo === "falha_inesperada" || recalculo.motivo === "estado_desconhecido_apos_falha")) {
    return { ok: true, posicaoNova, eventoHistoricoId, recalculo, conclusaoExecucao: null };
  }

  if (!recalculo.ok) {
    const conclusaoExecucao = await concluirExecucaoComTratamentoExplicito(deps, {
      empresaId,
      execucaoId: reserva.execucaoId,
      resultado: "falhou_recuperavel",
      motivo: recalculo.motivo,
    });
    return { ok: true, posicaoNova, eventoHistoricoId, recalculo, conclusaoExecucao };
  }

  // ETAPA 2O.8B-I6H: monta o payload de persistência a partir da MESMA
  // entrada usada no cálculo (recalculo.entrada) - nunca uma segunda
  // consulta ao banco (condição 2 do desenho aprovado).
  const montagem: ResultadoMontagemOcorrenciasPersistenciaPcp = montarOcorrenciasParaPersistenciaPcp(recalculo.operacoes, recalculo.entrada);
  if (!montagem.ok) {
    const conclusaoExecucao = await concluirExecucaoComTratamentoExplicito(deps, {
      empresaId,
      execucaoId: reserva.execucaoId,
      resultado: "falhou_recuperavel",
      motivo: `inconsistencia_ao_montar_persistencia: ${montagem.motivo} (opId=${montagem.opId})`,
    });
    return { ok: true, posicaoNova, eventoHistoricoId, recalculo, conclusaoExecucao };
  }

  const conclusaoExecucao = await concluirExecucaoComTratamentoExplicito(deps, {
    empresaId,
    execucaoId: reserva.execucaoId,
    resultado: "concluido",
    empresaCapacidadeVersaoOrigem: Number(recalculo.versaoCapacidadeUtilizada),
    janelaInicio: payload.dataInicial,
    janelaFim: payload.dataFinal,
    ocorrencias: montagem.ocorrencias,
  });

  return { ok: true, posicaoNova, eventoHistoricoId, recalculo, conclusaoExecucao };
}
