import { describe, expect, it } from "vitest";
import { determinarSituacaoEncerramentoProjetoPcp, type OfProjetoPcp } from "./resolverEncerramentoOfsProjetoPcp";

function of(parcial: Partial<OfProjetoPcp> & { ofId: string }): OfProjetoPcp {
  return { estadoExecucao: "concluida", ofPaiId: null, ...parcial };
}

describe("determinarSituacaoEncerramentoProjetoPcp", () => {
  it("1. projeto com todas as OFs concluidas -> encerrado_quanto_as_ofs", () => {
    const resultado = determinarSituacaoEncerramentoProjetoPcp({
      ofs: [of({ ofId: "of1" }), of({ ofId: "of2" })],
      opsNecessarias: [],
    });
    expect(resultado).toEqual({ situacao: "encerrado_quanto_as_ofs" });
  });

  it("2. projeto com OFs concluidas e canceladas, sem pendencias -> encerrado_quanto_as_ofs", () => {
    const resultado = determinarSituacaoEncerramentoProjetoPcp({
      ofs: [of({ ofId: "of1", estadoExecucao: "concluida" }), of({ ofId: "of2", estadoExecucao: "cancelada" })],
      opsNecessarias: [],
    });
    expect(resultado).toEqual({ situacao: "encerrado_quanto_as_ofs" });
  });

  it("3. OF cancelada SEM substituta -> ainda encerrado_quanto_as_ofs (nunca exige substituta)", () => {
    // "sem substituta" aqui significa: nenhuma outra OF no conjunto aponta para ela via of_substitui_id -
    // esta funcao nem conhece of_substitui_id, por desenho: cancelada e sempre resolvida, com ou sem substituta.
    const resultado = determinarSituacaoEncerramentoProjetoPcp({
      ofs: [of({ ofId: "of1", estadoExecucao: "cancelada" })],
      opsNecessarias: [],
    });
    expect(resultado).toEqual({ situacao: "encerrado_quanto_as_ofs" });
  });

  it("4. OF desdobrada com todas as filhas concluidas -> encerrado_quanto_as_ofs (nunca conta a mae)", () => {
    const resultado = determinarSituacaoEncerramentoProjetoPcp({
      ofs: [
        of({ ofId: "mae", estadoExecucao: "desdobrada" }),
        of({ ofId: "filha1", ofPaiId: "mae", estadoExecucao: "concluida" }),
        of({ ofId: "filha2", ofPaiId: "mae", estadoExecucao: "concluida" }),
      ],
      opsNecessarias: [],
    });
    expect(resultado).toEqual({ situacao: "encerrado_quanto_as_ofs" });
  });

  it("5. OF desdobrada com uma filha ainda em producao -> com_pendencias, so a filha entra (nunca a mae)", () => {
    const resultado = determinarSituacaoEncerramentoProjetoPcp({
      ofs: [
        of({ ofId: "mae", estadoExecucao: "desdobrada" }),
        of({ ofId: "filha1", ofPaiId: "mae", estadoExecucao: "concluida" }),
        of({ ofId: "filha2", ofPaiId: "mae", estadoExecucao: "em_producao" }),
      ],
      opsNecessarias: [{ opId: "op1", ofId: "filha2", naoAplicavel: false }],
    });
    expect(resultado).toEqual({
      situacao: "com_pendencias",
      requisito: { idsOfsNecessarias: ["filha2"], idsOpsNecessariasPorOf: new Map([["filha2", ["op1"]]]) },
    });
  });

  it("6. OF desdobrada SEM filhas validas -> estrutura_inconsistente", () => {
    const resultado = determinarSituacaoEncerramentoProjetoPcp({
      ofs: [of({ ofId: "mae", estadoExecucao: "desdobrada" })],
      opsNecessarias: [],
    });
    expect(resultado).toEqual({
      situacao: "estrutura_inconsistente",
      detalhes: [{ ofId: "mae", motivo: expect.stringContaining("sem nenhuma filha") }],
    });
  });

  it("7. retrabalho pendente apos conclusao da OF original -> com_pendencias com o retrabalho", () => {
    const resultado = determinarSituacaoEncerramentoProjetoPcp({
      ofs: [of({ ofId: "original", estadoExecucao: "concluida" }), of({ ofId: "retrabalho1", estadoExecucao: "planejada" })],
      opsNecessarias: [],
    });
    expect(resultado).toEqual({
      situacao: "com_pendencias",
      requisito: { idsOfsNecessarias: ["retrabalho1"], idsOpsNecessariasPorOf: new Map([["retrabalho1", []]]) },
    });
  });

  it("7b. retrabalho ja concluido/cancelado -> nao conta como pendencia", () => {
    const resultado = determinarSituacaoEncerramentoProjetoPcp({
      ofs: [of({ ofId: "original", estadoExecucao: "concluida" }), of({ ofId: "retrabalho1", estadoExecucao: "cancelada" })],
      opsNecessarias: [],
    });
    expect(resultado).toEqual({ situacao: "encerrado_quanto_as_ofs" });
  });

  it("8. projeto sem OFs -> sem_base_de_ofs", () => {
    expect(determinarSituacaoEncerramentoProjetoPcp({ ofs: [], opsNecessarias: [] })).toEqual({ situacao: "sem_base_de_ofs" });
  });

  it("9. OP necessaria (nao_aplicavel=false) entra em idsOpsNecessariasPorOf; nao_aplicavel=true e excluida", () => {
    const resultado = determinarSituacaoEncerramentoProjetoPcp({
      ofs: [of({ ofId: "of1", estadoExecucao: "liberada" })],
      opsNecessarias: [
        { opId: "op1", ofId: "of1", naoAplicavel: false },
        { opId: "op2", ofId: "of1", naoAplicavel: true },
      ],
    });
    expect(resultado).toEqual({
      situacao: "com_pendencias",
      requisito: { idsOfsNecessarias: ["of1"], idsOpsNecessariasPorOf: new Map([["of1", ["op1"]]]) },
    });
  });

  it("ciclo na hierarquia of_pai_id (dado corrompido) -> estrutura_inconsistente, nunca loop infinito", () => {
    const resultado = determinarSituacaoEncerramentoProjetoPcp({
      ofs: [
        of({ ofId: "a", ofPaiId: "b", estadoExecucao: "desdobrada" }),
        of({ ofId: "b", ofPaiId: "a", estadoExecucao: "desdobrada" }),
      ],
      opsNecessarias: [],
    });
    expect(resultado.situacao).toBe("estrutura_inconsistente");
  });

  it("desdobramento em 2 niveis (filha tambem desdobrada) resolvido corretamente", () => {
    const resultado = determinarSituacaoEncerramentoProjetoPcp({
      ofs: [
        of({ ofId: "mae", estadoExecucao: "desdobrada" }),
        of({ ofId: "filha-desdobrada", ofPaiId: "mae", estadoExecucao: "desdobrada" }),
        of({ ofId: "neta1", ofPaiId: "filha-desdobrada", estadoExecucao: "concluida" }),
        of({ ofId: "neta2", ofPaiId: "filha-desdobrada", estadoExecucao: "em_producao" }),
      ],
      opsNecessarias: [],
    });
    expect(resultado).toEqual({
      situacao: "com_pendencias",
      requisito: { idsOfsNecessarias: ["neta2"], idsOpsNecessariasPorOf: new Map([["neta2", []]]) },
    });
  });

  it("determinismo - mesma entrada produz mesma saida", () => {
    const entrada = { ofs: [of({ ofId: "of1", estadoExecucao: "liberada" })], opsNecessarias: [] };
    expect(determinarSituacaoEncerramentoProjetoPcp(entrada)).toEqual(determinarSituacaoEncerramentoProjetoPcp({ ...entrada }));
  });
});
