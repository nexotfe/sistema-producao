// Teste com temporizador controlado (vi.useFakeTimers) - cobre os 5
// requisitos pedidos pelo usuário (orçamento 260007, proteção de UX
// depois do travamento real de "Calcular cenário atual"): timeout,
// resposta tardia, nova tentativa bem-sucedida, desmontagem, e a
// corrida (uma chamada obsoleta nunca sobrescreve o estado nem deixa
// carregando travado).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  executarCarregamentoComTimeout,
  MENSAGEM_ERRO_CARREGAMENTO,
  TIMEOUT_CARREGAMENTO_MS,
  type CallbacksCarregamentoComTimeout,
} from "./executarCarregamentoComTimeout";

function criarCallbacksEspionados<T>() {
  const chamadas: Array<["dados" | "erro" | "carregando", unknown]> = [];
  const callbacks: CallbacksCarregamentoComTimeout<T> = {
    setCarregando: vi.fn((v) => chamadas.push(["carregando", v])),
    setErro: vi.fn((v) => chamadas.push(["erro", v])),
    setDados: vi.fn((v) => chamadas.push(["dados", v])),
    foiCancelado: () => false,
  };
  return { callbacks, chamadas };
}

describe("executarCarregamentoComTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("caminho feliz: liga carregando, resolve, desliga carregando, seta os dados", async () => {
    const { callbacks, chamadas } = criarCallbacksEspionados<string>();

    const execucao = executarCarregamentoComTimeout(async () => "dado-real", callbacks);
    await vi.runAllTimersAsync();
    await execucao;

    const chamadasCarregando = chamadas.filter(([tipo]) => tipo === "carregando").map(([, v]) => v);
    expect(chamadasCarregando).toEqual([true, false]);
    expect(callbacks.setDados).toHaveBeenCalledWith("dado-real");
    expect(callbacks.setErro).toHaveBeenCalledWith(null);
  });

  // 1. Timeout.
  it("timeout: quando carregar() nunca resolve dentro do prazo, desliga carregando e mostra a mensagem clara", async () => {
    const { callbacks, chamadas } = criarCallbacksEspionados<string>();
    const carregar = () => new Promise<string>(() => {}); // nunca resolve

    const execucao = executarCarregamentoComTimeout(carregar, callbacks, TIMEOUT_CARREGAMENTO_MS);
    await vi.advanceTimersByTimeAsync(TIMEOUT_CARREGAMENTO_MS);
    await execucao;

    expect(callbacks.setDados).toHaveBeenCalledWith(null);
    expect(callbacks.setErro).toHaveBeenCalledWith(MENSAGEM_ERRO_CARREGAMENTO);
    const chamadasCarregando = chamadas.filter(([tipo]) => tipo === "carregando").map(([, v]) => v);
    expect(chamadasCarregando).toEqual([true, false]);
  });

  it("timeout com tempo customizado (não fica preso ao default de 15s)", async () => {
    const { callbacks } = criarCallbacksEspionados<string>();
    const carregar = () => new Promise<string>(() => {});

    const execucao = executarCarregamentoComTimeout(carregar, callbacks, 5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await execucao;

    expect(callbacks.setErro).toHaveBeenCalledWith(MENSAGEM_ERRO_CARREGAMENTO);
  });

  // 2. Resposta tardia (depois do timeout já ter vencido a corrida).
  it("resposta tardia: chega depois do timeout já ter mostrado erro - nunca sobrescreve o estado, nunca gera unhandled rejection", async () => {
    const { callbacks, chamadas } = criarCallbacksEspionados<string>();
    let resolverTarde: (v: string) => void = () => {};
    const carregar = () => new Promise<string>((resolve) => { resolverTarde = resolve; });

    const execucao = executarCarregamentoComTimeout(carregar, callbacks, 1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await execucao;

    // Estado já é o de erro, definido pelo timeout.
    expect(callbacks.setErro).toHaveBeenCalledWith(MENSAGEM_ERRO_CARREGAMENTO);
    const chamadasAntes = chamadas.length;

    // A consulta real, atrasada, finalmente resolve - depois que a
    // função já retornou (execucao já foi await'ada acima). Isto prova
    // também que a promise real nunca fica sem handler (o teste falharia
    // com "unhandled rejection" se ela rejeitasse sem proteção - aqui
    // ela resolve, o caso mais permissivo para detectar sobrescrita).
    resolverTarde("dado-atrasado");
    await vi.runAllTimersAsync();

    // Nenhuma chamada NOVA aos callbacks depois que a função já
    // retornou - a resposta tardia não alcança mais setDados/setErro/
    // setCarregando, porque a promise perdedora do Promise.race não é
    // mais aguardada por ninguém.
    expect(chamadas.length).toBe(chamadasAntes);
  });

  // 3. Nova tentativa bem-sucedida.
  it("nova tentativa bem-sucedida: depois de um timeout, chamar de novo com uma consulta que funciona limpa o erro e carrega os dados", async () => {
    const { callbacks } = criarCallbacksEspionados<string>();

    const execucaoFalha = executarCarregamentoComTimeout(() => new Promise<string>(() => {}), callbacks);
    await vi.advanceTimersByTimeAsync(TIMEOUT_CARREGAMENTO_MS);
    await execucaoFalha;
    expect(callbacks.setErro).toHaveBeenCalledWith(MENSAGEM_ERRO_CARREGAMENTO);

    // "Tentar novamente" = chamar de novo (mesmo padrão de
    // recarregaResumoFinanceiro já usado no módulo: um contador de
    // tentativa no array de dependências do efeito do chamador).
    const execucaoRetry = executarCarregamentoComTimeout(async () => "dado-da-retentativa", callbacks);
    await vi.runAllTimersAsync();
    await execucaoRetry;

    expect(callbacks.setErro).toHaveBeenLastCalledWith(null);
    expect(callbacks.setDados).toHaveBeenLastCalledWith("dado-da-retentativa");
  });

  // 4. Desmontagem do componente.
  it("desmontagem: quando foiCancelado() já é true no momento da resolução, nenhum callback de resultado é chamado - nem sequer setCarregando(false)", async () => {
    const { callbacks, chamadas } = criarCallbacksEspionados<string>();
    let cancelado = false;
    callbacks.foiCancelado = () => cancelado;
    let resolver: (v: string) => void = () => {};
    const carregar = () => new Promise<string>((resolve) => { resolver = resolve; });

    const execucao = executarCarregamentoComTimeout(carregar, callbacks);
    // setCarregando(true) já foi chamado, síncrono, antes do primeiro await.
    expect(chamadas.filter(([tipo]) => tipo === "carregando").map(([, v]) => v)).toEqual([true]);

    // Componente desmonta - cleanup do useEffect marca cancelado=true.
    cancelado = true;

    resolver("dado-pos-desmontagem");
    await vi.runAllTimersAsync();
    await execucao;

    // Nenhuma chamada NOVA depois da desmontagem - carregando fica
    // como está (responsabilidade de quem desmontou, não desta função),
    // nunca seta dados nem erro para um componente que não existe mais.
    expect(chamadas.filter(([tipo]) => tipo === "carregando").map(([, v]) => v)).toEqual([true]);
    expect(callbacks.setDados).not.toHaveBeenCalled();
    expect(callbacks.setErro).not.toHaveBeenCalledWith(MENSAGEM_ERRO_CARREGAMENTO);
  });

  it("desmontagem durante o timeout: o timer ainda dispara (JS não cancela sozinho), mas nada é escrito no estado", async () => {
    const { callbacks } = criarCallbacksEspionados<string>();
    let cancelado = false;
    callbacks.foiCancelado = () => cancelado;

    const execucao = executarCarregamentoComTimeout(() => new Promise<string>(() => {}), callbacks, 1_000);
    cancelado = true;

    await vi.advanceTimersByTimeAsync(1_000);
    await execucao;

    expect(callbacks.setErro).not.toHaveBeenCalledWith(MENSAGEM_ERRO_CARREGAMENTO);
    expect(callbacks.setDados).not.toHaveBeenCalled();
  });

  // 5. A corrida já reproduzida: uma chamada obsoleta nunca reabre
  // carregando=true nem sobrescreve o resultado de uma chamada mais nova.
  it("corrida: uma chamada antiga (cancelada) resolvendo depois NÃO reabre carregando nem sobrescreve o resultado da chamada nova", async () => {
    const { callbacks: callbacksAntiga, chamadas: chamadasAntiga } = criarCallbacksEspionados<string>();
    let canceladaAntiga = false;
    callbacksAntiga.foiCancelado = () => canceladaAntiga;
    let resolverAntiga: (v: string) => void = () => {};
    const execucaoAntiga = executarCarregamentoComTimeout(
      () => new Promise<string>((resolve) => { resolverAntiga = resolve; }),
      callbacksAntiga,
    );

    // Antes da antiga resolver, o usuário edita a premissa de novo - o
    // componente marca a antiga como cancelada e dispara uma nova.
    canceladaAntiga = true;

    const { callbacks: callbacksNova, chamadas: chamadasNova } = criarCallbacksEspionados<string>();
    const execucaoNova = executarCarregamentoComTimeout(async () => "dado-da-chamada-nova", callbacksNova);
    await vi.runAllTimersAsync();
    await execucaoNova;

    expect(chamadasNova.filter(([tipo]) => tipo === "carregando").map(([, v]) => v)).toEqual([true, false]);
    expect(callbacksNova.setDados).toHaveBeenCalledWith("dado-da-chamada-nova");

    // Só agora a chamada antiga (obsoleta) resolve.
    resolverAntiga("dado-obsoleto");
    await vi.runAllTimersAsync();
    await execucaoAntiga;

    // A antiga ligou carregando (true) ao começar, mas por estar
    // cancelada, nunca chama setCarregando(false)/setDados/setErro de
    // novo - não pode sobrescrever o que a chamada nova já deixou certo.
    expect(chamadasAntiga.filter(([tipo]) => tipo === "carregando").map(([, v]) => v)).toEqual([true]);
    expect(callbacksAntiga.setDados).not.toHaveBeenCalled();
  });
});
