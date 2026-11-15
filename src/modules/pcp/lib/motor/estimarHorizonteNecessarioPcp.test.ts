import { describe, expect, it } from "vitest";
import { estimarDiasProdutivosNecessariosPcp, type IngredientesParaEstimativaHorizontePcp } from "./estimarHorizonteNecessarioPcp";

function ocorrencia(opId: string, necessarioHorasPadrao: number, candidatoIdsPorPrioridade: string[]) {
  return {
    chave: { opId },
    projetoId: "projeto-1",
    necessarioHorasPadrao,
    candidatoIdsPorPrioridade,
    ehOrcamentoNovo: false,
    dataInicioJanela: "2027-01-01",
  };
}

describe("estimarDiasProdutivosNecessariosPcp", () => {
  it("A. backlog vazio -> 0", () => {
    const resultado = estimarDiasProdutivosNecessariosPcp({ ocorrencias: [], dependencias: [], candidatos: [] });
    expect(resultado).toBe(0);
  });

  it("B. só gargalo de recurso (1 ocorrência, sem dependências)", () => {
    const ingredientes: IngredientesParaEstimativaHorizontePcp = {
      ocorrencias: [ocorrencia("op-1", 16, ["recurso-a"])],
      dependencias: [],
      candidatos: [{ recursoId: "recurso-a", capacidadeHorasDia: 8, produtividade: 1 }],
    };
    // 16h / 8h por dia = 2 dias + margem de 2 = 4
    expect(estimarDiasProdutivosNecessariosPcp(ingredientes)).toBe(4);
  });

  it("C. caminho crítico maior que o gargalo (cadeia longa em recursos pouco carregados)", () => {
    const ingredientes: IngredientesParaEstimativaHorizontePcp = {
      ocorrencias: [
        ocorrencia("op-1", 8, ["recurso-a"]),
        ocorrencia("op-2", 8, ["recurso-b"]),
        ocorrencia("op-3", 8, ["recurso-c"]),
      ],
      dependencias: [
        { predecessora: { opId: "op-1" }, sucessora: { opId: "op-2" }, tipo: "sequencia_roteiro" },
        { predecessora: { opId: "op-2" }, sucessora: { opId: "op-3" }, tipo: "sequencia_roteiro" },
      ],
      candidatos: [
        { recursoId: "recurso-a", capacidadeHorasDia: 8, produtividade: 1 },
        { recursoId: "recurso-b", capacidadeHorasDia: 8, produtividade: 1 },
        { recursoId: "recurso-c", capacidadeHorasDia: 8, produtividade: 1 },
      ],
    };
    // gargalo por recurso = 1 dia cada (nenhum sobrecarregado); caminho
    // crítico = 1+1+1 = 3 dias (cadeia sequencial) -> usa o maior.
    expect(estimarDiasProdutivosNecessariosPcp(ingredientes)).toBe(3 + 2);
  });

  it("D. gargalo maior que o caminho crítico (várias ocorrências independentes no mesmo recurso)", () => {
    const ingredientes: IngredientesParaEstimativaHorizontePcp = {
      ocorrencias: [
        ocorrencia("op-1", 8, ["recurso-a"]),
        ocorrencia("op-2", 8, ["recurso-a"]),
        ocorrencia("op-3", 8, ["recurso-a"]),
        ocorrencia("op-4", 8, ["recurso-a"]),
      ],
      dependencias: [],
      candidatos: [{ recursoId: "recurso-a", capacidadeHorasDia: 8, produtividade: 1 }],
    };
    // 4 ocorrências de 8h, todas no mesmo recurso de 8h/dia = 4 dias de gargalo; caminho crítico = 1 (sem dependências).
    expect(estimarDiasProdutivosNecessariosPcp(ingredientes)).toBe(4 + 2);
  });

  it("E. recurso com capacidadeHorasDia=0 não contamina o resultado (nunca Infinity/NaN)", () => {
    const ingredientes: IngredientesParaEstimativaHorizontePcp = {
      ocorrencias: [ocorrencia("op-1", 8, ["recurso-sem-capacidade"]), ocorrencia("op-2", 8, ["recurso-a"])],
      dependencias: [],
      candidatos: [
        { recursoId: "recurso-sem-capacidade", capacidadeHorasDia: 0, produtividade: 1 },
        { recursoId: "recurso-a", capacidadeHorasDia: 8, produtividade: 1 },
      ],
    };
    const resultado = estimarDiasProdutivosNecessariosPcp(ingredientes);
    expect(Number.isFinite(resultado)).toBe(true);
    expect(resultado).toBe(1 + 2); // só recurso-a conta (1 dia) + margem.
  });

  it("F. ciclo acidental na entrada nunca lança - caminho crítico cai no gargalo sozinho", () => {
    const ingredientes: IngredientesParaEstimativaHorizontePcp = {
      ocorrencias: [ocorrencia("op-1", 24, ["recurso-a"]), ocorrencia("op-2", 8, ["recurso-b"])],
      dependencias: [
        { predecessora: { opId: "op-1" }, sucessora: { opId: "op-2" }, tipo: "sequencia_roteiro" },
        { predecessora: { opId: "op-2" }, sucessora: { opId: "op-1" }, tipo: "sequencia_roteiro" },
      ],
      candidatos: [
        { recursoId: "recurso-a", capacidadeHorasDia: 8, produtividade: 1 },
        { recursoId: "recurso-b", capacidadeHorasDia: 8, produtividade: 1 },
      ],
    };
    expect(() => estimarDiasProdutivosNecessariosPcp(ingredientes)).not.toThrow();
    // Ciclo ignorado no caminho crítico (contribui 0) - sobra só o gargalo de recurso-a (24h/8h = 3 dias).
    expect(estimarDiasProdutivosNecessariosPcp(ingredientes)).toBe(3 + 2);
  });

  it("G. ocorrência sem candidato resolvível (candidatoIdsPorPrioridade vazio) nunca derruba a estimativa", () => {
    const ingredientes: IngredientesParaEstimativaHorizontePcp = {
      ocorrencias: [ocorrencia("op-1", 8, []), ocorrencia("op-2", 8, ["recurso-a"])],
      dependencias: [],
      candidatos: [{ recursoId: "recurso-a", capacidadeHorasDia: 8, produtividade: 1 }],
    };
    expect(() => estimarDiasProdutivosNecessariosPcp(ingredientes)).not.toThrow();
    expect(estimarDiasProdutivosNecessariosPcp(ingredientes)).toBe(1 + 2);
  });
});
