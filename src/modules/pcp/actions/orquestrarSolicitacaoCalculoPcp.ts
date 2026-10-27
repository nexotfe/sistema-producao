// Orquestrador da solicitação de cálculo de programação do PCP
// (PCP-P8I-B4, integrado à reserva exclusiva + Worker supervisionada na
// Etapa 2O.8B-I6-B) - mesmo princípio estrutural de
// orquestrarAprovacaoCenarioComercial.ts: extraído sem "use server"
// para ter dependências injetadas, testável sem sessão real do
// Supabase.
//
// CONTRATO DE SEGURANÇA: autorização (usuario_tem_permissao,
// 'pcp.solicitar_calculo') é verificada ANTES de qualquer leitura
// operacional ou execução do Motor - `naoAutenticado`/`naoAutorizado`
// retornam imediatamente. empresaId é SEMPRE resolvido aqui a partir do
// userId validado por `autenticar` (auth.getUser(), nunca
// auth.getSession()) - nunca aceito de `paramsRecebidos`.
//
// RESERVA EXCLUSIVA (I6-B): este caminho adquire a reserva com
// contexto='solicitar_calculo' - a MESMA tabela pcp_recalculo_execucao
// usada por mover-prioridade (contexto='alterar_prioridade'), que tem
// empresa_id como chave primária - adquirir aqui bloqueia o outro
// caminho da mesma empresa, e vice-versa (comprovado em sandbox na
// Parte 3). Este caminho NUNCA chama reordenar_fila_pcp, nunca grava no
// Histórico de Prioridades, nunca inventa uma justificativa de
// movimentação - só calcula.
//
// ORÇAMENTO DE TEMPO (auditoria I6-B): a reserva só é adquirida depois
// de confirmar que há margem seguran para o Motor rodar dentro do
// tempo restante da função (T_efetivo = min(240s, margem restante) -
// orcamentoTempoMotorPcp.ts) - nunca vale a pena bloquear a empresa por
// um pedido que já não teria tempo de concluir.
//
// VALIDAÇÃO DE CONCLUSÃO (I6-B): um resultado só é devolvido como
// sucesso se a Worker respondeu com 'concluido' E a versão de
// capacidade não mudou nem durante a montagem da entrada nem durante a
// execução do Motor. 'interrompido_por_limite' e 'erro_na_worker' NUNCA
// são reportados como sucesso - a reserva é finalizada como 'falhou' em
// ambos os casos, mas o motivo exposto ao chamador é específico (nunca
// um "falha_interna" genérico escondendo que foi um corte de tempo).
//
// CONTRATO DE CONFIABILIDADE DO RESULTADO: o objeto devolvido ao
// navegador é EXCLUSIVAMENTE para análise/exibição - nunca persiste
// programação oficial. `liberacaoReserva` nunca é omitido mesmo em caso
// de sucesso do cálculo - se a reserva não pôde ser confirmada como
// liberada, isso é reportado explicitamente (auditoria I6-B, item 3:
// "Motor concluiu" e "reserva liberada com sucesso" são informações
// DISTINTAS, nunca fundidas).
import type { ResultadoOcorrenciaEscalonada } from "@/modules/simulacao-comercial/lib/cenarios/escalonadorConjunto";
import type { ChaveOcorrenciaPcp } from "../lib/motor/chaveOcorrenciaPcp";
import type { EntradaMotorPcpSerializavel } from "../lib/motor/montarEntradaMotorPcp";
import type { ResultadoSupervisaoMotorPcp } from "../lib/motor/supervisorMotorPcp";
import {
  liberarReservaComTratamentoExplicito,
  type DependenciasReservaRecalculoPcp,
  type ResultadoLiberacaoReservaPcp,
} from "./reservaExclusivaRecalculoPcp";

export type { ResultadoLiberacaoReservaPcp };

export interface PayloadSolicitacaoCalculoPcp {
  dataInicial: string;
  dataFinal: string;
}

export interface OperacaoCalculadaPcp {
  opId: string;
  status: ResultadoOcorrenciaEscalonada<ChaveOcorrenciaPcp>["status"];
  dataInicioReal: string | null;
  dataFimReal: string | null;
  alocacoes: ResultadoOcorrenciaEscalonada<ChaveOcorrenciaPcp>["alocacoes"];
  deficitResidualHorasPadrao: number;
}

