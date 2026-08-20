import { describe, expect, it } from "vitest";
import { ocorrenciasAplicaveisARecurso } from "./ocorrenciasAplicaveisARecurso";
import type { BaseCenarios, OcorrenciaComTamanho } from "./carregarBaseCenarios";
import type { ChaveOcorrencia } from "./chaveOcorrencia";
import type { CandidatoRecurso } from "../motorAvaliacaoSequencial";

function chave(bomOperacaoId: string): ChaveOcorrencia {
  return { projetoItemId: "PI-1", produtoRaizId: "PR-1", caminhoBomItemIds: [], bomOperacaoId };
}

function ocorrencia(bomOperacaoId: string, recursoOriginalId: string): OcorrenciaComTamanho {
  return {
    ocorrencia: { chave: chave(bomOperacaoId), bomOperacaoId, bomId: "BOM-1" },
    necessarioHorasPadrao: 10,
    recursoOriginalId,
  };
}

function base(overrides: Partial<BaseCenarios> = {}): BaseCenarios {
  return {
    empresaId: "empresa-1",
    projetoId: "projeto-1",
    ocorrencias: [],
    dependencias: [],
    chavesRaizOrcamentoNovo: [],
    chavesFinaisOrcamentoNovo: [],
    recursoIds: [],
    compatibilidades: {},
    capacidadeDiariaPorRecurso: {},
    produtividadePorRecurso: {},
    comprometidoInicialPorRecurso: {},
    valorHoraPorRecurso: {},
    convencoesHorasAdicionais: [],
    restricaoMaterialPorChave: {},
    ...overrides,
  };
}

function candidato(recursoId: string, prioridade = 1): CandidatoRecurso {
  return { recursoId, prioridade };
}

describe("ocorrenciasAplicaveisARecurso", () => {
  it("bate por recursoOriginalId - o recurso de referência É o original da operação", () => {
    const b = base({ ocorrencias: [ocorrencia("OP-1", "recurso-A"), ocorrencia("OP-2", "recurso-B")] });
    const resultado = ocorrenciasAplicaveisARecurso(b, "recurso-A");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].bomOperacaoId).toBe("OP-1");
  });

  it("bate via base.compatibilidades - o recurso de referência é compatível com o original da operação", () => {
    const b = base({
      ocorrencias: [ocorrencia("OP-1", "recurso-A")],
      compatibilidades: { "recurso-A": [candidato("recurso-B")] },
    });
    const resultado = ocorrenciasAplicaveisARecurso(b, "recurso-B");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].bomOperacaoId).toBe("OP-1");
  });

  it("recurso sem nenhuma relação (nem original, nem compatível) -> lista vazia", () => {
    const b = base({
      ocorrencias: [ocorrencia("OP-1", "recurso-A")],
      compatibilidades: { "recurso-A": [candidato("recurso-B")] },
    });
    const resultado = ocorrenciasAplicaveisARecurso(b, "recurso-C");
    expect(resultado).toEqual([]);
  });

  it("cobre múltiplas ocorrências quando o recurso é original em uma e compatível em outra", () => {
    const b = base({
      ocorrencias: [ocorrencia("OP-1", "recurso-A"), ocorrencia("OP-2", "recurso-C")],
      compatibilidades: { "recurso-C": [candidato("recurso-A")] },
    });
    const resultado = ocorrenciasAplicaveisARecurso(b, "recurso-A");
    expect(resultado.map((c) => c.bomOperacaoId).sort()).toEqual(["OP-1", "OP-2"]);
  });
});
