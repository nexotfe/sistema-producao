// Etapa 2O.8B-I6-A: supervisor único e genérico de uma Worker Thread -
// mesma mecânica já comprovada na P1 (poc-worker/supervisor.mjs:
// race entre a mensagem de resultado e o timeout de corte, terminate()
// como confirmação REAL de encerramento, guarda contra 'exit' chegar
// antes da Promise de terminate() resolver). Nunca constrói a Worker
// (new Worker(new URL(...)) precisa ficar inline na função exportada do
// chamador, por exigência de rastreamento de asset do Turbopack - ver
// cabeçalho de motorWorker.ts) - recebe a instância já criada. Nunca
// sabe nada sobre reserva, PCP ou Motor - só supervisiona qualquer
// Worker que fale o protocolo "uma mensagem de resultado, ou erro, ou
// saída".
import type { Worker } from "node:worker_threads";

export type ResultadoSupervisaoMotorPcp<TResultado> =
  | { situacao: "concluido"; resultado: TResultado; tempoTotalMs: number }
  | { situacao: "interrompido_por_limite"; tempoTotalMs: number; via: "evento_exit" | "evento_error" | "promise_terminate" }
  | { situacao: "erro_na_worker"; mensagem: string; tempoTotalMs: number }
  | { situacao: "saida_inesperada"; exitCode: number; tempoTotalMs: number }
  /**
   * ETAPA 2O.8B-I6H: reportado SOMENTE quando um `error` isolado (nunca
   * causado pelo nosso próprio corte por limite) não pôde ser confirmado
   * como encerramento real dentro de `margemConfirmacaoTerminateMs` - nem
   * a Promise de `terminate()` resolveu, nem um `exit` chegou. NUNCA
   * presumido como falha recuperável comprovada - equivalente, no nível
   * da reserva do PCP, ao mesmo "estado desconhecido" que hoje só
   * `recuperacao_pendente`/confirmação humana resolve (DEC-009).
   */
  | { situacao: "estado_desconhecido"; tempoTotalMs: number; origem: "margem_confirmacao_terminate_esgotada" };

const MARGEM_CONFIRMACAO_TERMINATE_PADRAO_MS = 5_000;

export interface OpcoesSupervisaoMotorPcp {
  /** T_efetivo já resolvido pelo chamador (nunca decidido aqui - ver DEC do orçamento de tempo, I6-A). */
  limiteMs: number;
  /**
   * ETAPA 2O.8B-I6H: teto de espera por confirmação REAL de encerramento
   * (Promise de `terminate()` resolvida, ou um `exit` chegando) depois
   * de um `error` isolado - NUNCA presumido como sucesso de confirmação
   * se esgotar (ver `estado_desconhecido` acima). Não é uma regra de
   * negócio do PCP - é só o teto técnico de espera por uma confirmação
   * de runtime do Node, por isso tem um default técnico (5s, margem
   * generosa frente aos 2-19ms de confirmação real medidos em sandbox
   * nesta sessão) em vez de ser obrigatório como a margem adicional de
   * `confirmar_recuperacao_pcp` (essa sim é decisão de negócio do
   * proprietário, DEC-009, nunca com default silencioso).
   */
  margemConfirmacaoTerminateMs?: number;
}

/**
 * Supervisiona UMA Worker já construída até: (a) receber uma mensagem
 * de resultado, (b) o limite expirar (terminate() + confirmação real de
 * encerramento), (c) a Worker emitir 'error', ou (d) a Worker encerrar
 * inesperadamente ('exit' sem resultado nem corte). Nunca reinicia,
 * nunca tenta de novo - decisão de retry é do chamador, nunca do
 * supervisor.
 */
