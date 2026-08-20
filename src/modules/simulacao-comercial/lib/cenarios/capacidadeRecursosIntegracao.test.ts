// Teste de integração do redesenho "regras semanais compactas" (Fase
// 8b) - confirma que as funções novas
// (construirDecisoesCapacidadeExtraDeRegras, construirDecisoesRecursoTemporario,
// ocorrenciasAplicaveisARecurso, combinarDecisoesCenario) produzem um
// DecisoesCenario que avaliarCenario (núcleo já testado, INALTERADO)
// aceita de verdade - recurso original + recurso interno alternativo
// (via compatibilidade, com custo automático via convenção coletiva) +
// recurso temporário combinados no mesmo cenário, sem lançar nenhum
// erro de validação.
import { describe, expect, it } from "vitest";
import { avaliarCenario, type DecisoesCenario } from "./avaliarCenario";
import type { BaseCenarios, OcorrenciaComTamanho } from "./carregarBaseCenarios";
import { construirGradeCompartilhada } from "./construirGradeCompartilhada";
import { prepararResumoCenarioParaExibicao } from "./prepararResumoCenarioParaExibicao";
import {
  construirDecisoesCapacidadeExtraDeRegras,
  type RegraSemanalCapacidadeExtra,
} from "./construirDecisoesCapacidadeExtraDeRegras";
import { construirDecisoesRecursoTemporario, type RecursoTemporarioParaConstruir } from "./construirDecisoesRecursoTemporario";
import { ocorrenciasAplicaveisARecurso } from "./ocorrenciasAplicaveisARecurso";
import { combinarDecisoesCenario } from "./combinarDecisoesCenario";
import { derivarNaturezaDia, type FatoCalendarioDia, type NaturezaDia } from "./derivarNaturezaDia";
import type { ConvencaoHorasAdicionaisVigencia } from "./resolverConvencaoParaData";
import type { ChaveOcorrencia } from "./chaveOcorrencia";
import type { CandidatoRecurso } from "../motorAvaliacaoSequencial";

function chave(bomOperacaoId: string): ChaveOcorrencia {
  return { projetoItemId: "PI-1", produtoRaizId: "PR-1", caminhoBomItemIds: [], bomOperacaoId };
}

function construirBase(): BaseCenarios {
  const ocorrencia: OcorrenciaComTamanho = {
    ocorrencia: { chave: chave("OP-1"), bomOperacaoId: "OP-1", bomId: "BOM-1" },
    necessarioHorasPadrao: 6,
    recursoOriginalId: "recurso-A",
  };
  const candidatoCompativel: CandidatoRecurso = { recursoId: "recurso-B", prioridade: 1 };

  return {
    empresaId: "empresa-1",
    projetoId: "projeto-1",
    ocorrencias: [ocorrencia],
    dependencias: [],
    chavesRaizOrcamentoNovo: [ocorrencia.ocorrencia.chave],
    chavesFinaisOrcamentoNovo: [ocorrencia.ocorrencia.chave],
    recursoIds: ["recurso-A", "recurso-B"],
    compatibilidades: { "recurso-A": [candidatoCompativel] },
    capacidadeDiariaPorRecurso: { "recurso-A": 4, "recurso-B": 4 },
    produtividadePorRecurso: { "recurso-A": 1, "recurso-B": 1 },
    comprometidoInicialPorRecurso: { "recurso-A": 0, "recurso-B": 0 },
    valorHoraPorRecurso: { "recurso-A": 20, "recurso-B": 20 },
    convencoesHorasAdicionais: [],
    restricaoMaterialPorChave: {},
  };
}

const padraoSemanalProdutivo: FatoCalendarioDia = { produtivo: true, origem: "padrao_semanal" };
function resolverNatureza(data: string): NaturezaDia {
  return derivarNaturezaDia(data, padraoSemanalProdutivo);
}

const convencaoFixture: ConvencaoHorasAdicionaisVigencia = {
  percentualSegundaSexta: 0.3,
  percentualSabado: 0.5,
  percentualDomingo: 1,
  percentualFeriado: 1,
  vigenteDesde: "2026-01-01",
  vigenteAte: null,
};

