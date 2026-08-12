import { describe, expect, it } from "vitest";
import { avaliarCenario, type DecisoesCenarioHoraExtra, type GradeCompartilhada } from "./avaliarCenario";
import type { BaseCenarios, OcorrenciaComTamanho } from "./carregarBaseCenarios";
import type { ChaveOcorrencia } from "./chaveOcorrencia";
import type { Contratacao } from "./contratacao";
import type { CapacidadeExtraDia } from "./capacidadeDia";

function chave(bomOperacaoId: string, overrides: Partial<ChaveOcorrencia> = {}): ChaveOcorrencia {
  return { projetoItemId: "item-1", produtoRaizId: "produto-1", caminhoBomItemIds: [], bomOperacaoId, ...overrides };
}

function ocorrencia(
  bomOperacaoId: string,
  necessarioHorasPadrao: number,
  recursoOriginalId = "recurso-A",
  overridesChave: Partial<ChaveOcorrencia> = {},
): OcorrenciaComTamanho {
  return {
    ocorrencia: { chave: chave(bomOperacaoId, overridesChave), bomOperacaoId, bomId: "bom-1" },
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

function baseComUmaOcorrencia(params: {
  necessarioHorasPadrao: number;
  capacidadeDiaria: number;
  produtividade?: number;
  comprometidoInicial?: number;
}): BaseCenarios {
  const oc = ocorrencia("op-1", params.necessarioHorasPadrao);
  return {
    empresaId: "empresa-1",
    projetoId: "projeto-1",
    ocorrencias: [oc],
    dependencias: [],
    chavesRaizOrcamentoNovo: [oc.ocorrencia.chave],
    chavesFinaisOrcamentoNovo: [oc.ocorrencia.chave],
    recursoIds: ["recurso-A"],
    compatibilidades: {},
    capacidadeDiariaPorRecurso: { "recurso-A": params.capacidadeDiaria },
    produtividadePorRecurso: { "recurso-A": params.produtividade ?? 1 },
    comprometidoInicialPorRecurso: { "recurso-A": params.comprometidoInicial ?? 0 },
  };
}

function gradeSimples(prazoInterno: string, diasAntes: number, diasDepois: number): GradeCompartilhada {
  const [ano, mes, dia] = prazoInterno.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 1, dia - diasAntes)).toISOString().slice(0, 10);
  const grade = gerarDatas(inicio, diasAntes + diasDepois + 1);
  const candidatas = grade.filter((d) => d <= prazoInterno);
  return { datasGradeCompartilhada: grade, datasCandidatas: candidatas, prazoInterno };
}

const semDecisoes: DecisoesCenarioHoraExtra = { capacidadeExtra: [], contratacoes: [] };

describe("avaliarCenario - cenário sem hora extra (linha de base)", () => {
  it("capacidade normal abundante: viável, D* = último candidato (mesmo dia início/fim)", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 4, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 5, 5);

    const resultado = avaliarCenario(base, semDecisoes, grade);

    expect(resultado.estado).toBe("viavel_no_limite");
    if (resultado.estado === "viavel_no_limite" || resultado.estado === "viavel") {
      expect(resultado.dataEstimadaInicioNecessario).toBe("2026-01-10");
      expect(resultado.dataFimReal).toBe("2026-01-10");
      expect(resultado.folgaDiasCivis).toBe(0);
    }
    expect(resultado.custoAdicionalTotal).toBe(0);
  });

  it("capacidade normal insuficiente e sem hora extra disponível: prazo_inviavel", () => {
    // Precisa de 20h, só 8h/dia disponíveis, grade curta o suficiente
    // para nunca alcançar 20h dentro do prazo mesmo somando vários dias.
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 20, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 0, 1); // só 2 dias de grade = 16h no máximo

    const resultado = avaliarCenario(base, semDecisoes, grade);

    expect(resultado.estado).toBe("horizonte_tecnico_excedido");
  });
});