type ResultadoMotorMap = Map<string, ResultadoOcorrenciaEscalonada<ChaveOcorrenciaPcp>>;

export interface DependenciasSolicitacaoCalculoPcp extends DependenciasReservaRecalculoPcp {
  /** auth.getUser() no client de sessão - null se não autenticado. */
  autenticar: () => Promise<string | null>;
  /** usuario_tem_permissao(userId, 'pcp.solicitar_calculo') no client service_role. */
  autorizar: (userId: string) => Promise<boolean>;
  /** Resolve empresa_id a partir do userId JÁ validado - nunca do payload. */
  resolverEmpresa: (userId: string) => Promise<string | null>;
  /** Lê empresa_capacidade_versoes.versao da empresa - null se ausente/erro. */
  lerVersaoCapacidade: (empresaId: string) => Promise<number | null>;
  /** montarEntradaMotorPcpSerializavel real - forma plana, atravessa workerData. */
  montarEntradaSerializavel: (userId: string, datasGradeCompartilhada: string[]) => Promise<EntradaMotorPcpSerializavel>;
  /**
   * Calcula T_efetivo (ms) a partir do tempo já consumido desde o início
   * desta execução - null quando não há margem segura nem para o
   * mínimo viável (orcamentoTempoMotorPcp.ts). Nunca decidido aqui, só
   * repassado - a ligação real injeta os números oficiais.
   */
  calcularLimiteEfetivoMs: (tempoJaConsumidoMs: number) => number | null;
  /** Spawna a Worker real + supervisorMotorPcp.ts real - iniciarReserva/finalizarReserva nunca ficam aqui dentro. */
  executarCalculoSupervisionado: (
    entrada: EntradaMotorPcpSerializavel,
    limiteEfetivoMs: number,
  ) => Promise<ResultadoSupervisaoMotorPcp<ResultadoMotorMap>>;
}

/**
 * Etapa 2O.8B-I6-C: resultado de executarCalculoMotorSupervisionado -
 * NUNCA sabe de reserva (nem adquire, nem libera) - é usado tanto pelo
 * caminho independente (que possui sua própria reserva,
 * contexto='solicitar_calculo') quanto pelo recálculo decorrente de
 * mover prioridade (que reaproveita a reserva já aberta pelo
 * movimento, contexto='alterar_prioridade') - ver orquestrarMovimentoPrioridadePcp.ts.
 * Mesma régua em ambos: "Motor concluiu o cálculo" (ok:true) é uma
 * afirmação sobre o CONTRATO TÉCNICO do cálculo consultivo - nunca
 * sobre a programação oficial ter sido aprovada ou persistida.
 */
export type ResultadoCalculoMotorSupervisionado =
  | { ok: true; versaoCapacidadeUtilizada: string; operacoes: OperacaoCalculadaPcp[]; excluidas: EntradaMotorPcpSerializavel["excluidas"] }
  | { ok: false; motivo: "sem_margem_segura_para_executar" }
  | { ok: false; motivo: "versao_capacidade_indisponivel" }
  | { ok: false; motivo: "capacidade_mudou_durante_calculo" }
  /** A Worker foi interrompida pelo supervisor (limite de tempo) - NUNCA reportado como sucesso, mesmo que o Motor estivesse perto de terminar. */
  | { ok: false; motivo: "interrompido_por_limite_de_tempo" }
  /** A Worker reportou erro real ou encerrou inesperadamente - nunca confundido com interrupção deliberada por limite. */
  | { ok: false; motivo: "falha_na_worker"; detalhe: string }
  | { ok: false; motivo: "falha_interna"; detalhe: string };

export interface DependenciasExecutarCalculoMotorSupervisionado {
  lerVersaoCapacidade: (empresaId: string) => Promise<number | null>;
  montarEntradaSerializavel: (userId: string, datasGradeCompartilhada: string[]) => Promise<EntradaMotorPcpSerializavel>;
  calcularLimiteEfetivoMs: (tempoJaConsumidoMs: number) => number | null;
  executarCalculoSupervisionado: (
    entrada: EntradaMotorPcpSerializavel,
    limiteEfetivoMs: number,
  ) => Promise<ResultadoSupervisaoMotorPcp<ResultadoMotorMap>>;
}

