import { describe, expect, it } from "vitest";
import { avaliarPrevisaoComercialFlexivel } from "./avaliarPrevisaoComercialFlexivel";
import { construirDetalhamentoPorRecurso } from "./detalhamentoCapacidadePorRecurso";
import type { CapacidadeNormalRecurso, NecessidadeCapacidadeFlexivel } from "./necessidadeCapacidadeFlexivel";
import type { CapacidadeExtraDia, ElegibilidadeCapacidadeExtra } from "./capacidadeDia";
import type { Contratacao } from "./contratacao";

function gerarDatas(inicio: string, quantidade: number): string[] {
  const [ano, mes, dia] = inicio.split("-").map(Number);
  return Array.from({ length: quantidade }, (_, i) => new Date(Date.UTC(ano, mes - 1, dia + i)).toISOString().slice(0, 10));
}

function ehFimDeSemana(data: string): boolean {
  const [ano, mes, dia] = data.split("-").map(Number);
  const dow = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  return dow === 0 || dow === 6;
}

describe("construirDetalhamentoPorRecurso", () => {
  const HOLIDAY = "2026-10-12";
  const datasGrade = gerarDatas("2026-10-05", 20);
  const diasProdutivos = new Set(datasGrade.filter((d) => !ehFimDeSemana(d) && d !== HOLIDAY));

  const necessidadeAjustador: NecessidadeCapacidadeFlexivel = {
    empresaId: "e1",
    projetoId: "260011",
    projetoItemId: "item-1",
    chaveTrabalho: "op-ajustador",
    recursoOriginalId: "ajustador",
    recursosCompativeisPorPrioridade: [],
    horasNecessariasPadrao: 38,
    disponivelAPartirDe: "2026-10-08",
  };

  const necessidadeCnc: NecessidadeCapacidadeFlexivel = {
    empresaId: "e1",
    projetoId: "260011",
    projetoItemId: "item-2",
    chaveTrabalho: "op-cnc",
    recursoOriginalId: "cnc2500",
    recursosCompativeisPorPrioridade: ["cnc3000"],
    horasNecessariasPadrao: 4,
    disponivelAPartirDe: "2026-10-08",
  };

  const capacidadesNormais = new Map<string, CapacidadeNormalRecurso>([
    ["ajustador", { recursoId: "ajustador", capacidadeHorasMaquinaDia: 8.8, produtividade: 1 }],
    ["cnc2500", { recursoId: "cnc2500", capacidadeHorasMaquinaDia: 8.8, produtividade: 1 }],
    ["cnc3000", { recursoId: "cnc3000", capacidadeHorasMaquinaDia: 17.6, produtividade: 1 }],
  ]);

  const elegibilidade: ElegibilidadeCapacidadeExtra = { escopo: "qualquer_projeto_do_cenario" };

  const extraAjustador: CapacidadeExtraDia[] = [
    { recursoId: "ajustador", data: "2026-10-08", horasAdicionaisDisponiveis: 2, natureza: "hora_extra", elegibilidade, contratacaoId: "contrato-ajustador" },
    { recursoId: "ajustador", data: "2026-10-09", horasAdicionaisDisponiveis: 2, natureza: "hora_extra", elegibilidade, contratacaoId: "contrato-ajustador" },
    { recursoId: "ajustador", data: "2026-10-13", horasAdicionaisDisponiveis: 2, natureza: "hora_extra", elegibilidade, contratacaoId: "contrato-ajustador" },
    { recursoId: "ajustador", data: "2026-10-14", horasAdicionaisDisponiveis: 2, natureza: "hora_extra", elegibilidade, contratacaoId: "contrato-ajustador" },
    { recursoId: "ajustador", data: "2026-10-15", horasAdicionaisDisponiveis: 2, natureza: "hora_extra", elegibilidade, contratacaoId: "contrato-ajustador" },
  ];

  const extraCnc: CapacidadeExtraDia[] = [
    { recursoId: "cnc2500", data: "2026-10-08", horasAdicionaisDisponiveis: 2, natureza: "hora_extra", elegibilidade, contratacaoId: "contrato-cnc-2500" },
    { recursoId: "cnc3000", data: "2026-10-08", horasAdicionaisDisponiveis: 6, natureza: "hora_extra", elegibilidade, contratacaoId: "contrato-cnc-3000" },
  ];

  function contratacao(overrides: Partial<Contratacao> & { id: string }): Contratacao {
    return {
      tipo: "hora_extra",
      abrangencia: "por_hora_utilizada",
      valor: 10,
      moeda: "BRL",
      fornecedorOuContratado: "Interno",
      referenciaProposta: null,
      justificativa: "teste",
      datas: [],
      ...overrides,
    };
  }

  const contratacoes: Contratacao[] = [
    contratacao({ id: "contrato-ajustador", valor: 100 }),
    contratacao({ id: "contrato-cnc-2500", valor: 50 }),
    contratacao({ id: "contrato-cnc-3000", valor: 30 }),
  ];

  it("mostra, por recurso, horas normais/extras disponibilizadas/utilizadas/descartadas e custo - nunca só um total agregado", () => {
    const avaliacao = avaliarPrevisaoComercialFlexivel({
      dataSolicitadaCliente: "2026-10-13",
      compromissosConfirmados: [],
      necessidadesOrcamentoNovo: [necessidadeAjustador, necessidadeCnc],
      capacidadesNormais,
      capacidadeExtraAutorizada: [...extraAjustador, ...extraCnc],
      temporariosPorPrioridade: [],
      datasGrade,
      diasProdutivos,
    });

    const detalhamento = construirDetalhamentoPorRecurso({
      resultadosPorOp: avaliacao.resultadosPorOp,
      necessidades: [necessidadeAjustador, necessidadeCnc],
      capacidadeExtraAutorizada: [...extraAjustador, ...extraCnc],
      contratacoes,
    });

    const porId = new Map(detalhamento.map((d) => [d.recursoId, d]));

    // Ajustador: recurso ORIGINAL, usa boa parte da hora extra oferecida
    // (10h autorizadas, só uma fração necessária) - a diferença some com
    // motivo explícito, nunca silenciosa.
    const ajustador = porId.get("ajustador")!;
    expect(ajustador.papel).toBe("original");
    expect(ajustador.horasExtrasDisponibilizadas).toBe(10);
    expect(ajustador.horasExtrasUtilizadas).toBeGreaterThan(0);
    expect(ajustador.horasExtrasUtilizadas).toBeLessThan(10);
    expect(ajustador.horasExtrasDescartadas).toBeCloseTo(10 - ajustador.horasExtrasUtilizadas, 5);
    expect(ajustador.motivoDescarte).not.toBeNull();
    expect(ajustador.custoExtraEfetivo).toBeCloseTo(ajustador.horasExtrasUtilizadas * 100, 5);

    // CNC 2500: recurso ORIGINAL da necessidade CNC, mas a necessidade
    // inteira (4h) cabe em capacidade normal - hora extra oferecida
    // (2h) fica 100% descartada, com motivo, nunca "0h" sem explicação.
    const cnc2500 = porId.get("cnc2500")!;
    expect(cnc2500.papel).toBe("original");
    expect(cnc2500.horasExtrasDisponibilizadas).toBe(2);
    expect(cnc2500.horasExtrasUtilizadas).toBe(0);
    expect(cnc2500.horasExtrasDescartadas).toBe(2);
    expect(cnc2500.motivoDescarte).not.toBeNull();
    expect(cnc2500.custoExtraEfetivo).toBe(0);

    // CNC 3000: recurso COMPATÍVEL (nunca original de nenhuma
    // necessidade) - mesma história de sobra 100% descartada.
    const cnc3000 = porId.get("cnc3000")!;
    expect(cnc3000.papel).toBe("compativel");
    expect(cnc3000.horasExtrasDisponibilizadas).toBe(6);
    expect(cnc3000.horasExtrasUtilizadas).toBe(0);
    expect(cnc3000.horasExtrasDescartadas).toBe(6);
    expect(cnc3000.motivoDescarte).not.toBeNull();

    // Nenhuma capacidade normal é rotulada como extra, e vice-versa.
    expect(ajustador.horasNormaisUtilizadas).toBeGreaterThan(0);
    expect(cnc2500.horasNormaisUtilizadas).toBe(4); // as 4h da necessidade inteira, via capacidade normal.

    // Soma das horas extras utilizadas por recurso bate com o total agregado (capacidadeUtilizada.horaAdicionalHoras).
    const somaExtrasUtilizadas = detalhamento.reduce((s, d) => s + d.horasExtrasUtilizadas, 0);
    const totalAgregado = avaliacao.resultadosPorOp
      .flatMap((r) => r.resultado.alocacoes)
      .filter((a) => a.tipoCapacidade === "adicional")
      .reduce((s, a) => s + a.horasPadrao, 0);
    expect(somaExtrasUtilizadas).toBeCloseTo(totalAgregado, 5);

    // Soma dos custos por recurso bate com o custo adicional efetivo -
    // aqui só o Ajustador usou hora extra de verdade (CNC 2500/3000
    // ficaram 100% descartados, custo 0 cada).
    const somaCustos = detalhamento.reduce((s, d) => s + (d.custoExtraEfetivo ?? 0), 0);
    expect(somaCustos).toBeCloseTo(ajustador.horasExtrasUtilizadas * 100, 5);
  });

  it("recurso com 0h extras utilizadas aparece explicitamente com 0h - nunca omitido da lista", () => {
    const avaliacao = avaliarPrevisaoComercialFlexivel({
      dataSolicitadaCliente: "2026-10-13",
      compromissosConfirmados: [],
      necessidadesOrcamentoNovo: [necessidadeAjustador, necessidadeCnc],
      capacidadesNormais,
      capacidadeExtraAutorizada: [...extraAjustador, ...extraCnc],
      temporariosPorPrioridade: [],
      datasGrade,
      diasProdutivos,
    });

    const detalhamento = construirDetalhamentoPorRecurso({
      resultadosPorOp: avaliacao.resultadosPorOp,
      necessidades: [necessidadeAjustador, necessidadeCnc],
      capacidadeExtraAutorizada: [...extraAjustador, ...extraCnc],
      contratacoes,
    });

    expect(detalhamento.map((d) => d.recursoId).sort()).toEqual(["ajustador", "cnc2500", "cnc3000"]);
    const cnc2500 = detalhamento.find((d) => d.recursoId === "cnc2500")!;
    expect(cnc2500.horasExtrasUtilizadas).toBe(0);
  });

  it("capacidade normal nunca é apresentada como hora extra", () => {
    const avaliacao = avaliarPrevisaoComercialFlexivel({
      dataSolicitadaCliente: "2026-10-13",
      compromissosConfirmados: [],
      necessidadesOrcamentoNovo: [necessidadeCnc],
      capacidadesNormais,
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasGrade,
      diasProdutivos,
    });

    const detalhamento = construirDetalhamentoPorRecurso({
      resultadosPorOp: avaliacao.resultadosPorOp,
      necessidades: [necessidadeCnc],
      capacidadeExtraAutorizada: [],
      contratacoes: [],
    });

    const cnc2500 = detalhamento.find((d) => d.recursoId === "cnc2500")!;
    expect(cnc2500.horasNormaisUtilizadas).toBe(4);
    expect(cnc2500.horasExtrasUtilizadas).toBe(0);
    expect(cnc2500.horasExtrasDisponibilizadas).toBe(0);
    expect(cnc2500.horasExtrasDescartadas).toBe(0);
    expect(cnc2500.motivoDescarte).toBeNull();
  });

  // CORREÇÃO (achada em teste visual real, projeto 260011): a soma das
  // horas extras utilizadas por recurso divergia do total agregado
  // (capacidadeUtilizada.horaAdicionalHoras, montarPrevisaoComercialProjeto.ts)
  // sempre que produtividade != 1 - construirDetalhamentoPorRecurso
  // somava horasPadrao (unidade interna da rede de fluxo) em vez de
  // horasMaquina (a mesma unidade da agregada e de
  // CapacidadeExtraDia.horasAdicionaisDisponiveis). Os testes acima
  // usam produtividade=1 em todo recurso, onde as duas unidades
  // coincidem por acidente e o bug não aparece - por isso um teste
  // dedicado, isolado, com produtividade != 1.
  it("reconciliação: soma de horasExtrasUtilizadas por recurso bate com o total agregado quando produtividade != 1", () => {
    const necessidade: NecessidadeCapacidadeFlexivel = {
      empresaId: "e1",
      projetoId: "p1",
      projetoItemId: "item-1",
      chaveTrabalho: "op-1",
      recursoOriginalId: "recurso-lento",
      recursosCompativeisPorPrioridade: [],
      horasNecessariasPadrao: 30, // horas PADRÃO (produtividade-normalizadas) - não confundir com horas-máquina.
      disponivelAPartirDe: "2026-10-08",
    };
    const produtividade = 0.85; // recurso abaixo do padrão: precisa de MAIS horas-máquina que horas-padrão para o mesmo trabalho.
    const capacidadesNormais = new Map<string, CapacidadeNormalRecurso>([
      ["recurso-lento", { recursoId: "recurso-lento", capacidadeHorasMaquinaDia: 8, produtividade }],
    ]);
    const elegibilidade: ElegibilidadeCapacidadeExtra = { escopo: "qualquer_projeto_do_cenario" };
    const capacidadeExtraAutorizada: CapacidadeExtraDia[] = [
      { recursoId: "recurso-lento", data: "2026-10-08", horasAdicionaisDisponiveis: 10, natureza: "hora_extra", elegibilidade, contratacaoId: "contrato-1" },
    ];

    const avaliacao = avaliarPrevisaoComercialFlexivel({
      dataSolicitadaCliente: "2026-10-13",
      compromissosConfirmados: [],
      necessidadesOrcamentoNovo: [necessidade],
      capacidadesNormais,
      capacidadeExtraAutorizada,
      temporariosPorPrioridade: [],
      datasGrade,
      diasProdutivos,
    });

    const detalhamento = construirDetalhamentoPorRecurso({
      resultadosPorOp: avaliacao.resultadosPorOp,
      necessidades: [necessidade],
      capacidadeExtraAutorizada,
      contratacoes: [],
    });

    // Mesmo cálculo de calcularCapacidadeUtilizada (montarPrevisaoComercialProjeto.ts) - horasMaquina, nunca horasPadrao.
    const totalAgregadoHorasMaquina = avaliacao.resultadosPorOp
      .flatMap((r) => r.resultado.alocacoes)
      .filter((a) => a.tipoCapacidade === "adicional")
      .reduce((s, a) => s + a.horasMaquina, 0);

    const somaDetalhamento = detalhamento.reduce((s, d) => s + d.horasExtrasUtilizadas, 0);

    expect(totalAgregadoHorasMaquina).toBeGreaterThan(0);
    // A soma em horas-padrão teria dado um número DIFERENTE (prova de que o teste exercita o bug de unidade, não só coincide por acaso).
    const somaEmHorasPadraoTeriaDivergido = avaliacao.resultadosPorOp
      .flatMap((r) => r.resultado.alocacoes)
      .filter((a) => a.tipoCapacidade === "adicional")
      .reduce((s, a) => s + a.horasPadrao, 0);
    expect(somaEmHorasPadraoTeriaDivergido).not.toBeCloseTo(totalAgregadoHorasMaquina, 5);

    expect(somaDetalhamento).toBeCloseTo(totalAgregadoHorasMaquina, 5);
  });
});
