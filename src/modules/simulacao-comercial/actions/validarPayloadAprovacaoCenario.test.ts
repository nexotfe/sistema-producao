import { describe, expect, it } from "vitest";
import { validarPayloadAprovacaoCenario, type PayloadAprovacaoCenario } from "./validarPayloadAprovacaoCenario";

function payloadValido(overrides: Partial<PayloadAprovacaoCenario> = {}): unknown {
  return {
    projetoId: "projeto-1",
    tipoCenario: "atual",
    dataNecessidade: "2026-09-01",
    margemSegurancaDias: 0,
    dataPrevistaAprovacaoPedido: "2026-08-20",
    capacidadeExtraAutorizada: [],
    temporariosPorPrioridade: [],
    disponibilidadeMaterialNegociada: null,
    contratacoes: [],
    contratacaoNegociacaoMaterial: null,
    statusExibido: "calculado",
    primeiraEntregaPossivelExibida: "2026-09-10",
    diferencaEmDiasExibida: 9,
    custoAdicionalExibido: { negociacaoMaterial: 0, horaAdicional: 0, recursoTemporario: 0, total: 0 },
    custoTecnicoAtualExibido: 50000,
    valorComercialAtualReferenciaExibido: 62000,
    motivoSubstituicao: null,
    chaveIdempotencia: "11111111-1111-1111-1111-111111111111",
    ...overrides,
  };
}

describe("validarPayloadAprovacaoCenario", () => {
  it("aceita um payload completo e válido", () => {
    const resultado = validarPayloadAprovacaoCenario(payloadValido());
    expect(resultado.valido).toBe(true);
  });

  it("rejeita payload que não é objeto", () => {
    expect(validarPayloadAprovacaoCenario(null).valido).toBe(false);
    expect(validarPayloadAprovacaoCenario("string").valido).toBe(false);
  });

  it("rejeita tipoCenario fora de atual/ajustado", () => {
    const resultado = validarPayloadAprovacaoCenario(payloadValido({ tipoCenario: "outro" as never }));
    expect(resultado.valido).toBe(false);
  });

  it("rejeita dataNecessidade inválida", () => {
    const resultado = validarPayloadAprovacaoCenario(payloadValido({ dataNecessidade: "31/12/2026" as never }));
    expect(resultado.valido).toBe(false);
  });

  it("rejeita margemSegurancaDias negativa", () => {
    const resultado = validarPayloadAprovacaoCenario(payloadValido({ margemSegurancaDias: -1 }));
    expect(resultado.valido).toBe(false);
  });

  it("rejeita capacidadeExtraAutorizada com item de forma inválida", () => {
    const resultado = validarPayloadAprovacaoCenario(
      payloadValido({ capacidadeExtraAutorizada: [{ recursoId: "r1" }] as never }),
    );
    expect(resultado.valido).toBe(false);
  });

  it("aceita capacidadeExtraAutorizada com item bem formado", () => {
    const resultado = validarPayloadAprovacaoCenario(
      payloadValido({
        capacidadeExtraAutorizada: [
          {
            recursoId: "r1",
            data: "2026-09-05",
            horasAdicionaisDisponiveis: 2,
            natureza: "hora_extra",
            elegibilidade: { escopo: "somente_orcamento_novo" },
            contratacaoId: "c1",
          },
        ],
      }),
    );
    expect(resultado.valido).toBe(true);
  });

  it("rejeita custoAdicionalExibido com categoria negativa", () => {
    const resultado = validarPayloadAprovacaoCenario(
      payloadValido({ custoAdicionalExibido: { negociacaoMaterial: -1, horaAdicional: 0, recursoTemporario: 0, total: -1 } }),
    );
    expect(resultado.valido).toBe(false);
  });

  it("rejeita motivoSubstituicao vazio (mas presente)", () => {
    const resultado = validarPayloadAprovacaoCenario(payloadValido({ motivoSubstituicao: "   " }));
    expect(resultado.valido).toBe(false);
  });

  it("aceita motivoSubstituicao null", () => {
    const resultado = validarPayloadAprovacaoCenario(payloadValido({ motivoSubstituicao: null }));
    expect(resultado.valido).toBe(true);
  });

  it("rejeita campo custoTecnicoAtualExibido ausente/errado", () => {
    const payload = payloadValido() as Record<string, unknown>;
    delete payload.custoTecnicoAtualExibido;
    expect(validarPayloadAprovacaoCenario(payload).valido).toBe(false);
  });

  // Migração 20260822195805 (idempotência) - chaveIdempotencia passou a
  // ser obrigatória (gerada no cliente com crypto.randomUUID()).
  it("aceita chaveIdempotencia em formato UUID válido", () => {
    const resultado = validarPayloadAprovacaoCenario(payloadValido({ chaveIdempotencia: "a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6" }));
    expect(resultado.valido).toBe(true);
  });

  it("rejeita chaveIdempotencia ausente", () => {
    const payload = payloadValido() as Record<string, unknown>;
    delete payload.chaveIdempotencia;
    expect(validarPayloadAprovacaoCenario(payload).valido).toBe(false);
  });

  it("rejeita chaveIdempotencia que não é um UUID válido", () => {
    const resultado = validarPayloadAprovacaoCenario(payloadValido({ chaveIdempotencia: "nao-e-um-uuid" }));
    expect(resultado.valido).toBe(false);
  });
});
