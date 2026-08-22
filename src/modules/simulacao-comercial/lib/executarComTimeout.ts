// Achado real (aprovação de cenário comercial travada em "Aprovando..."
// no orçamento 260007, DEC-007): versão SEM React do mesmo padrão já
// usado em executarCarregamentoComTimeout.ts (Promise.race entre a
// operação real e um temporizador) - para uso em código de SERVIDOR
// (Server Action/orquestrador), que não tem setState nenhum para
// desligar. Suspeita mais provável do travamento: o mesmo tipo de lock
// interno do GoTrueClient (navigator.locks) já documentado em
// AuthGate.tsx ("esse lock pode nunca ser liberado... travando
// getSession() para sempre sem lançar erro nenhum") - qualquer chamada
// ao client Supabase (auth, tabela, RPC) pode travar da mesma forma,
// sem nunca resolver nem rejeitar. Envolver cada etapa aqui neutraliza
// essa classe de bug independentemente da causa exata.
//
// Contrato (mesmas garantias de executarCarregamentoComTimeout.ts):
// - nunca gera "unhandled rejection": a promise real recebe um
//   .catch(() => {}) antecipado, mesmo quando o timeout vence a
//   corrida e ninguém mais aguarda o resultado dela diretamente;
// - a promise perdedora (a real, se o timeout vencer; ou o timer, se a
//   real resolver primeiro) nunca causa efeito colateral - ninguém
//   aguarda ela depois da corrida, e o `clearTimeout` no `finally`
//   impede o timer de disparar depois que a real já venceu.
export class TimeoutEtapaError extends Error {
  readonly etapa: string;

  constructor(etapa: string) {
    super(`Tempo limite excedido na etapa: ${etapa}.`);
    this.name = "TimeoutEtapaError";
    this.etapa = etapa;
  }
}

export async function executarComTimeout<T>(operacao: () => Promise<T>, timeoutMs: number, etapa: string): Promise<T> {
  const promessaReal = operacao();
  promessaReal.catch(() => {});

  let idTimeout: ReturnType<typeof setTimeout> | undefined;
  const promessaTimeout = new Promise<never>((_resolve, reject) => {
    idTimeout = setTimeout(() => reject(new TimeoutEtapaError(etapa)), timeoutMs);
  });

  try {
    return await Promise.race([promessaReal, promessaTimeout]);
  } finally {
    if (idTimeout !== undefined) {
      clearTimeout(idTimeout);
    }
  }
}
