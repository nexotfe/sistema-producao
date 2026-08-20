import { describe, expect, it } from "vitest";
import {
  avaliarCenario,
  type AlocacaoDiariaCenario,
  type DecisoesCenario,
  type GradeCompartilhada,
  type ResultadoAvaliacaoCenario,
  type ResultadoOcorrenciaCenario,
} from "./avaliarCenario";
import { prepararResumoCenarioParaExibicao } from "./prepararResumoCenarioParaExibicao";
import type { BaseCenarios, OcorrenciaComTamanho } from "./carregarBaseCenarios";
import { chaveOcorrenciaParaString, type ChaveOcorrencia } from "./chaveOcorrencia";
import type { Contratacao } from "./contratacao";
import type { CapacidadeExtraDia } from "./capacidadeDia";
import type { RecursoTemporarioCenario } from "./recursoTemporario";
import type { DependenciaOcorrencia } from "./grafoPrecedencia";

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
    comprometidoInicialPorRecurso: { "recurso-A": 0 }, valorHoraPorRecurso: {}, convencoesHorasAdicionais: [], restricaoMaterialPorChave: {},
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
    comprometidoInicialPorRecurso: { "recurso-A": 0, "recurso-B": 0 }, valorHoraPorRecurso: {}, convencoesHorasAdicionais: [], restricaoMaterialPorChave: {},
  };
}

