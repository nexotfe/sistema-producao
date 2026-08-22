// Timeout com erro recuperável para carregamentos de base do motor de
// Cenários (DEC-007, orçamento 260007) - proteção de UX pedida pelo
// usuário depois de um travamento real reproduzido: "Calcular cenário
// atual" podia ficar desabilitado para sempre. A corrida em si já foi
// corrigida separadamente (derivação de carregandoBase/erroBase pela
// validade da janela); este módulo cobre a camada seguinte - mesmo sem
// nenhuma corrida, uma consulta que nunca resolve (rede/trava real)
// ainda deixaria o carregamento pendurado indefinidamente sem isto.
//
// Usado nos dois motores (carregarBaseCenarios em
// GeradorComparadorCenarios.tsx, carregarBasePrevisaoComercial em
// usePrevisaoComercialCapacidade.ts) - mesma lógica, extraída para ser
// DI-testável com temporizador controlado, sem depender de renderizar
// componente/hook (mesmo padrão de calcularJanelaComercialParaExibicao.ts).
//
// Contrato:
// - setCarregando(true) liga no início; setCarregando(false) sempre
//   desliga antes de retornar - sucesso, erro OU timeout - exceto
//   quando foiCancelado() já é true no momento da resolução (chamada
//   obsoleta, a responsabilidade já é da chamada mais nova).
// - Nunca gera "unhandled rejection": a promise real de `carregar()`
//   sempre recebe um .catch(() => {}) antecipado, mesmo quando o
//   timeout vence a corrida e a resposta real chega depois, atrasada.
// - Uma resposta atrasada (depois do timeout OU depois de uma chamada
//   mais nova já ter assumido) nunca sobrescreve o estado - protegida
//   por foiCancelado(), mesmo mecanismo já usado em
//   calcularJanelaComercialParaExibicao.ts.

export const TIMEOUT_CARREGAMENTO_MS = 15_000;

export const MENSAGEM_ERRO_CARREGAMENTO = "Não foi possível carregar os dados do cenário.";

export class TimeoutCarregamentoError extends Error {
  constructor() {
    super("Tempo limite excedido ao carregar os dados do cenário.");
    this.name = "TimeoutCarregamentoError";
  }
}

export interface CallbacksCarregamentoComTimeout<T> {
  setCarregando: (valor: boolean) => void;
  setErro: (mensagem: string | null) => void;
  setDados: (dados: T | null) => void;
  /** true quando uma chamada mais recente já superou esta - protege contra resposta obsoleta (atrasada ou pós-timeout) sobrescrevendo o estado mais novo. */
  foiCancelado: () => boolean;
}

/**
 * Executa `carregar()` com timeout - resolve/rejeita em até `timeoutMs`,
 * sempre chamando setCarregando(false) antes de retornar (protegido por
 * foiCancelado). Nunca lança - qualquer erro (da consulta real ou do
 * timeout) vira `setErro(MENSAGEM_ERRO_CARREGAMENTO)` + `setDados(null)`,
 * nunca uma exceção não tratada nem detalhe técnico exposto na interface.
 */
export async function executarCarregamentoComTimeout<T>(
  carregar: () => Promise<T>,
  callbacks: CallbacksCarregamentoComTimeout<T>,
  timeoutMs: number = TIMEOUT_CARREGAMENTO_MS,
): Promise<void> {
  callbacks.setErro(null);
  callbacks.setCarregando(true);

  const promessaCarregamento = carregar();
  // Handler antecipado - garante que a promise real NUNCA gera
  // "unhandled rejection", mesmo que o timeout vença a corrida e
  // ninguém mais aguarde o resultado dela diretamente.
  promessaCarregamento.catch(() => {});

  let idTimeout: ReturnType<typeof setTimeout> | undefined;
  const promessaTimeout = new Promise<never>((_resolve, reject) => {
    idTimeout = setTimeout(() => reject(new TimeoutCarregamentoError()), timeoutMs);
  });

  try {
    const dados = await Promise.race([promessaCarregamento, promessaTimeout]);
    if (!callbacks.foiCancelado()) {
      callbacks.setDados(dados);
    }
  } catch {
    if (!callbacks.foiCancelado()) {
      callbacks.setDados(null);
      callbacks.setErro(MENSAGEM_ERRO_CARREGAMENTO);
    }
  } finally {
    if (idTimeout !== undefined) {
      clearTimeout(idTimeout);
    }
    if (!callbacks.foiCancelado()) {
      callbacks.setCarregando(false);
    }
  }
}