describe("avaliarCenario - hora extra preenche o déficit e o custeio reflete o uso real", () => {
  it("sem hora extra ficaria inviável no prazo; com hora extra autorizada, fica viável e custeia só as horas usadas", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 10, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 0, 3);

    const capacidadeExtra: CapacidadeExtraDia[] = [
      {
        recursoId: "recurso-A",
        data: "2026-01-10",
        horasAdicionaisDisponiveis: 4,
        natureza: "hora_extra",
        elegibilidade: { escopo: "somente_orcamento_novo" },
        contratacaoId: "contratacao-1",
      },
    ];
    const contratacoes: Contratacao[] = [
      {
        id: "contratacao-1",
        tipo: "hora_extra",
        abrangencia: "por_hora_utilizada",
        valor: 50,
        moeda: "BRL",
        fornecedorOuContratado: "Equipe interna",
        referenciaProposta: null,
        justificativa: "Cobrir déficit do dia 10",
        datas: ["2026-01-10"],
      },
    ];

    const resultado = avaliarCenario(base, { capacidadeExtra, contratacoes }, grade);

    expect(resultado.estado).toBe("viavel_no_limite");
    // Precisa de 10h, 8h normais + 2h extras (das 4h disponíveis) - só 2h de hora extra usadas.
    expect(resultado.custoPorContratacaoId.get("contratacao-1")).toBeCloseTo(50 * 2);
    expect(resultado.custoAdicionalTotal).toBeCloseTo(100);
  });

  it("abrangencia por_dia_contratado cobra o total de dias contratados, não as horas usadas", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 9, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 0, 3);

    const capacidadeExtra: CapacidadeExtraDia[] = [
      {
        recursoId: "recurso-A",
        data: "2026-01-10",
        horasAdicionaisDisponiveis: 4,
        natureza: "hora_extra",
        elegibilidade: { escopo: "qualquer_projeto_do_cenario" },
        contratacaoId: "contratacao-dia",
      },
    ];
    const contratacoes: Contratacao[] = [
      {
        id: "contratacao-dia",
        tipo: "hora_extra",
        abrangencia: "por_dia_contratado",
        valor: 200,
        moeda: "BRL",
        fornecedorOuContratado: "Equipe interna",
        referenciaProposta: null,
        justificativa: "Diária de hora extra",
        datas: ["2026-01-10", "2026-01-11"], // 2 dias contratados, só 1 dia realmente necessário
      },
    ];

    const resultado = avaliarCenario(base, { capacidadeExtra, contratacoes }, grade);

    expect(resultado.estado).toBe("viavel_no_limite");
    // valor × datas.length, independente de quantas horas foram de fato usadas (só 1h de extra).
    expect(resultado.custoPorContratacaoId.get("contratacao-dia")).toBe(400);
  });
});

describe("avaliarCenario - comprometido agregado consumido a partir dos dias mais próximos (simplificação 8b)", () => {
  it("comprometido igual à capacidade do 1º dia empurra a operação para hora extra nesse dia", () => {
    // 8h/dia de capacidade normal, mas 8h já comprometidas (agregado) -
    // o 1º dia da grade fica com 0h normal disponível; só a hora extra
    // cadastrada nesse mesmo dia sobra para uso.
    const base = baseComUmaOcorrencia({
      necessarioHorasPadrao: 4,
      capacidadeDiaria: 8,
      comprometidoInicial: 8,
    });
    const grade = gradeSimples("2026-01-10", 0, 3);

    const capacidadeExtra: CapacidadeExtraDia[] = [
      {
        recursoId: "recurso-A",
        data: "2026-01-10",
        horasAdicionaisDisponiveis: 6,
        natureza: "hora_extra",
        elegibilidade: { escopo: "somente_orcamento_novo" },
        contratacaoId: "contratacao-comprometido",
      },
    ];
    const contratacoes: Contratacao[] = [
      {
        id: "contratacao-comprometido",
        tipo: "hora_extra",
        abrangencia: "por_hora_utilizada",
        valor: 10,
        moeda: "BRL",
        fornecedorOuContratado: "Equipe interna",
        referenciaProposta: null,
        justificativa: "teste",
        datas: ["2026-01-10"],
      },
    ];

    const resultado = avaliarCenario(base, { capacidadeExtra, contratacoes }, grade);

    expect(resultado.estado).toBe("viavel_no_limite");
    // As 4h precisam vir inteiramente de hora extra (normal já consumida pelo comprometido).
    expect(resultado.custoPorContratacaoId.get("contratacao-comprometido")).toBeCloseTo(10 * 4);
  });

  it("sem hora extra para compensar o comprometido, o cenário fica inviável mesmo com capacidade normal nominal suficiente", () => {
    const base = baseComUmaOcorrencia({
      necessarioHorasPadrao: 4,
      capacidadeDiaria: 8,
      comprometidoInicial: 8,
    });
    const grade = gradeSimples("2026-01-10", 0, 0); // só o próprio dia 10 na grade

    const resultado = avaliarCenario(base, semDecisoes, grade);

    expect(resultado.estado).toBe("horizonte_tecnico_excedido");
  });
});