describe("prepararResumoCenarioParaExibicao - agregação básica", () => {
  it("horas normais agregadas de todas as ocorrências, sem hora extra/temporário/terceirização", () => {
    const base = baseDuasOcorrencias();
    const grade = gradeSimples("2026-01-10", 5, 5);

    const resultadoBase = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado: resultadoBase, decisoes: semDecisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

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
      comprometidoInicialPorRecurso: { "recurso-A": 0 }, valorHoraPorRecurso: {}, convencoesHorasAdicionais: [], restricaoMaterialPorChave: {},
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
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

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
      comprometidoInicialPorRecurso: { "recurso-A": 0 }, valorHoraPorRecurso: {}, convencoesHorasAdicionais: [], restricaoMaterialPorChave: {},
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
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

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
      comprometidoInicialPorRecurso: { "recurso-A": 0 }, valorHoraPorRecurso: {}, convencoesHorasAdicionais: [], restricaoMaterialPorChave: {},
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
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

    expect(resumo.horasNormais).toBe(0);
    expect(resumo.operacoesTerceirizadas).toEqual([{ chave: oc.ocorrencia.chave, diasCorridos: 4 }]);
    expect(resumo.custoAdicionalTotal).toBe(1500);
  });

  it("horasAdicionaisDisponibilizadas (potencial autorizado) pode ser MAIOR que horas realmente utilizadas - as duas nunca devem ser confundidas", () => {
    const oc = ocorrencia("op-1", 5, "recurso-A"); // só precisa de 5h
    const base: BaseCenarios = {
      empresaId: "empresa-1",
      projetoId: "projeto-1",
      ocorrencias: [oc],
      dependencias: [],
      chavesRaizOrcamentoNovo: [oc.ocorrencia.chave],
      chavesFinaisOrcamentoNovo: [oc.ocorrencia.chave],
      recursoIds: ["recurso-A"],
      compatibilidades: {},
      capacidadeDiariaPorRecurso: { "recurso-A": 0 }, // só a extra conta
      produtividadePorRecurso: { "recurso-A": 1 },
      comprometidoInicialPorRecurso: { "recurso-A": 0 }, valorHoraPorRecurso: {}, convencoesHorasAdicionais: [], restricaoMaterialPorChave: {},
    };
    const grade = gradeSimples("2026-01-10", 5, 5);

    // Regra disponibiliza 10h, mas a operação só precisa de 5h - o
    // escalonador consome só o necessário.
    const capacidadeExtra: CapacidadeExtraDia[] = [
      { recursoId: "recurso-A", data: "2026-01-10", horasAdicionaisDisponiveis: 10, natureza: "hora_extra", elegibilidade: { escopo: "somente_orcamento_novo" }, contratacaoId: "c-he" },
    ];
    const contratacoes: Contratacao[] = [
      { id: "c-he", tipo: "hora_extra", abrangencia: "por_hora_utilizada", valor: 10, moeda: "BRL", fornecedorOuContratado: "Equipe interna", referenciaProposta: null, justificativa: "teste", datas: ["2026-01-10"] },
    ];
    const decisoes: DecisoesCenario = { capacidadeExtra, contratacoes, terceirizacoes: [], recursosTemporarios: [], antecipacoesMaterial: [] };

    const resultado = avaliarCenario(base, decisoes, grade);
    const resultadoBase = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

    expect(resumo.horasAdicionaisDisponibilizadas).toBe(10); // potencial autorizado - fixo, sempre o total das regras
    expect(resumo.horasHoraExtra).toBe(5); // realmente usado - só o que a operação precisou
    expect(resumo.horasAdicionaisDisponibilizadas).not.toBe(resumo.horasHoraExtra);
  });

  it("horasAdicionaisDisponibilizadas é 0 quando não há nenhuma capacidadeExtra na decisão (cenário-base, por exemplo)", () => {
    const base = baseDuasOcorrencias();
    const grade = gradeSimples("2026-01-10", 5, 5);
    const resultadoBase = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado: resultadoBase, decisoes: semDecisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });
    expect(resumo.horasAdicionaisDisponibilizadas).toBe(0);
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
      comprometidoInicialPorRecurso: { "recurso-A": 0 }, valorHoraPorRecurso: {}, convencoesHorasAdicionais: [], restricaoMaterialPorChave: {},
    };
  }

  it("horizonte_tecnico_excedido: o resumo agrega o déficit real da tentativa diagnóstica e sinaliza resultadosSaoDiagnostico=true", () => {
    const base = baseUmaOcorrenciaComDeficit();
    const grade = gradeSimples("2026-01-10", 0, 1); // 2 dias × 8h = 16h no máximo, para 20h necessárias

    const resultado = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes: semDecisoes, resultadoBase: resultado, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

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

  it("recursos considerados diferentes dos efetivamente usados: compatibilidade oferece um 2º candidato que nunca chega a ser alocado", () => {
    const oc = ocorrencia("op-1", 20, "recurso-A"); // recurso-A sozinho já cobre as 20h (8h/dia × dias suficientes) - recurso-B nunca é necessário
    const base: BaseCenarios = {
      empresaId: "empresa-1",
      projetoId: "projeto-1",
      ocorrencias: [oc],
      dependencias: [],
      chavesRaizOrcamentoNovo: [oc.ocorrencia.chave],
      chavesFinaisOrcamentoNovo: [oc.ocorrencia.chave],
      recursoIds: ["recurso-A", "recurso-B"],
      compatibilidades: { "recurso-A": [{ recursoId: "recurso-B", prioridade: 2 }] },
      // recurso-B tem capacidade ZERO de propósito: fica "considerado"
      // (oferecido ao escalonador via compatibilidades) mas nunca pode
      // receber nenhuma hora - garante recursosUsados=[A] de forma
      // determinística, sem depender de como o escalonador prioriza/
      // paraleliza candidatos compatíveis com capacidade real.
      capacidadeDiariaPorRecurso: { "recurso-A": 8, "recurso-B": 0 },
      produtividadePorRecurso: { "recurso-A": 1, "recurso-B": 1 },
      comprometidoInicialPorRecurso: { "recurso-A": 0, "recurso-B": 0 }, valorHoraPorRecurso: {}, convencoesHorasAdicionais: [], restricaoMaterialPorChave: {},
    };
    // Mesma grade/resultado do teste "prazo_inviavel, nó final concluído
    // depois do prazo" acima (20h a 8h/dia, prazo em 5 dias) - termina
    // tarde (terminoReal > prazoInterno), então entra no diagnóstico.
    const grade = gradeSimples("2026-01-10", 0, 5);

    const resultado = avaliarCenario(base, semDecisoes, grade);
    expect(resultado.estado).toBe("prazo_inviavel");
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes: semDecisoes, resultadoBase: resultado, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

    expect(resumo.diagnosticos).toHaveLength(1);
    const [diagnostico] = resumo.diagnosticos;
    expect(diagnostico.recursosConsiderados).toEqual(["recurso-A", "recurso-B"]); // os 2 oferecidos ao escalonador
    expect(diagnostico.recursosUsados).toEqual(["recurso-A"]); // só o que de fato recebeu alocação
    expect(diagnostico.recursosConsiderados).not.toEqual(diagnostico.recursosUsados);
  });

  it("ausência de alocação: operação bloqueada desde o início (capacidade normal zerada, sem hora extra) - ultimoDiaComCapacidadeUtilizada e inicioReal ficam null", () => {
    const oc = ocorrencia("op-1", 10, "recurso-A");
    const base: BaseCenarios = {
      empresaId: "empresa-1",
      projetoId: "projeto-1",
      ocorrencias: [oc],
      dependencias: [],
      chavesRaizOrcamentoNovo: [oc.ocorrencia.chave],
      chavesFinaisOrcamentoNovo: [oc.ocorrencia.chave],
      recursoIds: ["recurso-A"],
      compatibilidades: {},
      capacidadeDiariaPorRecurso: { "recurso-A": 0 }, // zero capacidade normal - nunca recebe nenhuma alocação
      produtividadePorRecurso: { "recurso-A": 1 },
      comprometidoInicialPorRecurso: { "recurso-A": 0 }, valorHoraPorRecurso: {}, convencoesHorasAdicionais: [], restricaoMaterialPorChave: {},
    };
    const grade = gradeSimples("2026-01-10", 0, 5);

    const resultado = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes: semDecisoes, resultadoBase: resultado, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

    expect(resumo.diagnosticos).toHaveLength(1);
    const [diagnostico] = resumo.diagnosticos;
    expect(diagnostico.status).toBe("bloqueada_por_deficit");
    expect(diagnostico.deficitResidualHorasPadrao).toBe(10); // nada foi consumido
    expect(diagnostico.inicioReal).toBeNull();
    expect(diagnostico.terminoReal).toBeNull();
    expect(diagnostico.ultimoDiaComCapacidadeUtilizada).toBeNull(); // nunca "última data" nenhuma - nunca inventar uma
    expect(diagnostico.diasAtrasoVsPrazoInterno).toBeNull(); // sem terminoReal, não há o que comparar
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
      comprometidoInicialPorRecurso: { "recurso-A": 0 }, valorHoraPorRecurso: {}, convencoesHorasAdicionais: [], restricaoMaterialPorChave: {},
    };
    const grade = gradeSimples("2026-01-10", 0, 5); // 6 dias × 8h = 48h no máximo, para 100h necessárias em A

    const resultado = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes: semDecisoes, resultadoBase: resultado, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

    expect(resultado.estado).toBe("horizonte_tecnico_excedido");
    expect(resumo.diagnosticos).toHaveLength(2);
    const statusPorBomOperacaoId = new Map(resumo.diagnosticos.map((d) => [d.chave.bomOperacaoId, d.status]));
    expect(statusPorBomOperacaoId.get("op-a-predecessora")).toBe("bloqueada_por_deficit");
    expect(statusPorBomOperacaoId.get("op-b-sucessora")).toBe("bloqueada_por_predecessora");
    // Operação bloqueada intermediária (op-a, não é nó final) entra mesmo
    // assim - o critério "status !== concluida" nunca exige ser final.
    const ehFinalPorBomOperacaoId = new Map(resumo.diagnosticos.map((d) => [d.chave.bomOperacaoId, d.ehOcorrenciaFinal]));
    expect(ehFinalPorBomOperacaoId.get("op-a-predecessora")).toBe(false);
    expect(ehFinalPorBomOperacaoId.get("op-b-sucessora")).toBe(true);
  });

  it("prazo_inviavel, nó final concluído depois do prazo: entra no diagnóstico mesmo com déficit 0 (status concluida) - dias de atraso vêm de diasAtrasoVsPrazoInterno", () => {
    const base = baseUmaOcorrencia(20, 8);
    const grade = gradeSimples("2026-01-10", 0, 5);

    const resultado = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes: semDecisoes, resultadoBase: resultado, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

    expect(resultado.estado).toBe("prazo_inviavel");
    expect(resumo.resultadosSaoDiagnostico).toBe(true);
    expect(resumo.terminoCalculado).toBe("2026-01-12");
    expect(resumo.dataSolicitadaCliente).toBe("2026-01-10");
    expect(resumo.diferencaDiasCivisVsSolicitado).toBe(2); // término 2 dias depois do solicitado

    expect(resumo.diagnosticos).toHaveLength(1);
    const [diagnostico] = resumo.diagnosticos;
    expect(diagnostico.status).toBe("concluida"); // concluiu - o problema é atraso, não déficit
    expect(diagnostico.ehOcorrenciaFinal).toBe(true);
    expect(diagnostico.deficitResidualHorasPadrao).toBe(0);
    expect(diagnostico.terminoReal).toBe("2026-01-12");
    expect(diagnostico.diasAtrasoVsPrazoInterno).toBe(2); // dias CIVIS, positivo = atrasado
  });

  it("nó final dentro do prazo (viavel_no_limite): não entra no diagnóstico - termina exatamente no prazo, nunca depois", () => {
    const base = baseUmaOcorrencia(4, 8);
    const grade = gradeSimples("2026-01-10", 5, 5);

    const resultado = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes: semDecisoes, resultadoBase: resultado, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

    expect(resultado.estado).toBe("viavel_no_limite");
    expect(resumo.diagnosticos).toEqual([]);
  });

  it("operação intermediária concluída tarde é EXCLUÍDA do diagnóstico - só o nó final (que herda o atraso pela precedência) aparece", () => {
    const ocA = ocorrencia("op-a-intermediaria", 16, "recurso-A"); // termina tarde (2 dias × 8h)
    const ocB = ocorrencia("op-b-final", 4, "recurso-A"); // sucessora, também conclui - só depois de A
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
      comprometidoInicialPorRecurso: { "recurso-A": 0 }, valorHoraPorRecurso: {}, convencoesHorasAdicionais: [], restricaoMaterialPorChave: {},
    };
    const grade = gradeSimples("2026-01-10", 0, 5); // prazo 10/01 - 20h totais (A+B) não cabem, termina tarde

    const resultado = avaliarCenario(base, semDecisoes, grade);
    expect(resultado.estado).toBe("prazo_inviavel");
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes: semDecisoes, resultadoBase: resultado, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

    expect(resumo.diagnosticos).toHaveLength(1);
    expect(resumo.diagnosticos[0].chave.bomOperacaoId).toBe("op-b-final"); // só o final - A (intermediária, também tarde) não aparece
    expect(resumo.diagnosticos[0].ehOcorrenciaFinal).toBe(true);
  });

  it("múltiplos nós finais: cada final atrasado aparece como sua própria entrada no diagnóstico", () => {
    const oc1 = ocorrencia("op-1", 20, "recurso-A"); // cadeia 1, atrasa
    const oc2 = ocorrencia("op-2", 20, "recurso-B"); // cadeia 2, independente, também atrasa
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
      comprometidoInicialPorRecurso: { "recurso-A": 0, "recurso-B": 0 }, valorHoraPorRecurso: {}, convencoesHorasAdicionais: [], restricaoMaterialPorChave: {},
    };
    const grade = gradeSimples("2026-01-10", 0, 5);

    const resultado = avaliarCenario(base, semDecisoes, grade);
    expect(resultado.estado).toBe("prazo_inviavel");
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes: semDecisoes, resultadoBase: resultado, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

    expect(resumo.diagnosticos).toHaveLength(2);
    const bomOperacaoIds = resumo.diagnosticos.map((d) => d.chave.bomOperacaoId).sort();
    expect(bomOperacaoIds).toEqual(["op-1", "op-2"]);
    expect(resumo.diagnosticos.every((d) => d.ehOcorrenciaFinal)).toBe(true);
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
      chavesFinais: [chave("op-sem-candidato")],
      dependencias: [],
    });

    expect(resumo.terminoCalculado).toBeNull();
    expect(resumo.inicioCalculado).toBeNull();
    expect(resumo.diferencaDiasCivisVsSolicitado).toBeNull();
    expect(resumo.diagnosticos).toEqual([
      {
        chave: chave("op-sem-candidato"),
        status: "sem_candidato",
        ehOcorrenciaFinal: true,
        deficitResidualHorasPadrao: null,
        recursosConsiderados: [],
        recursosUsados: [],
        inicioReal: null,
        terminoReal: null,
        ultimoDiaComCapacidadeUtilizada: null,
        diasAtrasoVsPrazoInterno: null,
        cadeiaObservada: null,
      },
    ]);
  });

  it("viável: resultadosSaoDiagnostico=false, resumo é uma programação genuinamente aceita, sem diagnósticos", () => {
    const base = baseDuasOcorrencias();
    const grade = gradeSimples("2026-01-10", 5, 5);

    const resultado = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes: semDecisoes, resultadoBase: resultado, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

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
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes: semDecisoes, resultadoBase: resultado, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

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
      chavesFinais: base.chavesFinaisOrcamentoNovo,
      dependencias: base.dependencias,
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

    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

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
      comprometidoInicialPorRecurso: { "recurso-A": 0, "recurso-B": 0, "recurso-C": 0 }, valorHoraPorRecurso: {}, convencoesHorasAdicionais: [], restricaoMaterialPorChave: {},
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
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

    expect(resumo.custoPorAlternativa.terceirizacao).toBe(3000);
    expect(resumo.custoPorAlternativa.horaExtra).toBeCloseTo(60 * 2);
    expect(resumo.custoPorAlternativa.recursoTemporario).toBeCloseTo(40 * 5);
    const somaBaldes = resumo.custoPorAlternativa.horaExtra + resumo.custoPorAlternativa.terceirizacao + resumo.custoPorAlternativa.recursoTemporario;
    expect(somaBaldes).toBeCloseTo(resumo.custoAdicionalTotal);
  });

  it("antecipação de material: cenário-base RESPEITA a disponibilidade original (não é irrestrito) - diasGanhosVsBase positivo quando a antecipação é a única mudança", () => {
    // Correção de auditoria (DEC-007 §6.2.7): a disponibilidade original
    // não é mais campo da decisão nem metadado solto - vem de
    // base.restricaoMaterialPorChave, respeitada por QUALQUER cenário
    // avaliado sobre esta base, inclusive o cenário-base (semDecisoes).
    // Antes desta correção, o cenário-base ficava irrestrito e podia
    // começar antes até da disponibilidade original, produzindo
    // diasGanhosVsBase NEGATIVO mesmo após negociação bem-sucedida -
    // errado, corrigido.
    const base: BaseCenarios = {
      ...baseUmaOcorrencia(4, 8),
      valorHoraPorRecurso: {}, convencoesHorasAdicionais: [], restricaoMaterialPorChave: { [chaveOcorrenciaParaString(chave("op-1"))]: "2026-01-15" },
    };
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
      antecipacoesMaterial: [{ chave: chave("op-1"), dataDisponibilidadeAntecipada: "2026-01-12", contratacaoId: "mat-1" }],
    };

    const resultadoBase = avaliarCenario(base, semDecisoes, grade);
    const resultadoAjustado = avaliarCenario(base, decisoesAjustado, grade);
    const resumoBase = prepararResumoCenarioParaExibicao({ resultado: resultadoBase, decisoes: semDecisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });
    const resumoAjustado = prepararResumoCenarioParaExibicao({ resultado: resultadoAjustado, decisoes: decisoesAjustado, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

    // Cenário-base: respeita o piso ORIGINAL (15/01) mesmo sem decisão -
    // custo de antecipação zero (nenhuma Contratacao referenciada).
    expect(resumoBase.terminoCalculado).toBe("2026-01-15");
    expect(resumoBase.inicioCalculado).toBe("2026-01-15");
    expect(resumoBase.custoPorAlternativa).toEqual({ horaExtra: 0, terceirizacao: 0, recursoTemporario: 0, antecipacaoMaterial: 0 });
    expect(resumoBase.custoAdicionalTotal).toBe(0);

    // Cenário ajustado: piso negociado (12/01) SUBSTITUI o original -
    // termina antes do cenário-base, nunca depois - diasGanhosVsBase
    // positivo (3 dias genuinamente ganhos), custo aparece registrado.
    expect(resumoAjustado.terminoCalculado).toBe("2026-01-12");
    expect(resumoAjustado.inicioCalculado).toBe("2026-01-12"); // nunca antes do piso negociado
    expect(resumoAjustado.diasGanhosVsBase).toBe(3);
    expect(resumoAjustado.custoPorDiaAntecipado).toBeCloseTo(500 / 3);
    expect(resumoAjustado.custoPorAlternativa).toEqual({ horaExtra: 0, terceirizacao: 0, recursoTemporario: 0, antecipacaoMaterial: 500 });
  });

  it("antecipação sem efeito no cálculo (outra restrição já é mais tarde que os 2 pisos): diasGanhosVsBase é zero, nunca negativo - custo continua registrado para o usuário perceber a falta de benefício", () => {
    const base: BaseCenarios = {
      ...baseUmaOcorrencia(4, 8),
      valorHoraPorRecurso: {}, convencoesHorasAdicionais: [], restricaoMaterialPorChave: { [chaveOcorrenciaParaString(chave("op-1"))]: "2026-01-12" },
    };
    const grade = gradeSimples("2026-01-15", 0, 5); // única candidata (15/01) já é mais tarde que os 2 pisos
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
      antecipacoesMaterial: [{ chave: chave("op-1"), dataDisponibilidadeAntecipada: "2026-01-10", contratacaoId: "mat-1" }],
    };

    const resultadoBase = avaliarCenario(base, semDecisoes, grade);
    const resultadoAjustado = avaliarCenario(base, decisoesAjustado, grade);
    const resumoBase = prepararResumoCenarioParaExibicao({ resultado: resultadoBase, decisoes: semDecisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });
    const resumoAjustado = prepararResumoCenarioParaExibicao({ resultado: resultadoAjustado, decisoes: decisoesAjustado, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

    expect(resumoBase.terminoCalculado).toBe("2026-01-15");
    expect(resumoAjustado.terminoCalculado).toBe("2026-01-15"); // idêntico ao base - negociação sem efeito real
    expect(resumoAjustado.diasGanhosVsBase).toBe(0); // zero, nunca negativo
    expect(resumoAjustado.custoPorDiaAntecipado).toBeNull(); // sem ganho de dias, não faz sentido dividir
    expect(resumoAjustado.custoPorAlternativa.antecipacaoMaterial).toBe(500); // custo registrado mesmo sem benefício
    expect(resumoAjustado.custoAdicionalTotal).toBe(500);
  });
});

