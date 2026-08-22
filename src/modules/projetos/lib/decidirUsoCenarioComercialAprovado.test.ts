import { describe, expect, it } from "vitest";
import { decidirUsoCenarioComercialAprovado } from "./decidirUsoCenarioComercialAprovado";

describe("decidirUsoCenarioComercialAprovado", () => {
  it("projeto aprovado: congelamento definitivo, mesmo com assinatura nula/divergente/erro (nunca recalcula)", () => {
    for (const verificacao of [
      { status: "verificando" as const },
      { status: "ok" as const, assinaturaAtual: "diferente" },
      { status: "erro" as const },
    ]) {
      expect(
        decidirUsoCenarioComercialAprovado({
          projetoAprovado: true,
          assinaturaTecnicaArmazenada: null,
          verificacao,
        }),
      ).toEqual({ usarCenario: true, motivo: "congelamento_definitivo" });
    }
  });

  it("projeto não aprovado, cenário com assinatura nula (legado, ex.: 260007): desatualizado", () => {
    expect(
      decidirUsoCenarioComercialAprovado({
        projetoAprovado: false,
        assinaturaTecnicaArmazenada: null,
        verificacao: { status: "ok", assinaturaAtual: "qualquer-coisa" },
      }),
    ).toEqual({ usarCenario: false, motivoDesatualizado: "assinatura_nula_legado" });
  });

  it("assinatura ao vivo diferente da armazenada: desatualizado", () => {
    expect(
      decidirUsoCenarioComercialAprovado({
        projetoAprovado: false,
        assinaturaTecnicaArmazenada: "a".repeat(64),
        verificacao: { status: "ok", assinaturaAtual: "b".repeat(64) },
      }),
    ).toEqual({ usarCenario: false, motivoDesatualizado: "assinatura_divergente" });
  });

  it("erro ao verificar a assinatura: comportamento conservador, desatualizado (nunca vigente por omissão)", () => {
    expect(
      decidirUsoCenarioComercialAprovado({
        projetoAprovado: false,
        assinaturaTecnicaArmazenada: "a".repeat(64),
        verificacao: { status: "erro" },
      }),
    ).toEqual({ usarCenario: false, motivoDesatualizado: "erro_verificacao" });
  });

  it("ainda verificando: desatualizado (nunca mostra o cenário antigo como corrente enquanto pendente)", () => {
    expect(
      decidirUsoCenarioComercialAprovado({
        projetoAprovado: false,
        assinaturaTecnicaArmazenada: "a".repeat(64),
        verificacao: { status: "verificando" },
      }),
    ).toEqual({ usarCenario: false, motivoDesatualizado: "verificando" });
  });

  it("assinatura ao vivo igual à armazenada: usa o cenário normalmente", () => {
    expect(
      decidirUsoCenarioComercialAprovado({
        projetoAprovado: false,
        assinaturaTecnicaArmazenada: "a".repeat(64),
        verificacao: { status: "ok", assinaturaAtual: "a".repeat(64) },
      }),
    ).toEqual({ usarCenario: true, motivo: "assinatura_confere" });
  });
});