describe("Integração: original + interno alternativo + temporário no mesmo cenário", () => {
  it("combina os 3 (regra semanal num recurso alternativo, custo automático da convenção + recurso temporário) sem erro, e avaliarCenario aceita", () => {
    const base = construirBase();
    const grade = construirGradeCompartilhada("2026-01-12", "2026-01-20"); // segunda-feira

    // Recurso interno alternativo (recurso-B, compatível com recurso-A) recebe uma regra semanal (segunda a sexta) na semana de 12/01 (segunda-feira).
    const regraCapacidadeExtra: RegraSemanalCapacidadeExtra = {
      recursoId: "recurso-B",
      semanaInicio: "2026-01-12",
      dias: { diasUteis: [1, 2, 3, 4, 5], sabado: false, domingo: false, feriado: false },
      horasPorDia: 4,
      ativo: true,
    };
    const decisoesCapacidadeExtra = construirDecisoesCapacidadeExtraDeRegras({
      regras: [regraCapacidadeExtra],
      janelaInicio: "2026-01-12",
      janelaFim: "2026-01-13",
      resolverNatureza,
      valorHoraPorRecurso: { "recurso-B": 20 },
      convencoes: [convencaoFixture],
    });

    // Recurso temporário referenciando recurso-A - aplicável exatamente onde recurso-A já poderia atuar.
    const aplicavel = ocorrenciasAplicaveisARecurso(base, "recurso-A");
    expect(aplicavel).toHaveLength(1);

    const recursoTemporarioItem: RecursoTemporarioParaConstruir = {
      recursoTemporario: {
        idTemporario: "temp-1",
        tipo: "freelancer",
        recursoReferenciaId: "recurso-A",
        disponibilidade: [{ data: "2026-01-13", horasDisponiveis: 4 }],
        contratacaoId: "contratacao-temp-1",
        justificativa: "Reforço temporário.",
        aplicavelAsOperacoes: aplicavel,
      },
      produtividadeReferencia: 1,
      abrangencia: "por_hora_utilizada",
      valor: 45,
      fornecedorOuObservacao: "Freelancer XYZ",
    };
    const decisoesRecursoTemporario = construirDecisoesRecursoTemporario([recursoTemporarioItem]);

    const semMateriais: DecisoesCenario = {
      capacidadeExtra: [],
      contratacoes: [],
      terceirizacoes: [],
      recursosTemporarios: [],
      antecipacoesMaterial: [],
    };

    const decisoesCombinadas = combinarDecisoesCenario([semMateriais, decisoesCapacidadeExtra, decisoesRecursoTemporario]);

    // As 3 fontes coexistem no DecisoesCenario combinado.
    expect(decisoesCombinadas.capacidadeExtra).toHaveLength(2); // 12/01 e 13/01, mesma contratação (mesmo grupo)
    expect(decisoesCombinadas.recursosTemporarios).toHaveLength(1);
    expect(decisoesCombinadas.contratacoes).toHaveLength(2); // 1 grupo de hora extra (recurso-B) + 1 do temporário

    const resultado = avaliarCenario(base, decisoesCombinadas, grade);

    expect(Number.isFinite(resultado.custoAdicionalTotal)).toBe(true);
    expect(resultado.custoAdicionalTotal).toBeGreaterThanOrEqual(0);
    expect(resultado.custoPorContratacaoId).toBeInstanceOf(Map);
  });

  it("cenário-base (sem nenhuma das 3 decisões) continua avaliando normalmente com a mesma base", () => {
    const base = construirBase();
    const grade = construirGradeCompartilhada("2026-01-12", "2026-01-20");
    const semDecisoes: DecisoesCenario = {
      capacidadeExtra: [],
      contratacoes: [],
      terceirizacoes: [],
      recursosTemporarios: [],
      antecipacoesMaterial: [],
    };
    const resultado = avaliarCenario(base, semDecisoes, grade);
    expect(resultado.custoAdicionalTotal).toBe(0);
  });
});

