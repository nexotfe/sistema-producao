import { describe, expect, it } from "vitest";
import { construirGradeCompartilhada } from "./construirGradeCompartilhada";

describe("construirGradeCompartilhada", () => {
  it("grade cobre de janelaInicio até prazoInterno + buffer mínimo (30 dias), quando a janela em si é curta", () => {
    // janela [10/01, 12/01] = 2 dias civis de diferença - bem menor que
    // o buffer mínimo de 30, então o buffer aplicado precisa ser 30.
    const grade = construirGradeCompartilhada("2026-01-10", "2026-01-12");

    expect(grade.datasGradeCompartilhada[0]).toBe("2026-01-10");
    expect(grade.datasGradeCompartilhada[grade.datasGradeCompartilhada.length - 1]).toBe("2026-02-11"); // 12/01 + 30 dias
    expect(grade.prazoInterno).toBe("2026-01-12");
  });

  it("buffer escala com o tamanho da própria janela quando ela já é maior que o mínimo de 30 dias", () => {
    // janela [01/01, 01/03] = 59 dias civis de diferença - buffer aplicado precisa ser 59, não 30.
    const grade = construirGradeCompartilhada("2026-01-01", "2026-03-01");

    const ultimaData = grade.datasGradeCompartilhada[grade.datasGradeCompartilhada.length - 1];
    // 01/03 + 59 dias civis = 29/04.
    expect(ultimaData).toBe("2026-04-29");
  });

  it("datasCandidatas é exatamente o subconjunto de datasGradeCompartilhada <= prazoInterno, nada além disso", () => {
    const grade = construirGradeCompartilhada("2026-01-10", "2026-01-12");

    expect(grade.datasCandidatas).toEqual(["2026-01-10", "2026-01-11", "2026-01-12"]);
    for (const data of grade.datasCandidatas) {
      expect(data <= grade.prazoInterno).toBe(true);
    }
    // Nenhuma data de datasGradeCompartilhada posterior a prazoInterno vaza para datasCandidatas.
    for (const data of grade.datasGradeCompartilhada) {
      if (data > grade.prazoInterno) {
        expect(grade.datasCandidatas).not.toContain(data);
      }
    }
  });

  it("datasGradeCompartilhada é uma sequência de dias civis consecutivos, sem furos, sem duplicatas", () => {
    const grade = construirGradeCompartilhada("2026-01-10", "2026-01-15");

    for (let i = 1; i < grade.datasGradeCompartilhada.length; i++) {
      const anterior = new Date(`${grade.datasGradeCompartilhada[i - 1]}T00:00:00Z`);
      const atual = new Date(`${grade.datasGradeCompartilhada[i]}T00:00:00Z`);
      expect(atual.getTime() - anterior.getTime()).toBe(86_400_000);
    }
    expect(new Set(grade.datasGradeCompartilhada).size).toBe(grade.datasGradeCompartilhada.length);
  });

  it("janelaInicio igual a prazoInterno (janela de 1 dia só) ainda produz grade válida com buffer mínimo", () => {
    const grade = construirGradeCompartilhada("2026-01-10", "2026-01-10");

    expect(grade.datasCandidatas).toEqual(["2026-01-10"]);
    expect(grade.datasGradeCompartilhada[grade.datasGradeCompartilhada.length - 1]).toBe("2026-02-09"); // 10/01 + 30 dias
  });

  it("rejeita janelaInicio posterior a prazoInterno - janela vazia/invertida é erro explícito", () => {
    expect(() => construirGradeCompartilhada("2026-01-15", "2026-01-10")).toThrow(RangeError);
  });

  it("rejeita datas que não são ISO válidas", () => {
    expect(() => construirGradeCompartilhada("não-é-uma-data", "2026-01-10")).toThrow(RangeError);
    expect(() => construirGradeCompartilhada("2026-01-10", "")).toThrow(RangeError);
  });
});
