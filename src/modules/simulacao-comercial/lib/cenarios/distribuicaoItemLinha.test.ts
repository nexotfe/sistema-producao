import { describe, expect, it } from "vitest";
import {
  validarDistribuicaoItemLinha,
  validarDistribuicaoDiaLinha,
  type DistribuicaoItemInterna,
  type DistribuicaoItemRecursoTemporario,
  type DistribuicaoItemTerceirizada,
  type DistribuicaoDiaLinha,
} from "./distribuicaoItemLinha";

function interna(overrides: Partial<DistribuicaoItemInterna> = {}): DistribuicaoItemInterna {
  return {
    origem: "ORIGINAL",
    recursoId: "R1",
    capacidadeBrutaPeriodo: 40,
    produtividadeConsiderada: 0.9,
    capacidadeEfetiva: 36,
    comprometidoInicial: 10,
    capacidadeDisponivelInicial: 26,
    capacidadeDisponivelAntes: 26,
    horasPadraoAlocadas: 8,
    horasMaquinaEstimadas: 8.89,
    capacidadeDisponivelDepois: 18,
    ...overrides,
  };
}

function temporario(overrides: Partial<DistribuicaoItemRecursoTemporario> = {}): DistribuicaoItemRecursoTemporario {
  return {
    origem: "RECURSO_TEMPORARIO",
    recursoExternoTipo: "freelancer",
    recursoExternoNome: "Fulano Terceirizado",
    recursoExternoReferenciaId: "R1",
    contratacaoId: "CT-1",
    custo: 500,
    capacidadeBrutaPeriodo: 8,
    produtividadeConsiderada: 0.8,
    capacidadeEfetiva: 6.4,
    comprometidoInicial: 0,
    capacidadeDisponivelInicial: 6.4,
    capacidadeDisponivelAntes: 6.4,
    horasPadraoAlocadas: 4,
    horasMaquinaEstimadas: 5,
    capacidadeDisponivelDepois: 2.4,
    ...overrides,
  };
}

function terceirizada(overrides: Partial<DistribuicaoItemTerceirizada> = {}): DistribuicaoItemTerceirizada {
  return {
    origem: "TERCEIRIZADO",
    recursoExternoNome: "Fornecedor X",
    contratacaoId: "CT-2",
    custo: 1200,
    dataInicioCalculada: "2026-11-09",
    dataFimCalculada: "2026-11-11",
    ...overrides,
  };
}

describe("validarDistribuicaoItemLinha — discriminação por origem impede acesso indevido a campos", () => {
  it("ORIGINAL/COMPATIBILIDADE válidos não lançam", () => {
    expect(() => validarDistribuicaoItemLinha(interna())).not.toThrow();
    expect(() => validarDistribuicaoItemLinha(interna({ origem: "COMPATIBILIDADE" }))).not.toThrow();
  });

  it("RECURSO_TEMPORARIO válido não lança", () => {
    expect(() => validarDistribuicaoItemLinha(temporario())).not.toThrow();
  });

  it("TERCEIRIZADO válido não lança", () => {
    expect(() => validarDistribuicaoItemLinha(terceirizada())).not.toThrow();
  });

  it("TERCEIRIZADO: dataFimCalculada anterior a dataInicioCalculada é rejeitada", () => {
    expect(() =>
      validarDistribuicaoItemLinha(terceirizada({ dataInicioCalculada: "2026-11-11", dataFimCalculada: "2026-11-09" })),
    ).toThrow(RangeError);
  });

  it("TERCEIRIZADO: custo negativo é rejeitado", () => {
    expect(() => validarDistribuicaoItemLinha(terceirizada({ custo: -1 }))).toThrow(RangeError);
  });

  it("RECURSO_TEMPORARIO: produtividadeConsiderada fora de (0,1] é rejeitada", () => {
    expect(() => validarDistribuicaoItemLinha(temporario({ produtividadeConsiderada: 0 }))).toThrow(RangeError);
    expect(() => validarDistribuicaoItemLinha(temporario({ produtividadeConsiderada: 1.5 }))).toThrow(RangeError);
  });

  it("interna: horasPadraoAlocadas <= 0 é rejeitada", () => {
    expect(() => validarDistribuicaoItemLinha(interna({ horasPadraoAlocadas: 0 }))).toThrow(RangeError);
  });
});

describe("validarDistribuicaoDiaLinha — natureza='normal' ⇔ contratacaoId nulo", () => {
  const base: DistribuicaoDiaLinha = { data: "2026-11-09", horasMaquina: 4, horasPadrao: 4, natureza: "normal", contratacaoId: null };

  it("normal com contratacaoId nulo é válido", () => {
    expect(() => validarDistribuicaoDiaLinha(base)).not.toThrow();
  });

  it("normal com contratacaoId preenchido é rejeitado", () => {
    expect(() => validarDistribuicaoDiaLinha({ ...base, contratacaoId: "CT-1" })).toThrow(RangeError);
  });

  it("hora_extra sem contratacaoId é rejeitado", () => {
    expect(() => validarDistribuicaoDiaLinha({ ...base, natureza: "hora_extra", contratacaoId: null })).toThrow(RangeError);
  });

  it("hora_extra com contratacaoId preenchido é válido", () => {
    expect(() => validarDistribuicaoDiaLinha({ ...base, natureza: "hora_extra", contratacaoId: "CT-1" })).not.toThrow();
  });

  it("rejeita horasMaquina <= 0", () => {
    expect(() => validarDistribuicaoDiaLinha({ ...base, horasMaquina: 0 })).toThrow(RangeError);
  });

  it("rejeita data inválida", () => {
    expect(() => validarDistribuicaoDiaLinha({ ...base, data: "09/11/2026" })).toThrow(RangeError);
  });
});
