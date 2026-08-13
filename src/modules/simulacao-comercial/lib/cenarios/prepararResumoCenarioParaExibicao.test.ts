import { describe, expect, it } from "vitest";
import { avaliarCenario, type DecisoesCenario, type GradeCompartilhada, type ResultadoAvaliacaoCenario } from "./avaliarCenario";
import { prepararResumoCenarioParaExibicao } from "./prepararResumoCenarioParaExibicao";
import type { BaseCenarios, OcorrenciaComTamanho } from "./carregarBaseCenarios";
import type { ChaveOcorrencia } from "./chaveOcorrencia";
import type { Contratacao } from "./contratacao";
import type { CapacidadeExtraDia } from "./capacidadeDia";
import type { RecursoTemporarioCenario } from "./recursoTemporario";

function chave(bomOperacaoId: string, overrides: Partial<ChaveOcorrencia> = {}): ChaveOcorrencia {
  return { projetoItemId: "item-1", produtoRaizId: "produto-1", caminhoBomItemIds: [], bomOperacaoId, ...overrides };
}

function ocorrencia(
  bomOperacaoId: string,
  necessarioHorasPadrao: number,
  recursoOriginalId = "recurso-A",
): OcorrenciaComTamanho {
  return {
    ocorrencia: { chave: chave(bomOperacaoId), bomOperacaoId, bomId: "bom-1" },
    necessarioHorasPadrao,
    recursoOriginalId,
  };
}

function gerarDatas(inicio: string, quantidade: number): string[] {
  const datas: string[] = [];
  const [ano, mes, dia] = inicio.split("-").map(Number);
  for (let i = 0; i < quantidade; i++) {
    const d = new Date(Date.UTC(ano, mes - 1, dia + i));
    datas.push(d.toISOString().slice(0, 10));
  }
  return datas;
}

function gradeSimples(prazoInterno: string, diasAntes: number, diasDepois: number): GradeCompartilhada {
  const [ano, mes, dia] = prazoInterno.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 1, dia - diasAntes)).toISOString().slice(0, 10);
  const grade = gerarDatas(inicio, diasAntes + diasDepois + 1);
  const candidatas = grade.filter((d) => d <= prazoInterno);
  return { datasGradeCompartilhada: grade, datasCandidatas: candidatas, prazoInterno };
}

const semDecisoes: DecisoesCenario = {
  capacidadeExtra: [],
  contratacoes: [],
  terceirizacoes: [],
  recursosTemporarios: [], antecipacoesMaterial: [],
};

function contratacaoTerceirizacaoValida(id: string, valor = 1000): Contratacao {
  return {
    id,
    tipo: "terceirizacao",
    abrangencia: "valor_fixo_unico",
    valor,
    moeda: "BRL",
    fornecedorOuContratado: "Fornecedor Externo",
    referenciaProposta: null,
    justificativa: "fixture",
    datas: [],
  };
}

function baseUmaOcorrencia(necessarioHorasPadrao: number, capacidadeDiaria = 8): BaseCenarios {
  const oc = ocorrencia("op-1", necessarioHorasPadrao, "recurso-A");
  return {
    empresaId: "empresa-1",
    projetoId: "projeto-1",
    ocorrencias: [oc],
    dependencias: [],
    chavesRaizOrcamentoNovo: [oc.ocorrencia.chave],
    chavesFinaisOrcamentoNovo: [oc.ocorrencia.chave],
    recursoIds: ["recurso-A"],
    compatibilidades: {},
    capacidadeDiariaPorRecurso: { "recurso-A": capacidadeDiaria },
    produtividadePorRecurso: { "recurso-A": 1 },
    comprometidoInicialPorRecurso: { "recurso-A": 0 },
  };
}

function baseDuasOcorrencias(): BaseCenarios {
  const oc1 = ocorrencia("op-1", 10, "recurso-A");
  const oc2 = ocorrencia("op-2", 5, "recurso-B");
  return {
    empresaId: "empresa-1",
    projetoId: "projeto-1",
    ocorrencias: [oc1, oc2],
    dependencias: [],
    chavesRaizOrcamentoNovo: [oc1.ocorrencia.chave, oc2.ocorrencia.chave],
    chavesFinaisOrcamentoNovo: [oc1.ocorrencia.chave, oc2.ocorrencia.chave],
    recursoIds: ["recurso-A", "recurso-B"],
    compatibilidades: {},
    capacidadeDiariaPorRecurso: { "recurso-A": 8, "recurso-B": 8 },
    produtividadePorRecurso: { "recurso-A": 1, "recurso-B": 1 },
    comprometidoInicialPorRecurso: { "recurso-A": 0, "recurso-B": 0 },
  };
}