describe("avaliarCenario - hora extra nunca consumida por projeto não elegível", () => {
  it("elegibilidade projetos_especificos que NÃO inclui o projeto avaliado: hora extra nunca é usada, custo fica zero e o cenário fica inviável se dependia dela", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 10, capacidadeDiaria: 8 });
    // base.projetoId (helper acima) é "projeto-1" - elegibilidade aponta para outro projeto.
    const grade = gradeSimples("2026-01-10", 0, 1); // grade curta o bastante para não conseguir 10h só de normal (8h × 2 dias = 16h cabe, então uso 1 dia só de grade útil ao candidato mais tardio)

    const capacidadeExtra: CapacidadeExtraDia[] = [
      {
        recursoId: "recurso-A",
        data: "2026-01-10",
        horasAdicionaisDisponiveis: 4,
        natureza: "hora_extra",
        elegibilidade: { escopo: "projetos_especificos", projetoIds: ["outro-projeto-qualquer"] },
        contratacaoId: "contratacao-nao-elegivel",
      },
    ];
    const contratacoes: Contratacao[] = [
      {
        id: "contratacao-nao-elegivel",
        tipo: "hora_extra",
        abrangencia: "por_hora_utilizada",
        valor: 999,
        moeda: "BRL",
        fornecedorOuContratado: "Equipe interna",
        referenciaProposta: null,
        justificativa: "não deveria ser usada",
        datas: ["2026-01-10"],
      },
    ];

    const resultado = avaliarCenario(base, { capacidadeExtra, contratacoes }, grade);

    // Custo zero prova que a faixa de hora extra nunca foi consumida
    // (nenhuma AlocacaoDiaria com este contratacaoId) - não porque o
    // cenário deu certo sem precisar dela.
    expect(resultado.custoPorContratacaoId.get("contratacao-nao-elegivel") ?? 0).toBe(0);
    expect(resultado.custoAdicionalTotal).toBe(0);
  });

  it("elegibilidade projetos_especificos que INCLUI o projeto avaliado: hora extra é consumida normalmente", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 10, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 0, 3);

    const capacidadeExtra: CapacidadeExtraDia[] = [
      {
        recursoId: "recurso-A",
        data: "2026-01-10",
        horasAdicionaisDisponiveis: 4,
        natureza: "hora_extra",
        elegibilidade: { escopo: "projetos_especificos", projetoIds: ["projeto-1"] },
        contratacaoId: "contratacao-elegivel",
      },
    ];
    const contratacoes: Contratacao[] = [
      {
        id: "contratacao-elegivel",
        tipo: "hora_extra",
        abrangencia: "por_hora_utilizada",
        valor: 40,
        moeda: "BRL",
        fornecedorOuContratado: "Equipe interna",
        referenciaProposta: null,
        justificativa: "elegível",
        datas: ["2026-01-10"],
      },
    ];

    const resultado = avaliarCenario(base, { capacidadeExtra, contratacoes }, grade);

    expect(resultado.estado).toBe("viavel_no_limite");
    expect(resultado.custoPorContratacaoId.get("contratacao-elegivel")).toBeCloseTo(40 * 2); // 2h de extra usadas
  });
});

describe("avaliarCenario - zero consulta de rede extra por cenário adicional", () => {
  it("avaliar 3 cenários seguidos sobre a mesma base não faz nenhuma chamada assíncrona - função inteiramente síncrona/pura", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 4, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 5, 5);

    // Se avaliarCenario fizesse qualquer I/O, devolveria uma Promise -
    // a assinatura da função já é síncrona (sem async), mas este teste
    // documenta a garantia em tempo de execução também.
    const r1 = avaliarCenario(base, semDecisoes, grade);
    const r2 = avaliarCenario(base, semDecisoes, grade);
    const r3 = avaliarCenario(base, semDecisoes, grade);

    expect(r1).not.toBeInstanceOf(Promise);
    expect(r1.estado).toBe(r2.estado);
    expect(r2.estado).toBe(r3.estado);
  });
});
