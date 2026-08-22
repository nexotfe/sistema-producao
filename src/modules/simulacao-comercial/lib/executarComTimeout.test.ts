import { describe, expect, it, vi } from "vitest";
import { executarComTimeout, TimeoutEtapaError } from "./executarComTimeout";

describe("executarComTimeout", () => {
  it("resolve normalmente quando a operação termina antes do timeout", async () => {
    await expect(executarComTimeout(() => Promise.resolve("ok"), 200, "etapa-teste")).resolves.toBe("ok");
  });

  it("propaga o erro real quando a operação rejeita antes do timeout", async () => {
    await expect(executarComTimeout(() => Promise.reject(new Error("falha real")), 200, "etapa-teste")).rejects.toThrow(
      "falha real",
    );
  });

  it("lança TimeoutEtapaError (com o nome da etapa) quando a operação nunca resolve nem rejeita", async () => {
    vi.useFakeTimers();
    const operacaoQueNuncaResolve = () => new Promise<string>(() => {});
    const resultado = executarComTimeout(operacaoQueNuncaResolve, 1000, "calcular-assinatura-tecnica");
    resultado.catch(() => {});

    await vi.advanceTimersByTimeAsync(1000);

    await expect(resultado).rejects.toBeInstanceOf(TimeoutEtapaError);
    await expect(resultado).rejects.toMatchObject({ etapa: "calcular-assinatura-tecnica" });
    vi.useRealTimers();
  });

  it("uma operação lenta que rejeita DEPOIS do timeout nunca gera unhandled rejection (catch antecipado)", async () => {
    vi.useFakeTimers();
    let rejeitarOperacao!: (erro: Error) => void;
    const operacaoLenta = () => new Promise<string>((_resolve, reject) => { rejeitarOperacao = reject; });

    const resultado = executarComTimeout(operacaoLenta, 500, "etapa-lenta");
    resultado.catch(() => {});

    await vi.advanceTimersByTimeAsync(500);
    await expect(resultado).rejects.toBeInstanceOf(TimeoutEtapaError);

    // Resolução tardia da operação real (depois que o timeout já venceu) -
    // nunca deveria gerar unhandled rejection nem qualquer efeito.
    rejeitarOperacao(new Error("chegou tarde"));
    await Promise.resolve();
    vi.useRealTimers();
  });
});