describe("prepararResumoCenarioParaExibicao - agregação básica", () => {
  it("horas normais agregadas de todas as ocorrências, sem hora extra/temporário/terceirização", () => {
    const base = baseDuasOcorrencias();
    const grade = gradeSimples("2026-01-10", 5, 5);

    const resultadoBase = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado: resultadoBase, decisoes: semDecisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno });

    expect(resumo.horasNormais).toBe(15); // 10h + 5h
    expect(resumo.horasHoraExtra).toBe(0);
    expect(resumo.horasSabado).toBe(0);
    expect(resumo.horasDomingo).toBe(0);
    expect(resumo.horasFeriado).toBe(0);
    expect(resumo.horasRecursoTemporario).toBe(0);
    expect(resumo.deficitResidualTotalHorasPadrao).toBe(0);
    expect(resumo.operacoesTerceirizadas).toEqual([]);
    expect(resumo.operacoesComHoraExtra).toEqual([]);
    expect(resumo.operacoesComRecursoTemporario).toEqual([]);
  });

  it("horas extras separadas corretamente por natureza (hora_extra, sabado, domingo, feriado) - sem dupla contagem", () => {
    const oc = ocorrencia("op-1", 20, "recurso-A");
    const base: BaseCenarios = {
      empresaId: "empresa-1",
      projetoId: "projeto-1",
      ocorrencias: [oc],
      dependencias: [],
      chavesRaizOrcamentoNovo: [oc.ocorrencia.chave],
      chavesFinaisOrcamentoNovo: [oc.ocorrencia.chave],
      recursoIds: ["recurso-A"],
      compatibilidades: {},
      capacidadeDiariaPorRecurso: { "recurso-A": 0 }, // só extras contam - normal zerada
      produtividadePorRecurso: { "recurso-A": 1 },
      comprometidoInicialPorRecurso: { "recurso-A": 0 },
    };
    const grade = gradeSimples("2026-01-13", 5, 5);

    const capacidadeExtra: CapacidadeExtraDia[] = [
      { recursoId: "recurso-A", data: "2026-01-10", horasAdicionaisDisponiveis: 5, natureza: "hora_extra", elegibilidade: { escopo: "somente_orcamento_novo" }, contratacaoId: "c-he" },
      { recursoId: "recurso-A", data: "2026-01-11", horasAdicionaisDisponiveis: 5, natureza: "sabado", elegibilidade: { escopo: "somente_orcamento_novo" }, contratacaoId: "c-sab" },
      { recursoId: "recurso-A", data: "2026-01-12", horasAdicionaisDisponiveis: 5, natureza: "domingo", elegibilidade: { escopo: "somente_orcamento_novo" }, contratacaoId: "c-dom" },
      { recursoId: "recurso-A", data: "2026-01-13", horasAdicionaisDisponiveis: 5, natureza: "feriado", elegibilidade: { escopo: "somente_orcamento_novo" }, contratacaoId: "c-fer" },
    ];
    const contratacoes: Contratacao[] = ["c-he", "c-sab", "c-dom", "c-fer"].map((id) => ({
      id, tipo: "hora_extra", abrangencia: "por_hora_utilizada", valor: 10, moeda: "BRL",
      fornecedorOuContratado: "Equipe interna", referenciaProposta: null, justificativa: "teste",
      datas: ["2026-01-10", "2026-01-11", "2026-01-12", "2026-01-13"],
    }));

    const decisoes: DecisoesCenario = { capacidadeExtra, contratacoes, terceirizacoes: [], recursosTemporarios: [], antecipacoesMaterial: [] };
    const resultado = avaliarCenario(base, decisoes, grade);
    const resultadoBase = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno });

    expect(resultado.estado).toBe("viavel_no_limite");
    expect(resumo.horasNormais).toBe(0);
    expect(resumo.horasHoraExtra).toBe(5);
    expect(resumo.horasSabado).toBe(5);
    expect(resumo.horasDomingo).toBe(5);
    expect(resumo.horasFeriado).toBe(5);
    // soma das 4 naturezas = total necessário, sem sobra nem dupla contagem
    expect(resumo.horasHoraExtra + resumo.horasSabado + resumo.horasDomingo + resumo.horasFeriado).toBe(20);
    expect(resumo.operacoesComHoraExtra).toEqual([oc.ocorrencia.chave]);
  });

  it("recurso temporário contabilizado à parte de horas normais - operação com os dois usa ambas as contagens", () => {
    const oc = ocorrencia("op-1", 20, "recurso-A");
    const base: BaseCenarios = {
      empresaId: "empresa-1",
      projetoId: "projeto-1",
      ocorrencias: [oc],
      dependencias: [],
      chavesRaizOrcamentoNovo: [oc.ocorrencia.chave],
      chavesFinaisOrcamentoNovo: [oc.ocorrencia.chave],
      recursoIds: ["recurso-A"],
      compatibilidades: {},
      capacidadeDiariaPorRecurso: { "recurso-A": 8 },
      produtividadePorRecurso: { "recurso-A": 1 },
      comprometidoInicialPorRecurso: { "recurso-A": 0 },
    };
    const grade = gradeSimples("2026-01-10", 5, 5);

    const recursoTemporario: RecursoTemporarioCenario = {
      idTemporario: "temp-1",
      tipo: "freelancer",
      recursoReferenciaId: "ref",
      disponibilidade: [{ data: "2026-01-10", horasDisponiveis: 12 }],
      contratacaoId: "c-temp",
      justificativa: "teste",
      aplicavelAsOperacoes: [chave("op-1")],
    };
    const contratacoes: Contratacao[] = [
      { id: "c-temp", tipo: "freelancer", abrangencia: "por_hora_utilizada", valor: 20, moeda: "BRL", fornecedorOuContratado: "Freela", referenciaProposta: null, justificativa: "teste", datas: ["2026-01-10"] },
    ];
    const decisoes: DecisoesCenario = { capacidadeExtra: [], contratacoes, terceirizacoes: [], recursosTemporarios: [{ recursoTemporario, produtividadeReferencia: 1 }], antecipacoesMaterial: [] };

    const resultado = avaliarCenario(base, decisoes, grade);
    const resultadoBase = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno });

    expect(resultado.estado).toBe("viavel_no_limite");
    expect(resumo.horasNormais).toBe(8); // 8h do recurso-A
    expect(resumo.horasRecursoTemporario).toBe(12); // 12h do temporário
    expect(resumo.horasNormais + resumo.horasRecursoTemporario).toBe(20); // sem sobra, sem dupla contagem
    expect(resumo.operacoesComRecursoTemporario).toEqual([oc.ocorrencia.chave]);
  });

  it("ocorrência terceirizada não soma horas (unidade sintética não é hora real) - aparece só em operacoesTerceirizadas", () => {
    const oc = ocorrencia("op-1", 999, "recurso-A");
    const base: BaseCenarios = {
      empresaId: "empresa-1",
      projetoId: "projeto-1",
      ocorrencias: [oc],
      dependencias: [],
      chavesRaizOrcamentoNovo: [oc.ocorrencia.chave],
      chavesFinaisOrcamentoNovo: [oc.ocorrencia.chave],
      recursoIds: ["recurso-A"],
      compatibilidades: {},
      capacidadeDiariaPorRecurso: { "recurso-A": 8 },
      produtividadePorRecurso: { "recurso-A": 1 },
      comprometidoInicialPorRecurso: { "recurso-A": 0 },
    };
    const grade = gradeSimples("2026-01-20", 15, 5);
    const decisoes: DecisoesCenario = {
      capacidadeExtra: [],
      contratacoes: [contratacaoTerceirizacaoValida("c-terc", 1500)],
      terceirizacoes: [{ chave: chave("op-1"), fornecedor: "X", prazoDiasCorridos: 4, contratacaoId: "c-terc" }],
      recursosTemporarios: [], antecipacoesMaterial: [],
    };

    const resultado = avaliarCenario(base, decisoes, grade);
    const resultadoBase = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno });

    expect(resumo.horasNormais).toBe(0);
    expect(resumo.operacoesTerceirizadas).toEqual([{ chave: oc.ocorrencia.chave, diasCorridos: 4 }]);
    expect(resumo.custoAdicionalTotal).toBe(1500);
  });
});