// =====================================================================
// Caso completo pedido pelo usuário - números redondos, fáceis de
// conferir manualmente, cobrindo o pipeline inteiro (regra semanal ->
// avaliarCenario real -> prepararResumoCenarioParaExibicao), não valores
// mockados em nível baixo. Confirma o cenário de "falta OBRIGATÓRIA":
// as 2h de hora extra são realmente necessárias para a operação
// concluir dentro do único dia disponível - por isso são 100%
// utilizadas (disponibilizada = utilizada), diferente do teste visual
// anterior (1h de 2h ofertadas, porque a folga não era obrigatória).
// =====================================================================
describe("Caso completo com números fáceis de conferir (falta obrigatória de 2h)", () => {
  it("10h necessárias, 8h capacidade normal, 2h de hora extra obrigatória (30% seg-sex, R$80/h) -> custo R$208,00", () => {
    const base: BaseCenarios = {
      empresaId: "empresa-1",
      projetoId: "projeto-1",
      ocorrencias: [
        {
          ocorrencia: { chave: chave("OP-1"), bomOperacaoId: "OP-1", bomId: "BOM-1" },
          necessarioHorasPadrao: 10, // Necessidade da operação: 10 horas.
          recursoOriginalId: "recurso-A",
        },
      ],
      dependencias: [],
      chavesRaizOrcamentoNovo: [chave("OP-1")],
      chavesFinaisOrcamentoNovo: [chave("OP-1")],
      recursoIds: ["recurso-A"],
      compatibilidades: {},
      capacidadeDiariaPorRecurso: { "recurso-A": 8 }, // Capacidade normal disponível: 8 horas.
      produtividadePorRecurso: { "recurso-A": 1 },
      comprometidoInicialPorRecurso: { "recurso-A": 0 },
      valorHoraPorRecurso: { "recurso-A": 80 }, // Valor normal da hora: R$ 80,00.
      convencoesHorasAdicionais: [convencaoFixture], // percentualSegundaSexta = 0.3 (30%).
      restricaoMaterialPorChave: {},
    };

    // Janela de um ÚNICO dia útil (2026-09-14 é segunda-feira) - força a
    // operação a caber exatamente nesse dia, nunca a se espalhar por
    // vários dias sem precisar de hora extra (o que tornaria a falta
    // "opcional", não obrigatória).
    const grade = construirGradeCompartilhada("2026-09-14", "2026-09-14");

    const regraCapacidadeExtra: RegraSemanalCapacidadeExtra = {
      recursoId: "recurso-A",
      semanaInicio: "2026-09-14",
      dias: { diasUteis: [1], sabado: false, domingo: false, feriado: false }, // só segunda
      horasPorDia: 2, // Hora extra disponibilizada: exatamente 2 horas.
      ativo: true,
    };

    const decisoesCapacidadeExtra = construirDecisoesCapacidadeExtraDeRegras({
      regras: [regraCapacidadeExtra],
      janelaInicio: "2026-09-14",
      janelaFim: "2026-09-14",
      resolverNatureza,
      valorHoraPorRecurso: { "recurso-A": 80 },
      convencoes: [convencaoFixture],
    });

    // Valor da hora extra: R$ 80,00 × 1,30 = R$ 104,00 - mesma fórmula
    // unitária já confirmada no teste visual anterior (1h consumida =
    // R$ 104,00).
    expect(decisoesCapacidadeExtra.contratacoes).toHaveLength(1);
    expect(decisoesCapacidadeExtra.contratacoes[0].valor).toBeCloseTo(104, 6);
    expect(decisoesCapacidadeExtra.capacidadeExtra).toHaveLength(1);
    expect(decisoesCapacidadeExtra.capacidadeExtra[0].horasAdicionaisDisponiveis).toBe(2);

    const semDecisoesLocal: DecisoesCenario = {
      capacidadeExtra: [],
      contratacoes: [],
      terceirizacoes: [],
      recursosTemporarios: [],
      antecipacoesMaterial: [],
    };
    const resultadoBase = avaliarCenario(base, semDecisoesLocal, grade);
    const resultado = avaliarCenario(base, decisoesCapacidadeExtra, grade);
    const resumo = prepararResumoCenarioParaExibicao({
      resultado,
      decisoes: decisoesCapacidadeExtra,
      resultadoBase,
      grade,
      dataSolicitadaCliente: grade.prazoInterno,
      chavesFinais: base.chavesFinaisOrcamentoNovo,
      dependencias: base.dependencias,
    });

    // Falta obrigatória: as 2h disponibilizadas são REALMENTE
    // necessárias (10h totais - 8h normais = 2h) - por isso são 100%
    // utilizadas, nunca só uma parte.
    expect(resumo.horasNormais).toBe(8);
    expect(resumo.horasAdicionaisDisponibilizadas).toBe(2);
    expect(resumo.horasHoraExtra).toBe(2); // Horas extras realmente utilizadas pelo cálculo.
    expect(resumo.horasAdicionaisDisponibilizadas).toBe(resumo.horasHoraExtra); // disponibilizada = utilizada (obrigatória)

    // Custo adicional esperado: 2 × R$ 104,00 = R$ 208,00.
    expect(resumo.custoAdicionalTotal).toBeCloseTo(208, 6);
  });
});
