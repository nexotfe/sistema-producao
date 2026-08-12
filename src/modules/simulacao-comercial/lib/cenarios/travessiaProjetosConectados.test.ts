import { describe, expect, it } from "vitest";
import { encontrarProjetosConectados } from "./travessiaProjetosConectados";
import type { OcorrenciaEscalonavel } from "./escalonadorConjunto";
import type { ChaveOcorrencia } from "./chaveOcorrencia";

function chave(bomOperacaoId: string): ChaveOcorrencia {
  return { projetoItemId: "PI-1", produtoRaizId: "PR-1", caminhoBomItemIds: [], bomOperacaoId };
}

function ocorrencia(projetoId: string, bomOperacaoId: string, candidatoIdsPorPrioridade: string[]): OcorrenciaEscalonavel {
  return {
    chave: chave(`${projetoId}-${bomOperacaoId}`),
    projetoId,
    necessarioHorasPadrao: 1,
    candidatoIdsPorPrioridade,
    ehOrcamentoNovo: projetoId === "ORCAMENTO",
    dataInicioJanela: "2026-11-09",
  };
}

describe("encontrarProjetosConectados", () => {
  it("orçamento novo sozinho (sem recurso compartilhado com ninguém) - componente de tamanho 1", () => {
    const ocorrencias = [
      ocorrencia("ORCAMENTO", "A", ["R1"]),
      ocorrencia("OUTRO", "B", ["R2"]), // recurso diferente - não conectado
    ];
    const conectados = encontrarProjetosConectados({ ocorrencias, projetoIdOrcamentoNovo: "ORCAMENTO" });
    expect(conectados).toEqual(new Set(["ORCAMENTO"]));
  });

  it("conexão direta: orçamento e outro projeto compartilham o mesmo candidatoId", () => {
    const ocorrencias = [ocorrencia("ORCAMENTO", "A", ["R1"]), ocorrencia("PROJ-B", "B", ["R1"])];
    const conectados = encontrarProjetosConectados({ ocorrencias, projetoIdOrcamentoNovo: "ORCAMENTO" });
    expect(conectados).toEqual(new Set(["ORCAMENTO", "PROJ-B"]));
  });

  it("conexão TRANSITIVA: A-B compartilham R1, B-C compartilham R2 - C entra mesmo sem tocar em R1", () => {
    const ocorrencias = [
      ocorrencia("ORCAMENTO", "A", ["R1"]),
      ocorrencia("PROJ-B", "B", ["R1", "R2"]),
      ocorrencia("PROJ-C", "C", ["R2"]),
      ocorrencia("PROJ-D", "D", ["R3"]), // isolado - nunca deveria entrar
    ];
    const conectados = encontrarProjetosConectados({ ocorrencias, projetoIdOrcamentoNovo: "ORCAMENTO" });
    expect(conectados).toEqual(new Set(["ORCAMENTO", "PROJ-B", "PROJ-C"]));
  });

  it("rejeita projetoIdOrcamentoNovo que não corresponde a nenhuma ocorrência", () => {
    const ocorrencias = [ocorrencia("PROJ-B", "B", ["R1"])];
    expect(() => encontrarProjetosConectados({ ocorrencias, projetoIdOrcamentoNovo: "ORCAMENTO-INEXISTENTE" })).toThrow(RangeError);
  });

  it("rejeita limiteTecnicoProjetos inválido", () => {
    const ocorrencias = [ocorrencia("ORCAMENTO", "A", ["R1"])];
    expect(() => encontrarProjetosConectados({ ocorrencias, projetoIdOrcamentoNovo: "ORCAMENTO", limiteTecnicoProjetos: 0 })).toThrow(RangeError);
  });

  it("sem corte arbitrário: uma cadeia longa mas FINITA de projetos conectados resolve por inteiro (não trunca uma cadeia real)", () => {
    // ORCAMENTO-R0-PROJ1-R1-PROJ2-R2-...-PROJ50 (cadeia de 50 projetos, cada um ligado ao próximo por um recurso próprio).
    const ocorrencias: OcorrenciaEscalonavel[] = [ocorrencia("ORCAMENTO", "raiz", ["R0"])];
    let recursoAnterior = "R0";
    for (let i = 1; i <= 50; i++) {
      const projetoId = `PROJ-${i}`;
      const proximoRecurso = `R${i}`;
      ocorrencias.push(ocorrencia(projetoId, `op`, [recursoAnterior, proximoRecurso]));
      recursoAnterior = proximoRecurso;
    }
    const conectados = encontrarProjetosConectados({ ocorrencias, projetoIdOrcamentoNovo: "ORCAMENTO" });
    expect(conectados.size).toBe(51); // ORCAMENTO + 50 projetos
    for (let i = 1; i <= 50; i++) expect(conectados.has(`PROJ-${i}`)).toBe(true);
  });

  it("limite técnico é um FREIO DE SEGURANÇA de verdade - com um limite artificialmente baixo, uma cadeia real (não um bug) ainda é rejeitada explicitamente, nunca truncada silenciosamente", () => {
    const ocorrencias: OcorrenciaEscalonavel[] = [ocorrencia("ORCAMENTO", "raiz", ["R0"])];
    let recursoAnterior = "R0";
    for (let i = 1; i <= 50; i++) {
      const proximoRecurso = `R${i}`;
      ocorrencias.push(ocorrencia(`PROJ-${i}`, "op", [recursoAnterior, proximoRecurso]));
      recursoAnterior = proximoRecurso;
    }
    expect(() => encontrarProjetosConectados({ ocorrencias, projetoIdOrcamentoNovo: "ORCAMENTO", limiteTecnicoProjetos: 5 })).toThrow(RangeError);
  });
});