describe("prepararResumoCenarioParaExibicao - diagnóstico de cenário inviável (nunca confundido com programação aceita)", () => {
  function baseUmaOcorrenciaComDeficit(): BaseCenarios {
    const oc = ocorrencia("op-1", 20, "recurso-A");
    return {
      empresaId: "empresa-1",
      projetoId: "projeto-1",
      ocorrencias: [oc],
      dependencias: [],
      chavesRaizOrcamentoNovo: [oc.ocorrencia.chave],
      chavesFinaisOrcamentoNovo: [oc.ocorrencia.chave],
      recursoIds: ["recurso-A"],
      compatibilidades: {},
      capacidadeDiariaPorRecurso: { "recurso-A": 8 },
      produtividadePorRecurso: { "recurso-A": 1 },
      comprometidoInicialPorRecurso: { "recurso-A": 0 },
    };
  }

  it("horizonte_tecnico_excedido: o resumo agrega o déficit real da tentativa diagnóstica e sinaliza resultadosSaoDiagnostico=true", () => {
    const base = baseUmaOcorrenciaComDeficit();
    const grade = gradeSimples("2026-01-10", 0, 1); // 2 dias × 8h = 16h no máximo, para 20h necessárias

    const resultado = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes: semDecisoes, resultadoBase: resultado, grade, dataSolicitadaCliente: grade.prazoInterno });

    expect(resultado.estado).toBe("horizonte_tecnico_excedido");
    expect(resumo.resultadosSaoDiagnostico).toBe(true);
    expect(resumo.deficitResidualTotalHorasPadrao).toBe(4); // déficit real, não 0
    // diagnóstico técnico: operação, déficit e recursos considerados/usados.
    expect(resumo.terminoCalculado).toBeNull(); // nenhum término calculável neste estado
    expect(resumo.inicioCalculado).toBe("2026-01-10"); // início calculado existe mesmo sem término (houve alocação parcial)
    expect(resumo.diferencaDiasCivisVsSolicitado).toBeNull();
    expect(resumo.diagnosticos).toHaveLength(1);
    const [diagnostico] = resumo.diagnosticos;
    expect(diagnostico.chave.bomOperacaoId).toBe("op-1");
    expect(diagnostico.status).toBe("bloqueada_por_deficit");
    expect(diagnostico.deficitResidualHorasPadrao).toBe(4);
    expect(diagnostico.recursosConsiderados).toEqual(["recurso-A"]);
    expect(diagnostico.recursosUsados).toEqual(["recurso-A"]);
  });

  it("horizonte_tecnico_excedido com predecessora bloqueada: sucessora aparece como 'bloqueada_por_predecessora' nos diagnósticos", () => {
    const ocA = ocorrencia("op-a-predecessora", 100, "recurso-A"); // nunca conclui - déficit permanente na grade
    const ocB = ocorrencia("op-b-sucessora", 4, "recurso-A");
    const base: BaseCenarios = {
      empresaId: "empresa-1",
      projetoId: "projeto-1",
      ocorrencias: [ocA, ocB],
      dependencias: [{ predecessora: ocA.ocorrencia.chave, sucessora: ocB.ocorrencia.chave, tipo: "sequencia_roteiro" }],
      chavesRaizOrcamentoNovo: [ocA.ocorrencia.chave],
      chavesFinaisOrcamentoNovo: [ocB.ocorrencia.chave],
      recursoIds: ["recurso-A"],
      compatibilidades: {},
      capacidadeDiariaPorRecurso: { "recurso-A": 8 },
      produtividadePorRecurso: { "recurso-A": 1 },
      comprometidoInicialPorRecurso: { "recurso-A": 0 },
    };
    const grade = gradeSimples("2026-01-10", 0, 5); // 6 dias × 8h = 48h no máximo, para 100h necessárias em A

    const resultado = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes: semDecisoes, resultadoBase: resultado, grade, dataSolicitadaCliente: grade.prazoInterno });

    expect(resultado.estado).toBe("horizonte_tecnico_excedido");
    expect(resumo.diagnosticos).toHaveLength(2);
    const statusPorBomOperacaoId = new Map(resumo.diagnosticos.map((d) => [d.chave.bomOperacaoId, d.status]));
    expect(statusPorBomOperacaoId.get("op-a-predecessora")).toBe("bloqueada_por_deficit");
    expect(statusPorBomOperacaoId.get("op-b-sucessora")).toBe("bloqueada_por_predecessora");
  });

  it("prazo_inviavel: diagnosticos vazio (todas as ocorrências concluem, o problema é atraso - já em diferencaDiasCivisVsSolicitado)", () => {
    const base = baseUmaOcorrencia(20, 8);
    const grade = gradeSimples("2026-01-10", 0, 5);

    const resultado = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes: semDecisoes, resultadoBase: resultado, grade, dataSolicitadaCliente: grade.prazoInterno });

    expect(resultado.estado).toBe("prazo_inviavel");
    expect(resumo.resultadosSaoDiagnostico).toBe(true);
    expect(resumo.diagnosticos).toEqual([]); // nenhuma ocorrência bloqueada - todas concluíram, só tarde
    expect(resumo.terminoCalculado).toBe("2026-01-12");
    expect(resumo.dataSolicitadaCliente).toBe("2026-01-10");
    expect(resumo.diferencaDiasCivisVsSolicitado).toBe(2); // término 2 dias depois do solicitado
  });

  it("dados_insuficientes: diagnóstico 'sem_candidato' preserva a operação sem nenhum candidato disponível", () => {
    const resultadoSemCandidato: ResultadoAvaliacaoCenario = {
      estado: "dados_insuficientes",
      metodoVersao: 2,
      chave: chave("op-sem-candidato"),
      custoAdicionalTotal: 0,
      custoPorContratacaoId: new Map(),
      resultadosPorOcorrencia: [],
      resultadosSaoDiagnostico: false,
    };
    const grade = gradeSimples("2026-01-10", 5, 5);
    const resumo = prepararResumoCenarioParaExibicao({
      resultado: resultadoSemCandidato,
      decisoes: semDecisoes,
      resultadoBase: resultadoSemCandidato,
      grade,
      dataSolicitadaCliente: grade.prazoInterno,
    });

    expect(resumo.terminoCalculado).toBeNull();
    expect(resumo.inicioCalculado).toBeNull();
    expect(resumo.diferencaDiasCivisVsSolicitado).toBeNull();
    expect(resumo.diagnosticos).toEqual([
      { chave: chave("op-sem-candidato"), status: "sem_candidato", deficitResidualHorasPadrao: null, recursosConsiderados: [], recursosUsados: [] },
    ]);
  });

  it("viável: resultadosSaoDiagnostico=false, resumo é uma programação genuinamente aceita, sem diagnósticos", () => {
    const base = baseDuasOcorrencias();
    const grade = gradeSimples("2026-01-10", 5, 5);

    const resultado = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes: semDecisoes, resultadoBase: resultado, grade, dataSolicitadaCliente: grade.prazoInterno });

    expect(resumo.resultadosSaoDiagnostico).toBe(false);
    expect(resumo.deficitResidualTotalHorasPadrao).toBe(0);
    expect(resumo.diagnosticos).toEqual([]);
  });
});

