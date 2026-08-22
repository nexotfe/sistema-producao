import { describe, expect, it } from "vitest";
import { buscarCenarioAprovadoPorChaveIdempotencia } from "./buscarCenarioAprovadoPorChaveIdempotencia";

function clienteFake(resultado: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => resultado,
          }),
        }),
      }),
    }),
  } as never;
}

describe("buscarCenarioAprovadoPorChaveIdempotencia", () => {
  it("encontra o cenário gravado com a chave (tratar como sucesso silencioso após falha ambígua)", async () => {
    const cliente = clienteFake({ data: { id: "cenario-1" }, error: null });
    const resultado = await buscarCenarioAprovadoPorChaveIdempotencia(cliente, "projeto-1", "chave-1");
    expect(resultado).toEqual({ id: "cenario-1" });
  });

  it("devolve null quando não encontra (libera nova tentativa com a mesma chave)", async () => {
    const cliente = clienteFake({ data: null, error: null });
    const resultado = await buscarCenarioAprovadoPorChaveIdempotencia(cliente, "projeto-1", "chave-1");
    expect(resultado).toBeNull();
  });

  it("devolve null em caso de erro de consulta (nunca lança - trata como 'não confirmado ainda')", async () => {
    const cliente = clienteFake({ data: null, error: { message: "falhou" } });
    const resultado = await buscarCenarioAprovadoPorChaveIdempotencia(cliente, "projeto-1", "chave-1");
    expect(resultado).toBeNull();
  });
});