export function executarComSupervisao<TResultado>(
  worker: Worker,
  opcoes: OpcoesSupervisaoMotorPcp,
): Promise<ResultadoSupervisaoMotorPcp<TResultado>> {
  const margemConfirmacaoTerminateMs = opcoes.margemConfirmacaoTerminateMs ?? MARGEM_CONFIRMACAO_TERMINATE_PADRAO_MS;
  return new Promise((resolve) => {
    const inicio = Date.now();
    let finalizado = false;
    let timeoutLimite: ReturnType<typeof setTimeout> | null = null;
    let timeoutMargemConfirmacao: ReturnType<typeof setTimeout> | null = null;
    // ACHADO DO PoC P1: o evento 'exit' pode chegar ANTES (ou na mesma
    // volta de microtask) da Promise de worker.terminate() resolver -
    // sem este sinalizador, 'exit' classificaria incorretamente um
    // encerramento DELIBERADO como "saída inesperada".
    let encerramentoSolicitadoPorLimite = false;
    // ETAPA 2O.8B-I6H: quando um 'error' isolado chega (nunca causado
    // pelo nosso próprio corte por limite), a confirmação de
    // encerramento fica pendente aqui - um 'exit' que chegue enquanto
    // isso está pendente CANCELA a corrida contra a margem de
    // confirmação e resolve com a MENSAGEM ORIGINAL preservada (achado
    // real de sandbox nesta sessão: 'exit' quase sempre chega antes da
    // Promise de terminate() resolver - sem isso, a mensagem original se
    // perderia atrás de um 'saida_inesperada' genérico).
    let confirmacaoErroPendente: { mensagem: string } | null = null;

    function concluirComo(valor: ResultadoSupervisaoMotorPcp<TResultado>) {
      if (finalizado) return; // guarda contra callbacks duplicados (ex.: message + exit, error + exit).
      finalizado = true;
      if (timeoutLimite) clearTimeout(timeoutLimite);
      if (timeoutMargemConfirmacao) clearTimeout(timeoutMargemConfirmacao);
      resolve(valor);
    }

    worker.on("message", (resultado: TResultado) => {
      concluirComo({ situacao: "concluido", resultado, tempoTotalMs: Date.now() - inicio });
    });

    worker.on("error", (erro: Error) => {
      if (finalizado) return;
      if (encerramentoSolicitadoPorLimite) {
        // Achado da auditoria do PR #1: este handler reage ao evento
        // 'error', nunca 'exit' - rótulo distinto do handler de exit,
        // duas linhas abaixo, para nunca confundir qual evento do Node
        // realmente disparou numa investigação futura (DEC-009 §3).
        concluirComo({ situacao: "interrompido_por_limite", tempoTotalMs: Date.now() - inicio, via: "evento_error" });
        return;
      }
      // ETAPA 2O.8B-I6H: um 'error' isolado NUNCA é, por si só, prova de
      // encerramento - a Worker pode continuar existindo/com trabalho
      // pendente depois de emitir 'error'. Confirmamos explicitamente
      // com terminate() antes de reportar qualquer coisa a quem chamou,
      // nunca presumindo pelo simples disparo do evento (mesmo princípio
      // já aplicado ao corte por limite, agora estendido a este caminho).
      confirmacaoErroPendente = { mensagem: erro.message };
      worker.terminate().then(() => {
        if (finalizado) return; // 'exit' já confirmou - nunca duplicar.
        concluirComo({ situacao: "erro_na_worker", mensagem: erro.message, tempoTotalMs: Date.now() - inicio });
      });
      timeoutMargemConfirmacao = setTimeout(() => {
        if (finalizado) return;
        // Nem terminate() resolveu nem 'exit' chegou dentro da margem -
        // NUNCA presumido como falha recuperável comprovada.
        concluirComo({
          situacao: "estado_desconhecido",
          tempoTotalMs: Date.now() - inicio,
          origem: "margem_confirmacao_terminate_esgotada",
        });
      }, margemConfirmacaoTerminateMs);
    });

    worker.on("exit", (exitCode) => {
      if (finalizado) return;
      if (encerramentoSolicitadoPorLimite) {
        concluirComo({ situacao: "interrompido_por_limite", tempoTotalMs: Date.now() - inicio, via: "evento_exit" });
        return;
      }
      if (confirmacaoErroPendente) {
        // 'exit' É, por definição do Node, prova suficiente de
        // encerramento por si só (diferente de 'error' isolado) - cancela
        // a corrida contra a margem e confirma com a mensagem ORIGINAL do
        // 'error', nunca um 'saida_inesperada' genérico escondendo a
        // causa real.
        concluirComo({ situacao: "erro_na_worker", mensagem: confirmacaoErroPendente.mensagem, tempoTotalMs: Date.now() - inicio });
        return;
      }
      // 'exit' sozinho, sem erro nem corte - sempre prova suficiente por
      // si só (o Node só emite 'exit' quando a Worker Thread já parou de
      // fato - diferente de 'error', que pode disparar com trabalho
      // ainda pendente).
      concluirComo({ situacao: "saida_inesperada", exitCode, tempoTotalMs: Date.now() - inicio });
    });

    timeoutLimite = setTimeout(() => {
      encerramentoSolicitadoPorLimite = true;
      // terminate() devolve uma Promise resolvida quando a thread
      // REALMENTE parou - a confirmação de encerramento real, nunca
      // presumida só pelo disparo do timeout.
      worker.terminate().then(() => {
        if (finalizado) return; // 'exit' já confirmou - nunca duplicar.
        concluirComo({ situacao: "interrompido_por_limite", tempoTotalMs: Date.now() - inicio, via: "promise_terminate" });
      });
    }, opcoes.limiteMs);
  });
}

/**
 * Orçamento de tempo (auditoria I6-A, decisão 2): T_efetivo = min(limite
 * do Motor, tempo restante seguro da função) - nunca exige o limite
 * cheio do Motor para iniciar. `margemFinalizacaoMs` cobre validação +
 * finalização da reserva depois que a Worker responder; se não houver
 * margem suficiente nem para o mínimo viável, retorna null - o chamador
 * decide o que fazer (nunca o supervisor spawna uma Worker fadada a
 * não ter tempo de finalizar com segurança).
 */
export function calcularLimiteEfetivoMs(params: {
  limiteMotorMs: number;
  maxDurationFuncaoMs: number;
  tempoJaConsumidoMs: number;
  margemFinalizacaoMs: number;
  limiteMinimoViavelMs: number;
}): number | null {
  const { limiteMotorMs, maxDurationFuncaoMs, tempoJaConsumidoMs, margemFinalizacaoMs, limiteMinimoViavelMs } = params;
  const margemRestante = maxDurationFuncaoMs - tempoJaConsumidoMs - margemFinalizacaoMs;
  if (margemRestante < limiteMinimoViavelMs) return null;
  return Math.min(limiteMotorMs, margemRestante);
}