describe("prepararResumoCenarioParaExibicao - Término calculado / Data solicitada / dias ganhos vs. cenário-base / custo por alternativa", () => {
  it("viável_no_limite: termina exatamente na data solicitada - diferença 0, sem ganho vs. si mesmo como base", () => {
    const base = baseUmaOcorrencia(4, 8);
    const grade = gradeSimples("2026-01-10", 5, 5);

    const resultado = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes: semDecisoes, resultadoBase: resultado, grade, dataSolicitadaCliente: grade.prazoInterno });

    expect(resultado.estado).toBe("viavel_no_limite");
    expect(resumo.terminoCalculado).toBe("2026-01-10");
    expect(resumo.inicioCalculado).toBe("2026-01-10");
    expect(resumo.dataSolicitadaCliente).toBe("2026-01-10");
    expect(resumo.prazoInterno).toBe("2026-01-10");
    expect(resumo.diferencaDiasCivisVsSolicitado).toBe(0);
    expect(resumo.diasGanhosVsBase).toBe(0);
    expect(resumo.custoPorDiaAntecipado).toBeNull(); // sem ganho de dias, não faz sentido dividir
  });

  it("dataSolicitadaCliente é explícito e NUNCA derivado de grade.prazoInterno - prazoInterno já embute margem, as duas datas ficam separadas", () => {
    // Cliente pediu 2026-01-12; o prazo INTERNO (com margem de segurança
    // já aplicada por quem monta a grade) é 2 dias antes, 2026-01-10.
    // O cenário conclui exatamente no prazo interno (viavel_no_limite) -
    // mas contra a data REAL do cliente, sobram 2 dias de folga, que
    // ficariam escondidos se dataSolicitadaCliente fosse == prazoInterno.
    const base = baseUmaOcorrencia(4, 8);
    const grade = gradeSimples("2026-01-10", 5, 5);

    const resultado = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({
      resultado,
      decisoes: semDecisoes,
      resultadoBase: resultado,
      grade,
      dataSolicitadaCliente: "2026-01-12",
    });

    expect(resumo.terminoCalculado).toBe("2026-01-10");
    expect(resumo.prazoInterno).toBe("2026-01-10");
    expect(resumo.dataSolicitadaCliente).toBe("2026-01-12"); // preservada tal como informada, não recalculada
    expect(resumo.diferencaDiasCivisVsSolicitado).toBe(-2); // 2 dias ANTES do que o cliente pediu (folga real)
  });

  it("hora extra antecipa o término calculado em relação ao cenário-base: dias ganhos e custo por dia antecipado calculados", () => {
    const base = baseUmaOcorrencia(20, 8);
    const grade = gradeSimples("2026-01-10", 0, 5);

    const resultadoBase = avaliarCenario(base, semDecisoes, grade);
    expect(resultadoBase.estado).toBe("prazo_inviavel");
    if (resultadoBase.estado === "prazo_inviavel") {
      expect(resultadoBase.dataFimReal).toBe("2026-01-12");
    }

    const capacidadeExtra: CapacidadeExtraDia[] = [
      {
        recursoId: "recurso-A",
        data: "2026-01-10",
        horasAdicionaisDisponiveis: 12,
        natureza: "hora_extra",
        elegibilidade: { escopo: "somente_orcamento_novo" },
        contratacaoId: "c-he",
      },
    ];
    const contratacoes: Contratacao[] = [
      { id: "c-he", tipo: "hora_extra", abrangencia: "por_hora_utilizada", valor: 25, moeda: "BRL", fornecedorOuContratado: "Equipe", referenciaProposta: null, justificativa: "teste", datas: ["2026-01-10"] },
    ];
    const decisoes: DecisoesCenario = { capacidadeExtra, contratacoes, terceirizacoes: [], recursosTemporarios: [], antecipacoesMaterial: [] };
    const resultado = avaliarCenario(base, decisoes, grade);
    expect(resultado.estado).toBe("viavel_no_limite");

    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno });

    expect(resumo.terminoCalculado).toBe("2026-01-10");
    expect(resumo.diasGanhosVsBase).toBe(2); // 2026-01-12 (base) → 2026-01-10 (cenário) = 2 dias ganhos
    expect(resumo.custoAdicionalTotal).toBeCloseTo(25 * 12);
    expect(resumo.custoPorDiaAntecipado).toBeCloseTo((25 * 12) / 2);
    expect(resumo.custoPorAlternativa).toEqual({ horaExtra: 300, terceirizacao: 0, recursoTemporario: 0, antecipacaoMaterial: 0 });
  });

  it("custo por alternativa: hora extra, terceirização e recurso temporário em operações distintas, cada um no seu próprio balde", () => {
    const ocTerc = ocorrencia("op-terceirizada", 999, "recurso-C");
    const ocHextra = ocorrencia("op-hora-extra", 26, "recurso-A");
    const ocTemp = ocorrencia("op-temporario", 5, "recurso-B");
    const base: BaseCenarios = {
      empresaId: "empresa-1",
      projetoId: "projeto-1",
      ocorrencias: [ocTerc, ocHextra, ocTemp],
      dependencias: [],
      chavesRaizOrcamentoNovo: [ocTerc.ocorrencia.chave, ocHextra.ocorrencia.chave, ocTemp.ocorrencia.chave],
      chavesFinaisOrcamentoNovo: [ocTerc.ocorrencia.chave, ocHextra.ocorrencia.chave, ocTemp.ocorrencia.chave],
      recursoIds: ["recurso-A", "recurso-B", "recurso-C"],
      compatibilidades: {},
      capacidadeDiariaPorRecurso: { "recurso-A": 8, "recurso-B": 0, "recurso-C": 0 },
      produtividadePorRecurso: { "recurso-A": 1, "recurso-B": 1, "recurso-C": 1 },
      comprometidoInicialPorRecurso: { "recurso-A": 0, "recurso-B": 0, "recurso-C": 0 },
    };
    const grade = gradeSimples("2026-01-20", 15, 5);

    const recursoTemporario: RecursoTemporarioCenario = {
      idTemporario: "temp-3way",
      tipo: "freelancer",
      recursoReferenciaId: "recurso-referencia",
      disponibilidade: [{ data: "2026-01-18", horasDisponiveis: 5 }],
      contratacaoId: "temp-3way-contratacao",
      justificativa: "3way",
      aplicavelAsOperacoes: [chave("op-temporario")],
    };
    const capacidadeExtra: CapacidadeExtraDia[] = [
      { recursoId: "recurso-A", data: "2026-01-20", horasAdicionaisDisponiveis: 4, natureza: "hora_extra", elegibilidade: { escopo: "somente_orcamento_novo" }, contratacaoId: "hextra-3way-contratacao" },
    ];
    const contratacoes: Contratacao[] = [
      contratacaoTerceirizacaoValida("terc-3way-contratacao", 3000),
      { id: "hextra-3way-contratacao", tipo: "hora_extra", abrangencia: "por_hora_utilizada", valor: 60, moeda: "BRL", fornecedorOuContratado: "Equipe interna", referenciaProposta: null, justificativa: "3way", datas: ["2026-01-20"] },
      { id: "temp-3way-contratacao", tipo: "freelancer", abrangencia: "por_hora_utilizada", valor: 40, moeda: "BRL", fornecedorOuContratado: "Freelancer", referenciaProposta: null, justificativa: "3way", datas: ["2026-01-18"] },
    ];
    const decisoes: DecisoesCenario = {
      capacidadeExtra,
      contratacoes,
      terceirizacoes: [{ chave: chave("op-terceirizada"), fornecedor: "Fornecedor Externo", prazoDiasCorridos: 3, contratacaoId: "terc-3way-contratacao" }],
      recursosTemporarios: [{ recursoTemporario, produtividadeReferencia: 1 }], antecipacoesMaterial: [],
    };

    const resultado = avaliarCenario(base, decisoes, grade);
    const resultadoBase = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno });

    expect(resumo.custoPorAlternativa.terceirizacao).toBe(3000);
    expect(resumo.custoPorAlternativa.horaExtra).toBeCloseTo(60 * 2);
    expect(resumo.custoPorAlternativa.recursoTemporario).toBeCloseTo(40 * 5);
    const somaBaldes = resumo.custoPorAlternativa.horaExtra + resumo.custoPorAlternativa.terceirizacao + resumo.custoPorAlternativa.recursoTemporario;
    expect(somaBaldes).toBeCloseTo(resumo.custoAdicionalTotal);
  });

  it("antecipação de material: cenário-base é SEMPRE o cenário sem a decisão (custo zero, sem piso) - nunca uma avaliação artificial 'antecipada=original'", () => {
    // Correção de auditoria: a versão anterior deste teste construía o
    // "cenário-base" chamando avaliarCenario com uma DecisaoAntecipacaoMaterial
    // cuja dataDisponibilidadeAntecipada == dataDisponibilidadeOriginal -
    // ERRADO (violaria a validação de "estritamente anterior", inventaria
    // uma decisão inexistente, e contabilizaria custo de negociação no
    // cenário-base). O cenário-base correto é semDecisoes, exatamente como
    // já vale para as outras 3 alternativas.
    const base = baseUmaOcorrencia(4, 8);
    const grade = gradeSimples("2026-01-10", 0, 15);
    const contratacoes: Contratacao[] = [
      {
        id: "mat-1",
        tipo: "antecipacao_material",
        abrangencia: "valor_fixo_unico",
        valor: 500,
        moeda: "BRL",
        fornecedorOuContratado: "Fornecedor Materiais",
        referenciaProposta: null,
        justificativa: "fixture",
        datas: [],
      },
    ];
    const decisoesAjustado: DecisoesCenario = {
      capacidadeExtra: [],
      contratacoes,
      terceirizacoes: [],
      recursosTemporarios: [],
      antecipacoesMaterial: [{ chave: chave("op-1"), dataDisponibilidadeAntecipada: "2026-01-12", dataDisponibilidadeOriginal: "2026-01-15", contratacaoId: "mat-1" }],
    };

    const resultadoBase = avaliarCenario(base, semDecisoes, grade);
    const resultadoAjustado = avaliarCenario(base, decisoesAjustado, grade);
    const resumoBase = prepararResumoCenarioParaExibicao({ resultado: resultadoBase, decisoes: semDecisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno });
    const resumoAjustado = prepararResumoCenarioParaExibicao({ resultado: resultadoAjustado, decisoes: decisoesAjustado, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno });

    // Cenário-base: sem NENHUM piso de material, conclui na própria
    // candidata testada (10/01) - custo de antecipação zero.
    expect(resumoBase.terminoCalculado).toBe("2026-01-10");
    expect(resumoBase.inicioCalculado).toBe("2026-01-10");
    expect(resumoBase.custoPorAlternativa).toEqual({ horaExtra: 0, terceirizacao: 0, recursoTemporario: 0, antecipacaoMaterial: 0 });
    expect(resumoBase.custoAdicionalTotal).toBe(0);

    // Cenário ajustado: piso (12/01) empurra o início/término pra depois
    // do que o cenário-base irrestrito conseguiria - a antecipação de
    // material é uma restrição adicional em relação ao cenário-base
    // SEM restrição alguma, nunca uma vantagem "de graça". diasGanhosVsBase
    // fica NEGATIVO aqui (honesto: o ganho real da negociação só aparece
    // comparado contra "não negociar", nunca contra o cenário-base
    // irrestrito - ver avaliarCenario.test.ts para essa comparação).
    expect(resumoAjustado.terminoCalculado).toBe("2026-01-12");
    expect(resumoAjustado.inicioCalculado).toBe("2026-01-12"); // nunca antes do piso negociado
    expect(resumoAjustado.diasGanhosVsBase).toBe(-2);
    expect(resumoAjustado.custoPorDiaAntecipado).toBeNull(); // sem ganho de dias vs. o cenário-base, não faz sentido dividir
    expect(resumoAjustado.custoPorAlternativa).toEqual({ horaExtra: 0, terceirizacao: 0, recursoTemporario: 0, antecipacaoMaterial: 500 });
  });
});

