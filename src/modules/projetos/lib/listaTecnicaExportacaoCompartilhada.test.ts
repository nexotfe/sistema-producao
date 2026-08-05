import { describe, expect, it } from "vitest";
import type { ResultadoListaTecnicaProjeto } from "./gerarListaTecnicaProjeto";
import {
  assertListaTecnicaCalculada,
  nomeArquivoListaTecnica,
} from "./listaTecnicaExportacaoCompartilhada";

function resultadoBase(overrides: Partial<ResultadoListaTecnicaProjeto> = {}): ResultadoListaTecnicaProjeto {
  return {
    estado: "calculado",
    mensagem: null,
    itensAnalisados: [],
    materiais: [],
    ...overrides,
  };
}

describe("nomeArquivoListaTecnica", () => {
  it("usa o número do projeto (só dígitos) no nome", () => {
    expect(nomeArquivoListaTecnica("260010", "xlsx")).toBe("lista-tecnica-projeto-260010.xlsx");
  });

  it("sanitiza caracteres não numéricos por segurança de camada (defesa em profundidade)", () => {
    expect(nomeArquivoListaTecnica("26/00-10", "pdf")).toBe("lista-tecnica-projeto-260010.pdf");
  });

  it("usa nome genérico quando numeroProjeto é null", () => {
    expect(nomeArquivoListaTecnica(null, "xlsx")).toBe("lista-tecnica-projeto.xlsx");
  });

  it("usa nome genérico quando numeroProjeto vira string vazia após sanitização", () => {
    expect(nomeArquivoListaTecnica("---", "xlsx")).toBe("lista-tecnica-projeto.xlsx");
  });
});

describe("assertListaTecnicaCalculada", () => {
  it("não lança quando estado é 'calculado'", () => {
    expect(() => assertListaTecnicaCalculada(resultadoBase())).not.toThrow();
  });

  it("lança quando estado é 'nao_aplicavel_industrializacao'", () => {
    expect(() =>
      assertListaTecnicaCalculada(resultadoBase({ estado: "nao_aplicavel_industrializacao" })),
    ).toThrow(/calculada com sucesso/);
  });
});