export type ResultadoSolicitacaoCalculoPcp =
  | {
      ok: true;
      versaoCapacidadeUtilizada: string;
      janela: { dataInicial: string; dataFinal: string };
      operacoes: OperacaoCalculadaPcp[];
      excluidas: EntradaMotorPcpSerializavel["excluidas"];
      /** NUNCA omitido - "Motor concluiu" e "reserva liberada" são informações distintas (auditoria I6-B). */
      liberacaoReserva: ResultadoLiberacaoReservaPcp;
    }
  | { ok: false; motivo: "nao_autenticado" }
  | { ok: false; motivo: "nao_autorizado" }
  | { ok: false; motivo: "empresa_nao_resolvida" }
  | { ok: false; motivo: "janela_invalida"; detalhe: string }
  | { ok: false; motivo: "reserva_ocupada"; detalhe: { responsavelAtualNome: string; situacao: string } }
  | { ok: false; motivo: "falha_ao_iniciar_reserva"; detalhe: string }
  | Exclude<ResultadoCalculoMotorSupervisionado, { ok: true }>;

const REGEX_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function validarJanela(dataInicial: string, dataFinal: string): string | null {
  if (!REGEX_DATA_ISO.test(dataInicial) || !REGEX_DATA_ISO.test(dataFinal)) {
    return "dataInicial/dataFinal devem estar no formato YYYY-MM-DD.";
  }
  if (dataInicial > dataFinal) {
    return "dataInicial não pode ser posterior a dataFinal.";
  }
  return null;
}

/** Todos os dias corridos entre dataInicial e dataFinal, inclusive - a grade do Motor nunca é restrita a dias produtivos. Exportada para reuso (I6-C: recálculo decorrente de mover prioridade usa a MESMA grade, nunca uma segunda implementação). */
export function construirGradeDeDiasCorridos(dataInicial: string, dataFinal: string): string[] {
  const grade: string[] = [];
  let atual = new Date(`${dataInicial}T00:00:00Z`);
  const fim = new Date(`${dataFinal}T00:00:00Z`);
  while (atual.getTime() <= fim.getTime()) {
    grade.push(atual.toISOString().slice(0, 10));
    atual = new Date(atual.getTime() + 24 * 60 * 60 * 1000);
  }
  return grade;
}

function converterResultadoMotor(resultadoMotor: ResultadoMotorMap): OperacaoCalculadaPcp[] {
  // O Map do Motor não é diretamente serializável (bare Map -> "{}" em
  // JSON) - conversão explícita exigida (PCP-P8I-B4, preservada sem alteração).
  return Array.from(resultadoMotor.values()).map((resultado) => ({
    opId: resultado.chave.opId,
    status: resultado.status,
    dataInicioReal: resultado.dataInicioReal,
    dataFimReal: resultado.dataFimReal,
    alocacoes: resultado.alocacoes,
    deficitResidualHorasPadrao: resultado.deficitResidualHorasPadrao,
  }));
}

/**
 * Etapa 2O.8B-I6-C: núcleo de cálculo, extraído para ser reutilizado
 * tanto pelo caminho independente (abaixo) quanto pelo recálculo
 * decorrente de mover prioridade (orquestrarMovimentoPrioridadePcp.ts)
 * - NUNCA adquire nem libera reserva (isso é responsabilidade exclusiva
 * de cada chamador, cada um com seu próprio contexto). `inicioOrcamentoMs`
 * é o `Date.now()` do INÍCIO do orçamento de tempo total do chamador -
 * no caminho independente, é o início desta própria função; no
 * recálculo decorrente de movimento, é o início de TODA a operação
 * (auth + reserva + reordenação), para o tempo já gasto entrar no
 * cálculo de T_efetivo (auditoria I6-C, condição 3).
 */