describe("prepararResumoCenarioParaExibicao - operações afetadas (comparação com o cenário-base)", () => {
  it("cenário idêntico ao cenário-base: nenhuma operação afetada", () => {
    const base = baseDuasOcorrencias();
    const grade = gradeSimples("2026-01-10", 5, 5);

    const resultadoBase = avaliarCenario(base, semDecisoes, grade);
    // Mesmo cenário-base avaliado de novo (sem decisões) - deve ser idêntico a ele mesmo.
    const resultado = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes: semDecisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno });

    expect(resumo.operacoesAfetadas).toEqual([]);
  });

  it("só a operação que recebeu hora extra aparece em operações afetadas - a outra, inalterada, não aparece", () => {
    const oc1 = ocorrencia("op-1", 12, "recurso-A"); // vai precisar de hora extra
    const oc2 = ocorrencia("op-2", 4, "recurso-B"); // capacidade normal já basta, não deveria mudar nada
    const base: BaseCenarios = {
      empresaId: "empresa-1",
      projetoId: "projeto-1",
      ocorrencias: [oc1, oc2],
      dependencias: [],
      chavesRaizOrcamentoNovo: [oc1.ocorrencia.chave, oc2.ocorrencia.chave],
      chavesFinaisOrcamentoNovo: [oc1.ocorrencia.chave, oc2.ocorrencia.chave],
      recursoIds: ["recurso-A", "recurso-B"],
      compatibilidades: {},
      capacidadeDiariaPorRecurso: { "recurso-A": 8, "recurso-B": 8 },
      produtividadePorRecurso: { "recurso-A": 1, "recurso-B": 1 },
      comprometidoInicialPorRecurso: { "recurso-A": 0, "recurso-B": 0 },
    };
    const grade = gradeSimples("2026-01-10", 5, 5);

    const capacidadeExtra: CapacidadeExtraDia[] = [
      { recursoId: "recurso-A", data: "2026-01-10", horasAdicionaisDisponiveis: 4, natureza: "hora_extra", elegibilidade: { escopo: "somente_orcamento_novo" }, contratacaoId: "c-he" },
    ];
    const contratacoes: Contratacao[] = [
      { id: "c-he", tipo: "hora_extra", abrangencia: "por_hora_utilizada", valor: 10, moeda: "BRL", fornecedorOuContratado: "Equipe", referenciaProposta: null, justificativa: "teste", datas: ["2026-01-10"] },
    ];
    const decisoes: DecisoesCenario = { capacidadeExtra, contratacoes, terceirizacoes: [], recursosTemporarios: [], antecipacoesMaterial: [] };

    const resultadoBase = avaliarCenario(base, semDecisoes, grade);
    const resultado = avaliarCenario(base, decisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno });

    expect(resumo.operacoesAfetadas).toEqual([oc1.ocorrencia.chave]);
    expect(resumo.operacoesAfetadas).not.toContainEqual(oc2.ocorrencia.chave);
  });

  it("operação terceirizada sempre conta como afetada (o cenário-base nunca terceiriza nada)", () => {
    const oc = ocorrencia("op-1", 999, "recurso-A");
    const base: BaseCenarios = {
      empresaId: "empresa-1",
      projetoId: "projeto-1",
      ocorrencias: [oc],
      dependencias: [],
      chavesRaizOrcamentoNovo: [oc.ocorrencia.chave],
      chavesFinaisOrcamentoNovo: [oc.ocorrencia.chave],
      recursoIds: ["recurso-A"],
      compatibilidades: {},
      capacidadeDiariaPorRecurso: { "recurso-A": 8 },
      produtividadePorRecurso: { "recurso-A": 1 },
      comprometidoInicialPorRecurso: { "recurso-A": 0 },
    };
    const grade = gradeSimples("2026-01-20", 15, 5);
    const decisoes: DecisoesCenario = {
      capacidadeExtra: [],
      contratacoes: [contratacaoTerceirizacaoValida("c-terc")],
      terceirizacoes: [{ chave: chave("op-1"), fornecedor: "X", prazoDiasCorridos: 3, contratacaoId: "c-terc" }],
      recursosTemporarios: [], antecipacoesMaterial: [],
    };

    const resultadoBase = avaliarCenario(base, semDecisoes, grade);
    const resultado = avaliarCenario(base, decisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno });

    expect(resumo.operacoesAfetadas).toEqual([oc.ocorrencia.chave]);
  });
});
