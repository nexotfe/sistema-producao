import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResultadoListaTecnicaProjeto } from "./gerarListaTecnicaProjeto";
import { imprimirListaTecnicaPdf } from "./imprimirListaTecnicaPdf";

function resultadoBase(overrides: Partial<ResultadoListaTecnicaProjeto> = {}): ResultadoListaTecnicaProjeto {
  return {
    estado: "calculado",
    mensagem: null,
    itensAnalisados: [],
    materiais: [],
    ...overrides,
  };
}

function stubDocumentEJanela() {
  const documentoFalso = { title: "Sistema NEXOTFE" };
  const listeners = new Map<string, () => void>();
  const print = vi.fn();
  const janelaFalsa = {
    print,
    addEventListener: (evento: string, callback: () => void) => {
      listeners.set(evento, callback);
    },
    removeEventListener: (evento: string) => {
      listeners.delete(evento);
    },
  };
  vi.stubGlobal("document", documentoFalso);
  vi.stubGlobal("window", janelaFalsa);
  return { documentoFalso, print, dispararAfterPrint: () => listeners.get("afterprint")?.() };
}

describe("imprimirListaTecnicaPdf", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lança erro e não chama window.print quando o estado não é 'calculado'", () => {
    const { print } = stubDocumentEJanela();

    expect(() =>
      imprimirListaTecnicaPdf(resultadoBase({ estado: "nao_aplicavel_industrializacao" }), "260010"),
    ).toThrow(/calculada com sucesso/);
    expect(print).not.toHaveBeenCalled();
  });

  it("ajusta document.title com o número do projeto sanitizado e chama window.print", () => {
    const { documentoFalso, print } = stubDocumentEJanela();

    imprimirListaTecnicaPdf(resultadoBase(), "260010");

    expect(documentoFalso.title).toBe("lista-tecnica-projeto-260010");
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("usa nome genérico no título quando numeroProjeto é null", () => {
    const { documentoFalso } = stubDocumentEJanela();

    imprimirListaTecnicaPdf(resultadoBase(), null);

    expect(documentoFalso.title).toBe("lista-tecnica-projeto");
  });

  it("restaura o título original após o evento afterprint", () => {
    const { documentoFalso, dispararAfterPrint } = stubDocumentEJanela();
    const tituloOriginal = documentoFalso.title;

    imprimirListaTecnicaPdf(resultadoBase(), "260010");
    expect(documentoFalso.title).not.toBe(tituloOriginal);

    dispararAfterPrint();
    expect(documentoFalso.title).toBe(tituloOriginal);
  });
});