export async function executarCalculoMotorSupervisionado(
  userId: string,
  empresaId: string,
  datasGradeCompartilhada: string[],
  inicioOrcamentoMs: number,
  deps: DependenciasExecutarCalculoMotorSupervisionado,
): Promise<ResultadoCalculoMotorSupervisionado> {
  const versaoAntes = await deps.lerVersaoCapacidade(empresaId);
  if (versaoAntes === null) {
    return { ok: false, motivo: "versao_capacidade_indisponivel" };
  }

  let entrada: EntradaMotorPcpSerializavel;
  try {
    entrada = await deps.montarEntradaSerializavel(userId, datasGradeCompartilhada);
  } catch (erro) {
    return { ok: false, motivo: "falha_interna", detalhe: erro instanceof Error ? erro.message : String(erro) };
  }

  const versaoDepoisMontagem = await deps.lerVersaoCapacidade(empresaId);
  if (versaoDepoisMontagem === null) {
    return { ok: false, motivo: "versao_capacidade_indisponivel" };
  }
  if (versaoAntes !== versaoDepoisMontagem) {
    return { ok: false, motivo: "capacidade_mudou_durante_calculo" };
  }

  // Recalculado AQUI, nunca no início da função (achado da auditoria do
  // PR #1) - contabiliza o tempo real já gasto pelas duas leituras de
  // versão de capacidade e pela montagem da entrada. O Motor nunca
  // inicia sem essa margem recalculada no momento real em que a Worker
  // seria disparada.
  const limiteEfetivoMs = deps.calcularLimiteEfetivoMs(Date.now() - inicioOrcamentoMs);
  if (limiteEfetivoMs === null) {
    return { ok: false, motivo: "sem_margem_segura_para_executar" };
  }

  const supervisao = await deps.executarCalculoSupervisionado(entrada, limiteEfetivoMs);

  if (supervisao.situacao === "interrompido_por_limite") {
    return { ok: false, motivo: "interrompido_por_limite_de_tempo" };
  }
  if (supervisao.situacao === "erro_na_worker") {
    return { ok: false, motivo: "falha_na_worker", detalhe: supervisao.mensagem };
  }
  if (supervisao.situacao === "saida_inesperada") {
    return { ok: false, motivo: "falha_na_worker", detalhe: `a Worker encerrou inesperadamente (exitCode=${supervisao.exitCode}).` };
  }

  // supervisao.situacao === "concluido" a partir daqui.
  const versaoDepoisCalculo = await deps.lerVersaoCapacidade(empresaId);
  if (versaoDepoisCalculo === null) {
    return { ok: false, motivo: "versao_capacidade_indisponivel" };
  }
  if (versaoAntes !== versaoDepoisCalculo) {
    return { ok: false, motivo: "capacidade_mudou_durante_calculo" };
  }

  return {
    ok: true,
    versaoCapacidadeUtilizada: String(versaoAntes),
    operacoes: converterResultadoMotor(supervisao.resultado),
    excluidas: entrada.excluidas,
  };
}

export async function orquestrarSolicitacaoCalculoPcp(
  paramsRecebidos: PayloadSolicitacaoCalculoPcp,
  deps: DependenciasSolicitacaoCalculoPcp,
): Promise<ResultadoSolicitacaoCalculoPcp> {
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

  const erroJanela = validarJanela(paramsRecebidos.dataInicial, paramsRecebidos.dataFinal);
  if (erroJanela) {
    return { ok: false, motivo: "janela_invalida", detalhe: erroJanela };
  }

  // Checado ANTES de tocar a reserva (preservado da I6-B) - nunca
  // bloqueia a empresa por um pedido sem tempo viável.
  const limiteEfetivoMsPreCheck = deps.calcularLimiteEfetivoMs(Date.now() - inicioExecucao);
  if (limiteEfetivoMsPreCheck === null) {
    return { ok: false, motivo: "sem_margem_segura_para_executar" };
  }

  let reserva;
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

  const datasGradeCompartilhada = construirGradeDeDiasCorridos(paramsRecebidos.dataInicial, paramsRecebidos.dataFinal);

  const resultadoCalculo = await executarCalculoMotorSupervisionado(userId, empresaId, datasGradeCompartilhada, inicioExecucao, deps);

  const situacaoFinal = resultadoCalculo.ok ? "concluida" : "falhou";
  const liberacaoReserva = await liberarReservaComTratamentoExplicito(deps, empresaId, reserva.execucaoId, situacaoFinal);

  if (!resultadoCalculo.ok) {
    if (!liberacaoReserva.liberada) {
      console.error("orquestrarSolicitacaoCalculoPcp: falha ao liberar reserva após falha do cálculo:", liberacaoReserva.detalhe);
    }
    return resultadoCalculo;
  }

  return {
    ok: true,
    versaoCapacidadeUtilizada: resultadoCalculo.versaoCapacidadeUtilizada,
    janela: { dataInicial: paramsRecebidos.dataInicial, dataFinal: paramsRecebidos.dataFinal },
    operacoes: resultadoCalculo.operacoes,
    excluidas: resultadoCalculo.excluidas,
    liberacaoReserva,
  };
}
