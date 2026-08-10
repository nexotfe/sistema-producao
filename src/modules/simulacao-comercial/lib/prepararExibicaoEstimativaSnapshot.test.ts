import { describe, expect, it } from "vitest";
import { prepararExibicaoEstimativaSnapshot, type CamposEstimativaSnapshot } from "./prepararExibicaoEstimativaSnapshot";

function campos(overrides: Partial<CamposEstimativaSnapshot> = {}): CamposEstimativaSnapshot {
  return {
    estimativaInicioNecessario: "2026-11-18",
    estimativaEstado: "viavel",
    estimativaMetodoVersao: 1,
    folgaDiasProdutivos: 3,
    ...overrides,
  };
}

describe("prepararExibicaoEstimativaSnapshot — snapshot antigo (legado, anterior a esta ativação)", () => {
  it("os 4 campos NULL: não registrada", () => {
    const resultado = prepararExibicaoEstimativaSnapshot({
      estimativaInicioNecessario: null,
      estimativaEstado: null,
      estimativaMetodoVersao: null,
      folgaDiasProdutivos: null,
    });

    expect(resultado).toEqual({ tipo: "nao_registrada" });
  });
});

describe("prepararExibicaoEstimativaSnapshot — snapshot novo, os 3 estados persistíveis", () => {
  it("viavel: data, estado amigável, folga e versão do método, todos vindos do congelado", () => {
    const resultado = prepararExibicaoEstimativaSnapshot(
      campos({
        estimativaInicioNecessario: "2026-11-18",
        estimativaEstado: "viavel",
        folgaDiasProdutivos: 4,
        estimativaMetodoVersao: 1,
      }),
    );

    expect(resultado).toEqual({
      tipo: "disponivel",
      dataEstimadaInicioNecessario: "2026-11-18",
      estadoAmigavel: "Viável",
      folgaDiasProdutivos: 4,
      metodoVersao: 1,
    });
  });

  it("viavel_no_limite: folga zero preservada (não confundida com ausente/falsy)", () => {
    const resultado = prepararExibicaoEstimativaSnapshot(
      campos({ estimativaEstado: "viavel_no_limite", folgaDiasProdutivos: 0 }),
    );

    expect(resultado).toEqual({
      tipo: "disponivel",
      dataEstimadaInicioNecessario: "2026-11-18",
      estadoAmigavel: "Viável no limite",
      folgaDiasProdutivos: 0,
      metodoVersao: 1,
    });
  });

  it("janela_insuficiente: folga negativa preservada com sinal", () => {
    const resultado = prepararExibicaoEstimativaSnapshot(
      campos({ estimativaEstado: "janela_insuficiente", folgaDiasProdutivos: -3 }),
    );

    expect(resultado).toEqual({
      tipo: "disponivel",
      dataEstimadaInicioNecessario: "2026-11-18",
      estadoAmigavel: "Janela insuficiente",
      folgaDiasProdutivos: -3,
      metodoVersao: 1,
    });
  });
});

describe("prepararExibicaoEstimativaSnapshot — combinação parcial inesperada: indisponível, nunca inventa valor", () => {
  it("só estimativaInicioNecessario nulo, os outros 3 presentes: indisponível", () => {
    const resultado = prepararExibicaoEstimativaSnapshot(campos({ estimativaInicioNecessario: null }));
    expect(resultado).toEqual({ tipo: "indisponivel" });
  });

  it("só estimativaEstado nulo, os outros 3 presentes: indisponível", () => {
    const resultado = prepararExibicaoEstimativaSnapshot(campos({ estimativaEstado: null }));
    expect(resultado).toEqual({ tipo: "indisponivel" });
  });

  it("só estimativaMetodoVersao nulo, os outros 3 presentes: indisponível", () => {
    const resultado = prepararExibicaoEstimativaSnapshot(campos({ estimativaMetodoVersao: null }));
    expect(resultado).toEqual({ tipo: "indisponivel" });
  });

  it("só folgaDiasProdutivos nulo, os outros 3 presentes: indisponível", () => {
    const resultado = prepararExibicaoEstimativaSnapshot(campos({ folgaDiasProdutivos: null }));
    expect(resultado).toEqual({ tipo: "indisponivel" });
  });

  it("estado fora dos 3 valores persistíveis (ex.: dados_insuficientes, que a constraint nunca deveria deixar persistir): indisponível, mesmo com os outros 3 campos presentes", () => {
    const resultado = prepararExibicaoEstimativaSnapshot(campos({ estimativaEstado: "dados_insuficientes" }));
    expect(resultado).toEqual({ tipo: "indisponivel" });
  });

  it("estado com string vazia ou lixo: indisponível", () => {
    const resultado = prepararExibicaoEstimativaSnapshot(campos({ estimativaEstado: "" }));
    expect(resultado).toEqual({ tipo: "indisponivel" });
  });
});