describe("prepararResumoCenarioParaExibicao - operações afetadas (comparação com o cenário-base)", () => {
  it("cenário idêntico ao cenário-base: nenhuma operação afetada", () => {
    const base = baseDuasOcorrencias();
    const grade = gradeSimples("2026-01-10", 5, 5);

    const resultadoBase = avaliarCenario(base, semDecisoes, grade);
    // Mesmo cenário-base avaliado de novo (sem decisões) - deve ser idêntico a ele mesmo.
    const resultado = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes: semDecisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

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
      comprometidoInicialPorRecurso: { "recurso-A": 0, "recurso-B": 0 }, valorHoraPorRecurso: {}, convencoesHorasAdicionais: [], restricaoMaterialPorChave: {},
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
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

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
      comprometidoInicialPorRecurso: { "recurso-A": 0 }, valorHoraPorRecurso: {}, convencoesHorasAdicionais: [], restricaoMaterialPorChave: {},
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
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes, resultadoBase, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

    expect(resumo.operacoesAfetadas).toEqual([oc.ocorrencia.chave]);
  });
});

describe("prepararResumoCenarioParaExibicao - Cadeia precedente observada", () => {
  function resultadoOcorrencia(bomOperacaoId: string, overrides: Partial<ResultadoOcorrenciaCenario> = {}): ResultadoOcorrenciaCenario {
    return {
      chave: chave(bomOperacaoId),
      status: "concluida",
      dataInicioReal: null,
      dataFimReal: null,
      deficitResidualHorasPadrao: 0,
      alocacoes: [],
      terceirizada: false,
      prazoDiasCorridosTerceirizacao: null,
      recursosConsiderados: [],
      ...overrides,
    };
  }

  function alocacao(data: string, recursoId: string, horas = 8): AlocacaoDiariaCenario {
    return { data, natureza: "normal", contratacaoId: null, horasMaquina: horas, horasPadrao: horas, recursoId };
  }

  /** Monta um ResultadoAvaliacaoCenario "prazo_inviavel" pronto - único estado usado neste bloco (é onde a cadeia se aplica: nó final concluído, mas depois do prazo). */
  function resultadoPrazoInviavel(dataFimReal: string, resultadosPorOcorrencia: ResultadoOcorrenciaCenario[]): ResultadoAvaliacaoCenario {
    return {
      estado: "prazo_inviavel",
      metodoVersao: 2,
      dataFimReal,
      diasCivisDeAtraso: 1,
      custoAdicionalTotal: 0,
      custoPorContratacaoId: new Map(),
      resultadosPorOcorrencia,
      resultadosSaoDiagnostico: true,
    };
  }

  function chamarComCadeia(params: {
    prazoInterno: string;
    resultadosPorOcorrencia: ResultadoOcorrenciaCenario[];
    dependencias: DependenciaOcorrencia[];
    chavesFinais: ChaveOcorrencia[];
    dataFimRealCenario: string;
  }) {
    const grade = gradeSimples(params.prazoInterno, 10, 10);
    const resultado = resultadoPrazoInviavel(params.dataFimRealCenario, params.resultadosPorOcorrencia);
    return prepararResumoCenarioParaExibicao({
      resultado,
      decisoes: semDecisoes,
      resultadoBase: resultado,
      grade,
      dataSolicitadaCliente: grade.prazoInterno,
      chavesFinais: params.chavesFinais,
      dependencias: params.dependencias,
    });
  }

  it("cadeia linear simples (raiz -> elo -> final), tudo imediato: gapNaoAtribuivel=false em todos os elos", () => {
    const r = resultadoOcorrencia("op-r", {
      dataInicioReal: "2026-01-06",
      dataFimReal: "2026-01-06",
      alocacoes: [alocacao("2026-01-06", "recurso-A")],
    });
    const a = resultadoOcorrencia("op-a", {
      dataInicioReal: "2026-01-07",
      dataFimReal: "2026-01-08",
      alocacoes: [alocacao("2026-01-07", "recurso-B"), alocacao("2026-01-08", "recurso-B")],
    });
    const f = resultadoOcorrencia("op-f", {
      dataInicioReal: "2026-01-09",
      dataFimReal: "2026-01-10",
      alocacoes: [alocacao("2026-01-09", "recurso-C"), alocacao("2026-01-10", "recurso-C")],
    });
    const dependencias: DependenciaOcorrencia[] = [
      { predecessora: r.chave, sucessora: a.chave, tipo: "sequencia_roteiro" },
      { predecessora: a.chave, sucessora: f.chave, tipo: "sequencia_roteiro" },
    ];

    const resumo = chamarComCadeia({
      prazoInterno: "2026-01-08",
      resultadosPorOcorrencia: [r, a, f],
      dependencias,
      chavesFinais: [f.chave],
      dataFimRealCenario: "2026-01-10",
    });

    expect(resumo.diagnosticos).toHaveLength(1);
    const cadeia = resumo.diagnosticos[0].cadeiaObservada;
    expect(cadeia).not.toBeNull();
    expect(cadeia!.passos).toHaveLength(3);
    expect(cadeia!.passos[0]).toMatchObject({ tipo: "raiz", operacao: { chave: r.chave } });
    expect(cadeia!.passos[1]).toMatchObject({ tipo: "elo", operacao: { chave: a.chave }, gapNaoAtribuivel: false });
    expect(cadeia!.passos[2]).toMatchObject({ tipo: "elo", operacao: { chave: f.chave }, gapNaoAtribuivel: false });
  });

  it("cadeia com subconjunto (dependência tipo consumo_subconjunto) é rastreada da mesma forma - o algoritmo não distingue o tipo de dependência", () => {
    const r = resultadoOcorrencia("op-subconjunto", {
      dataInicioReal: "2026-01-06",
      dataFimReal: "2026-01-07",
      alocacoes: [alocacao("2026-01-06", "recurso-A"), alocacao("2026-01-07", "recurso-A")],
    });
    const f = resultadoOcorrencia("op-f", {
      dataInicioReal: "2026-01-08",
      dataFimReal: "2026-01-10",
      alocacoes: [alocacao("2026-01-08", "recurso-B")],
    });
    const dependencias: DependenciaOcorrencia[] = [{ predecessora: r.chave, sucessora: f.chave, tipo: "consumo_subconjunto" }];

    const resumo = chamarComCadeia({
      prazoInterno: "2026-01-08",
      resultadosPorOcorrencia: [r, f],
      dependencias,
      chavesFinais: [f.chave],
      dataFimRealCenario: "2026-01-10",
    });

    const cadeia = resumo.diagnosticos[0].cadeiaObservada!;
    expect(cadeia.passos).toHaveLength(2);
    expect(cadeia.passos[0]).toMatchObject({ tipo: "raiz", operacao: { chave: r.chave } });
    expect(cadeia.passos[1]).toMatchObject({ tipo: "elo", operacao: { chave: f.chave }, gapNaoAtribuivel: false });
  });

  it("raiz sem predecessora: nó final que também é raiz produz cadeia com 1 único passo do tipo 'raiz'", () => {
    const f = resultadoOcorrencia("op-f", {
      dataInicioReal: "2026-01-08",
      dataFimReal: "2026-01-10",
      alocacoes: [alocacao("2026-01-08", "recurso-A")],
    });

    const resumo = chamarComCadeia({
      prazoInterno: "2026-01-08",
      resultadosPorOcorrencia: [f],
      dependencias: [],
      chavesFinais: [f.chave],
      dataFimRealCenario: "2026-01-10",
    });

    const cadeia = resumo.diagnosticos[0].cadeiaObservada!;
    expect(cadeia.passos).toEqual([{ tipo: "raiz", operacao: { chave: f.chave, recursosUsados: ["recurso-A"], inicioReal: "2026-01-08", terminoReal: "2026-01-10" } }]);
  });

  it("nó final dentro do prazo: cadeiaObservada é null (o bloco de atraso não se aplica, a cadeia também não)", () => {
    const base = baseUmaOcorrencia(4, 8);
    const grade = gradeSimples("2026-01-10", 5, 5);

    const resultado = avaliarCenario(base, semDecisoes, grade);
    const resumo = prepararResumoCenarioParaExibicao({ resultado, decisoes: semDecisoes, resultadoBase: resultado, grade, dataSolicitadaCliente: grade.prazoInterno, chavesFinais: base.chavesFinaisOrcamentoNovo, dependencias: base.dependencias });

    expect(resultado.estado).toBe("viavel_no_limite");
    expect(resumo.diagnosticos).toEqual([]); // sem diagnóstico nenhum, portanto sem cadeia também
  });

  it("múltiplas predecessoras SEM empate: segue a de maior terminoReal, a outra não entra na cadeia", () => {
    const p1 = resultadoOcorrencia("op-p1", { dataFimReal: "2026-01-05", dataInicioReal: "2026-01-05", alocacoes: [alocacao("2026-01-05", "recurso-A")] });
    const p2 = resultadoOcorrencia("op-p2", { dataFimReal: "2026-01-07", dataInicioReal: "2026-01-07", alocacoes: [alocacao("2026-01-07", "recurso-B")] });
    const f = resultadoOcorrencia("op-f", {
      dataInicioReal: "2026-01-08",
      dataFimReal: "2026-01-10",
      alocacoes: [alocacao("2026-01-08", "recurso-C")],
    });
    const dependencias: DependenciaOcorrencia[] = [
      { predecessora: p1.chave, sucessora: f.chave, tipo: "sequencia_roteiro" },
      { predecessora: p2.chave, sucessora: f.chave, tipo: "sequencia_roteiro" },
    ];

    const resumo = chamarComCadeia({
      prazoInterno: "2026-01-08",
      resultadosPorOcorrencia: [p1, p2, f],
      dependencias,
      chavesFinais: [f.chave],
      dataFimRealCenario: "2026-01-10",
    });

    const cadeia = resumo.diagnosticos[0].cadeiaObservada!;
    expect(cadeia.passos).toHaveLength(2);
    expect(cadeia.passos[0]).toMatchObject({ tipo: "raiz", operacao: { chave: p2.chave } }); // a de maior terminoReal (07/01), não p1 (05/01)
    expect(cadeia.passos[1]).toMatchObject({ tipo: "elo", operacao: { chave: f.chave }, gapNaoAtribuivel: false });
  });

  it("empate entre predecessoras: nunca escolhe uma arbitrariamente - lista as duas empatadas e para de rastrear atrás delas", () => {
    const p1 = resultadoOcorrencia("op-p1", { dataFimReal: "2026-01-07", dataInicioReal: "2026-01-06", alocacoes: [alocacao("2026-01-06", "recurso-A")] });
    const p2 = resultadoOcorrencia("op-p2", { dataFimReal: "2026-01-07", dataInicioReal: "2026-01-06", alocacoes: [alocacao("2026-01-06", "recurso-B")] });
    const f = resultadoOcorrencia("op-f", {
      dataInicioReal: "2026-01-08",
      dataFimReal: "2026-01-10",
      alocacoes: [alocacao("2026-01-08", "recurso-C")],
    });
    const dependencias: DependenciaOcorrencia[] = [
      { predecessora: p1.chave, sucessora: f.chave, tipo: "sequencia_roteiro" },
      { predecessora: p2.chave, sucessora: f.chave, tipo: "sequencia_roteiro" },
    ];

    const resumo = chamarComCadeia({
      prazoInterno: "2026-01-08",
      resultadosPorOcorrencia: [p1, p2, f],
      dependencias,
      chavesFinais: [f.chave],
      dataFimRealCenario: "2026-01-10",
    });

    const cadeia = resumo.diagnosticos[0].cadeiaObservada!;
    expect(cadeia.passos).toHaveLength(2);
    expect(cadeia.passos[0].tipo).toBe("empate");
    if (cadeia.passos[0].tipo === "empate") {
      const chavesEmpatadas = cadeia.passos[0].operacoesEmpatadas.map((o) => o.chave.bomOperacaoId).sort();
      expect(chavesEmpatadas).toEqual(["op-p1", "op-p2"]);
    }
    expect(cadeia.passos[1]).toMatchObject({ tipo: "elo", operacao: { chave: f.chave } });
  });

  it("sucessora iniciando depois de todas as predecessoras (gap): gapNaoAtribuivel=true, nunca afirma que a cadeia determinou o início", () => {
    const p = resultadoOcorrencia("op-p", { dataFimReal: "2026-01-05", dataInicioReal: "2026-01-04", alocacoes: [alocacao("2026-01-04", "recurso-A")] });
    const f = resultadoOcorrencia("op-f", {
      dataInicioReal: "2026-01-08", // 3 dias depois do término de p (não é o dia seguinte) - gap
      dataFimReal: "2026-01-10",
      alocacoes: [alocacao("2026-01-08", "recurso-B")],
    });
    const dependencias: DependenciaOcorrencia[] = [{ predecessora: p.chave, sucessora: f.chave, tipo: "sequencia_roteiro" }];

    const resumo = chamarComCadeia({
      prazoInterno: "2026-01-08",
      resultadosPorOcorrencia: [p, f],
      dependencias,
      chavesFinais: [f.chave],
      dataFimRealCenario: "2026-01-10",
    });

    const cadeia = resumo.diagnosticos[0].cadeiaObservada!;
    expect(cadeia.passos).toHaveLength(2);
    expect(cadeia.passos[0]).toMatchObject({ tipo: "raiz", operacao: { chave: p.chave } });
    expect(cadeia.passos[1]).toMatchObject({ tipo: "elo", operacao: { chave: f.chave }, gapNaoAtribuivel: true });
  });

  it("predecessora sem término real: não pode ser comparada - cadeia fica indisponível a partir daquele ponto, nunca apresentada como completa", () => {
    const p = resultadoOcorrencia("op-p", { status: "bloqueada_por_deficit", dataInicioReal: null, dataFimReal: null });
    const f = resultadoOcorrencia("op-f", {
      dataInicioReal: "2026-01-08",
      dataFimReal: "2026-01-10",
      alocacoes: [alocacao("2026-01-08", "recurso-B")],
    });
    const dependencias: DependenciaOcorrencia[] = [{ predecessora: p.chave, sucessora: f.chave, tipo: "sequencia_roteiro" }];

    const resumo = chamarComCadeia({
      prazoInterno: "2026-01-08",
      resultadosPorOcorrencia: [p, f],
      dependencias,
      chavesFinais: [f.chave],
      dataFimRealCenario: "2026-01-10",
    });

    // p também entra em diagnosticos (status bloqueada_por_deficit) - a
    // cadeia que importa aqui é a de f, o nó final atrasado.
    const diagnosticoF = resumo.diagnosticos.find((d) => d.chave.bomOperacaoId === "op-f")!;
    const cadeia = diagnosticoF.cadeiaObservada!;
    expect(cadeia.passos).toHaveLength(2);
    expect(cadeia.passos[0].tipo).toBe("indisponivel");
    if (cadeia.passos[0].tipo === "indisponivel") {
      expect(cadeia.passos[0].motivo).toMatch(/término real/);
    }
    expect(cadeia.passos[1]).toMatchObject({ tipo: "elo", operacao: { chave: f.chave }, gapNaoAtribuivel: null });
  });

  it("dependência inconsistente (aponta para operação sem resultado calculado): cadeia fica indisponível, nunca parcial apresentada como completa", () => {
    const f = resultadoOcorrencia("op-f", {
      dataInicioReal: "2026-01-08",
      dataFimReal: "2026-01-10",
      alocacoes: [alocacao("2026-01-08", "recurso-B")],
    });
    // "op-fantasma" nunca aparece em resultadosPorOcorrencia - dependência inconsistente.
    const dependencias: DependenciaOcorrencia[] = [{ predecessora: chave("op-fantasma"), sucessora: f.chave, tipo: "sequencia_roteiro" }];

    const resumo = chamarComCadeia({
      prazoInterno: "2026-01-08",
      resultadosPorOcorrencia: [f], // só f - "op-fantasma" ausente de propósito
      dependencias,
      chavesFinais: [f.chave],
      dataFimRealCenario: "2026-01-10",
    });

    const cadeia = resumo.diagnosticos[0].cadeiaObservada!;
    expect(cadeia.passos).toHaveLength(2);
    expect(cadeia.passos[0].tipo).toBe("indisponivel");
    if (cadeia.passos[0].tipo === "indisponivel") {
      expect(cadeia.passos[0].motivo).toMatch(/sem resultado calculado/);
    }
    expect(cadeia.passos[1]).toMatchObject({ tipo: "elo", operacao: { chave: f.chave }, gapNaoAtribuivel: null });
  });
});
