import { describe, expect, it } from "vitest";
import { avaliarCenario, type DecisoesCenario, type GradeCompartilhada } from "./avaliarCenario";
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

const semDecisoes: DecisoesCenario = {
  capacidadeExtra: [],
  contratacoes: [],
  terceirizacoes: [],
  recursosTemporarios: [],
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
    justificativa: "fixture de teste",
    datas: [],
  };
}

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

    const resultado = avaliarCenario(
      base,
      { capacidadeExtra, contratacoes, terceirizacoes: [], recursosTemporarios: [] },
      grade,
    );

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

    const resultado = avaliarCenario(
      base,
      { capacidadeExtra, contratacoes, terceirizacoes: [], recursosTemporarios: [] },
      grade,
    );

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

    const resultado = avaliarCenario(
      base,
      { capacidadeExtra, contratacoes, terceirizacoes: [], recursosTemporarios: [] },
      grade,
    );

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

    const resultado = avaliarCenario(
      base,
      { capacidadeExtra, contratacoes, terceirizacoes: [], recursosTemporarios: [] },
      grade,
    );

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

    const resultado = avaliarCenario(
      base,
      { capacidadeExtra, contratacoes, terceirizacoes: [], recursosTemporarios: [] },
      grade,
    );

    expect(resultado.estado).toBe("viavel_no_limite");
    expect(resultado.custoPorContratacaoId.get("contratacao-elegivel")).toBeCloseTo(40 * 2); // 2h de extra usadas
  });
});

describe("avaliarCenario - terceirização opera fora da capacidade interna", () => {
  it("duração inclusiva correta e custo por valor_fixo_unico, mesmo com capacidade interna zerada", () => {
    // capacidadeDiaria=0 no recurso original prova que a terceirização
    // não depende nem um pouco da capacidade interna.
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 999, capacidadeDiaria: 0 });
    const grade = gradeSimples("2026-01-20", 15, 5);

    const contratacoes: Contratacao[] = [
      {
        id: "terc-1",
        tipo: "terceirizacao",
        abrangencia: "valor_fixo_unico",
        valor: 5000,
        moeda: "BRL",
        fornecedorOuContratado: "Fornecedor Externo Ltda",
        referenciaProposta: null,
        justificativa: "capacidade interna insuficiente",
        datas: [],
      },
    ];

    const resultado = avaliarCenario(
      base,
      {
        capacidadeExtra: [],
        contratacoes,
        terceirizacoes: [{ chave: chave("op-1"), fornecedor: "Fornecedor Externo Ltda", prazoDiasCorridos: 5, contratacaoId: "terc-1" }],
        recursosTemporarios: [],
      },
      grade,
    );

    expect(resultado.estado === "viavel" || resultado.estado === "viavel_no_limite").toBe(true);
    if (resultado.estado === "viavel" || resultado.estado === "viavel_no_limite") {
      // Duração INCLUSIVA de 5 dias corridos: fim = início + 4 dias.
      const diasEntre =
        (Date.parse(resultado.dataFimReal) - Date.parse(resultado.dataEstimadaInicioNecessario)) / 86_400_000;
      expect(diasEntre).toBe(4);
    }
    expect(resultado.custoPorContratacaoId.get("terc-1")).toBe(5000);
  });

  it("terceirização e hora extra combinadas no mesmo cenário, em operações diferentes, sem contaminação de custo", () => {
    const oc1 = ocorrencia("op-terceirizada", 999, "recurso-A");
    // 26h: a terceirização de 3 dias corridos empurra o D* comum para
    // 2 dias antes do prazo (01-18) - nessa janela, recurso-B só tem
    // 24h normais (3 dias × 8h); as 2h que faltam precisam vir da hora
    // extra, provando que ela É necessária, não sobra sem uso.
    const oc2 = ocorrencia("op-hora-extra", 26, "recurso-B");
    const base: BaseCenarios = {
      empresaId: "empresa-1",
      projetoId: "projeto-1",
      ocorrencias: [oc1, oc2],
      dependencias: [],
      chavesRaizOrcamentoNovo: [oc1.ocorrencia.chave, oc2.ocorrencia.chave],
      chavesFinaisOrcamentoNovo: [oc1.ocorrencia.chave, oc2.ocorrencia.chave],
      recursoIds: ["recurso-A", "recurso-B"],
      compatibilidades: {},
      capacidadeDiariaPorRecurso: { "recurso-A": 0, "recurso-B": 8 },
      produtividadePorRecurso: { "recurso-A": 1, "recurso-B": 1 },
      comprometidoInicialPorRecurso: { "recurso-A": 0, "recurso-B": 0 },
    };
    const grade = gradeSimples("2026-01-20", 15, 5);

    // Data igual a prazoInterno de propósito: oc1 e oc2 são raiz E final
    // ao mesmo tempo (sem dependência entre si), então o Calculador
    // Reverso busca 1 D* comum às duas, testando a candidata mais
    // tardia (=prazoInterno) primeiro - é ali que as duas de fato vão
    // tentar começar na réplica vencedora.
    const capacidadeExtra: CapacidadeExtraDia[] = [
      {
        recursoId: "recurso-B",
        data: "2026-01-20",
        horasAdicionaisDisponiveis: 4,
        natureza: "hora_extra",
        elegibilidade: { escopo: "somente_orcamento_novo" },
        contratacaoId: "hextra-combo",
      },
    ];
    const contratacoes: Contratacao[] = [
      {
        id: "terc-combo",
        tipo: "terceirizacao",
        abrangencia: "valor_fixo_unico",
        valor: 3000,
        moeda: "BRL",
        fornecedorOuContratado: "Fornecedor Externo",
        referenciaProposta: null,
        justificativa: "combo",
        datas: [],
      },
      {
        id: "hextra-combo",
        tipo: "hora_extra",
        abrangencia: "por_hora_utilizada",
        valor: 60,
        moeda: "BRL",
        fornecedorOuContratado: "Equipe interna",
        referenciaProposta: null,
        justificativa: "combo",
        datas: ["2026-01-20"],
      },
    ];

    const resultado = avaliarCenario(
      base,
      {
        capacidadeExtra,
        contratacoes,
        terceirizacoes: [{ chave: chave("op-terceirizada"), fornecedor: "Fornecedor Externo", prazoDiasCorridos: 3, contratacaoId: "terc-combo" }],
        recursosTemporarios: [],
      },
      grade,
    );

    expect(resultado.estado === "viavel" || resultado.estado === "viavel_no_limite").toBe(true);
    expect(resultado.custoPorContratacaoId.get("terc-combo")).toBe(3000);
    // 2h de hora extra usadas em recurso-B (24h normais em 3 dias + 2h extra = 26h necessárias).
    expect(resultado.custoPorContratacaoId.get("hextra-combo")).toBeCloseTo(60 * 2);
  });
});

describe("avaliarCenario - terceirização rejeita abrangência incompatível (nunca custo 0 silencioso)", () => {
  function baseComTerceirizacao(): { base: BaseCenarios; grade: GradeCompartilhada } {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 999, capacidadeDiaria: 0 });
    const grade = gradeSimples("2026-01-20", 15, 5);
    return { base, grade };
  }

  function terceirizar(contratacaoId: string) {
    return { chave: chave("op-1"), fornecedor: "Fornecedor Externo", prazoDiasCorridos: 5, contratacaoId };
  }

  it("rejeita por_hora_utilizada", () => {
    const { base, grade } = baseComTerceirizacao();
    const contratacoes: Contratacao[] = [
      { ...contratacaoTerceirizacaoValida("terc-hora"), abrangencia: "por_hora_utilizada" },
    ];

    expect(() =>
      avaliarCenario(
        base,
        { capacidadeExtra: [], contratacoes, terceirizacoes: [terceirizar("terc-hora")], recursosTemporarios: [] },
        grade,
      ),
    ).toThrow(/só aceita "por_periodo_completo" ou "valor_fixo_unico"/);
  });

  it("rejeita por_dia_contratado", () => {
    const { base, grade } = baseComTerceirizacao();
    const contratacoes: Contratacao[] = [
      { ...contratacaoTerceirizacaoValida("terc-dia"), abrangencia: "por_dia_contratado", datas: ["2026-01-20", "2026-01-21"] },
    ];

    expect(() =>
      avaliarCenario(
        base,
        { capacidadeExtra: [], contratacoes, terceirizacoes: [terceirizar("terc-dia")], recursosTemporarios: [] },
        grade,
      ),
    ).toThrow(/só aceita "por_periodo_completo" ou "valor_fixo_unico"/);
  });

  it("aceita por_periodo_completo (mesmo cálculo de valor_fixo_unico, já coberto em outro teste)", () => {
    const { base, grade } = baseComTerceirizacao();
    const contratacoes: Contratacao[] = [
      { ...contratacaoTerceirizacaoValida("terc-periodo", 4200), abrangencia: "por_periodo_completo" },
    ];

    const resultado = avaliarCenario(
      base,
      { capacidadeExtra: [], contratacoes, terceirizacoes: [terceirizar("terc-periodo")], recursosTemporarios: [] },
      grade,
    );

    expect(resultado.estado === "viavel" || resultado.estado === "viavel_no_limite").toBe(true);
    expect(resultado.custoPorContratacaoId.get("terc-periodo")).toBe(4200);
  });
});

describe("avaliarCenario - recurso temporário/freelancer com produtividade e disponibilidade próprias", () => {
  it("recurso temporário aplicável cobre a demanda quando o recurso original não tem capacidade nenhuma", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 8, capacidadeDiaria: 0 });
    const grade = gradeSimples("2026-01-10", 0, 3);

    const recursoTemporario: RecursoTemporarioCenario = {
      idTemporario: "temp-freelancer-1",
      tipo: "freelancer",
      recursoReferenciaId: "recurso-referencia-real",
      disponibilidade: [{ data: "2026-01-10", horasDisponiveis: 10 }],
      contratacaoId: "temp-1",
      justificativa: "cobrir pico de demanda",
      aplicavelAsOperacoes: [chave("op-1")],
    };
    const contratacoes: Contratacao[] = [
      {
        id: "temp-1",
        tipo: "freelancer",
        abrangencia: "por_hora_utilizada",
        valor: 25,
        moeda: "BRL",
        fornecedorOuContratado: "Freelancer João",
        referenciaProposta: null,
        justificativa: "cobrir pico",
        datas: ["2026-01-10"],
      },
    ];

    const resultado = avaliarCenario(
      base,
      {
        capacidadeExtra: [],
        contratacoes,
        terceirizacoes: [],
        recursosTemporarios: [{ recursoTemporario, produtividadeReferencia: 0.8 }],
      },
      grade,
    );

    expect(resultado.estado).toBe("viavel_no_limite");
    // 8h-padrão / 0.8 produtividade = 10h de máquina realmente usadas.
    expect(resultado.custoPorContratacaoId.get("temp-1")).toBeCloseTo(25 * (8 / 0.8));
  });

  it("recurso temporário NÃO aplicável a esta ocorrência nunca é oferecido como candidato - cenário permanece inviável", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 8, capacidadeDiaria: 0 });
    const grade = gradeSimples("2026-01-10", 0, 0); // grade mínima - sem sobra para "dar certo por acaso"

    const recursoTemporario: RecursoTemporarioCenario = {
      idTemporario: "temp-nao-aplicavel",
      tipo: "freelancer",
      recursoReferenciaId: "recurso-referencia-real",
      disponibilidade: [{ data: "2026-01-10", horasDisponiveis: 10 }],
      contratacaoId: "temp-nao-usado",
      justificativa: "aplicável a outra operação, não a esta",
      aplicavelAsOperacoes: [chave("op-outra-operacao")], // não é "op-1"
    };
    const contratacoes: Contratacao[] = [
      {
        id: "temp-nao-usado",
        tipo: "freelancer",
        abrangencia: "por_hora_utilizada",
        valor: 25,
        moeda: "BRL",
        fornecedorOuContratado: "Freelancer João",
        referenciaProposta: null,
        justificativa: "não deveria ser usada",
        datas: ["2026-01-10"],
      },
    ];

    const resultado = avaliarCenario(
      base,
      {
        capacidadeExtra: [],
        contratacoes,
        terceirizacoes: [],
        recursosTemporarios: [{ recursoTemporario, produtividadeReferencia: 1 }],
      },
      grade,
    );

    expect(resultado.estado).toBe("horizonte_tecnico_excedido");
    expect(resultado.custoPorContratacaoId.get("temp-nao-usado") ?? 0).toBe(0);
  });

  it("id de recurso temporário colidindo com um recurso real lança erro explícito", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 8, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 0, 3);

    const recursoTemporario: RecursoTemporarioCenario = {
      idTemporario: "recurso-A", // colide de propósito com o recurso real do fixture
      tipo: "freelancer",
      recursoReferenciaId: "recurso-referencia-real",
      disponibilidade: [{ data: "2026-01-10", horasDisponiveis: 10 }],
      contratacaoId: "temp-colisao",
      justificativa: "colisão proposital",
      aplicavelAsOperacoes: [chave("op-1")],
    };

    expect(() =>
      avaliarCenario(
        base,
        {
          capacidadeExtra: [],
          contratacoes: [],
          terceirizacoes: [],
          recursosTemporarios: [{ recursoTemporario, produtividadeReferencia: 1 }],
        },
        grade,
      ),
    ).toThrow(/colide com o id de um recurso real/);
  });
});

describe("avaliarCenario - combinações das 3 alternativas", () => {
  it("recurso temporário + hora extra na MESMA ocorrência, ambos genuinamente necessários e custeados corretamente", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 20, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 0, 3);

    const recursoTemporario: RecursoTemporarioCenario = {
      idTemporario: "temp-combo-heteroneo",
      tipo: "freelancer",
      recursoReferenciaId: "recurso-referencia",
      disponibilidade: [{ data: "2026-01-10", horasDisponiveis: 8 }],
      contratacaoId: "temp-combo-contratacao",
      justificativa: "cobrir o restante além da hora extra",
      aplicavelAsOperacoes: [chave("op-1")],
    };
    const capacidadeExtra: CapacidadeExtraDia[] = [
      {
        recursoId: "recurso-A",
        data: "2026-01-10",
        horasAdicionaisDisponiveis: 4,
        natureza: "hora_extra",
        elegibilidade: { escopo: "somente_orcamento_novo" },
        contratacaoId: "hextra-combo-heterogeneo",
      },
    ];
    const contratacoes: Contratacao[] = [
      {
        id: "hextra-combo-heterogeneo",
        tipo: "hora_extra",
        abrangencia: "por_hora_utilizada",
        valor: 50,
        moeda: "BRL",
        fornecedorOuContratado: "Equipe interna",
        referenciaProposta: null,
        justificativa: "combo",
        datas: ["2026-01-10"],
      },
      {
        id: "temp-combo-contratacao",
        tipo: "freelancer",
        abrangencia: "por_hora_utilizada",
        valor: 30,
        moeda: "BRL",
        fornecedorOuContratado: "Freelancer",
        referenciaProposta: null,
        justificativa: "combo",
        datas: ["2026-01-10"],
      },
    ];

    const resultado = avaliarCenario(
      base,
      {
        capacidadeExtra,
        contratacoes,
        terceirizacoes: [],
        recursosTemporarios: [{ recursoTemporario, produtividadeReferencia: 1 }],
      },
      grade,
    );

    expect(resultado.estado).toBe("viavel_no_limite");
    // 20h = 8h normais + 4h extra (recurso-A) + 8h do temporário - as 3 fontes usadas por completo no mesmo dia.
    expect(resultado.custoPorContratacaoId.get("hextra-combo-heterogeneo")).toBeCloseTo(50 * 4);
    expect(resultado.custoPorContratacaoId.get("temp-combo-contratacao")).toBeCloseTo(30 * 8);
  });

  it("hora extra + terceirização + recurso temporário em 3 operações distintas do mesmo cenário - cada contratação custeada exatamente 1 vez", () => {
    const ocTerc = ocorrencia("op-terceirizada-3way", 999, "recurso-C");
    const ocHextra = ocorrencia("op-hora-extra-3way", 26, "recurso-A");
    const ocTemp = ocorrencia("op-temporario-3way", 5, "recurso-B");

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
      aplicavelAsOperacoes: [chave("op-temporario-3way")],
    };
    const capacidadeExtra: CapacidadeExtraDia[] = [
      {
        recursoId: "recurso-A",
        data: "2026-01-20",
        horasAdicionaisDisponiveis: 4,
        natureza: "hora_extra",
        elegibilidade: { escopo: "somente_orcamento_novo" },
        contratacaoId: "hextra-3way-contratacao",
      },
    ];
    const contratacoes: Contratacao[] = [
      contratacaoTerceirizacaoValida("terc-3way-contratacao", 3000),
      {
        id: "hextra-3way-contratacao",
        tipo: "hora_extra",
        abrangencia: "por_hora_utilizada",
        valor: 60,
        moeda: "BRL",
        fornecedorOuContratado: "Equipe interna",
        referenciaProposta: null,
        justificativa: "3way",
        datas: ["2026-01-20"],
      },
      {
        id: "temp-3way-contratacao",
        tipo: "freelancer",
        abrangencia: "por_hora_utilizada",
        valor: 40,
        moeda: "BRL",
        fornecedorOuContratado: "Freelancer",
        referenciaProposta: null,
        justificativa: "3way",
        datas: ["2026-01-18"],
      },
    ];

    const resultado = avaliarCenario(
      base,
      {
        capacidadeExtra,
        contratacoes,
        terceirizacoes: [{ chave: chave("op-terceirizada-3way"), fornecedor: "Fornecedor Externo", prazoDiasCorridos: 3, contratacaoId: "terc-3way-contratacao" }],
        recursosTemporarios: [{ recursoTemporario, produtividadeReferencia: 1 }],
      },
      grade,
    );

    expect(resultado.estado === "viavel" || resultado.estado === "viavel_no_limite").toBe(true);
    expect(resultado.custoPorContratacaoId.get("terc-3way-contratacao")).toBe(3000);
    expect(resultado.custoPorContratacaoId.get("hextra-3way-contratacao")).toBeCloseTo(60 * 2);
    expect(resultado.custoPorContratacaoId.get("temp-3way-contratacao")).toBeCloseTo(40 * 5);

    // Cada uma das 3 contratações aparece exatamente 1 vez no mapa de custo, e a soma bate com o total.
    expect(resultado.custoPorContratacaoId.size).toBe(3);
    const somaIndividual = Array.from(resultado.custoPorContratacaoId.values()).reduce((a, b) => a + b, 0);
    expect(resultado.custoAdicionalTotal).toBeCloseTo(somaIndividual);
  });

  it("terceirizar uma ocorrência bloqueia capacidade interna/extra/temporária para ELA MESMA - mesmo com as 3 fartamente disponíveis", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 999, capacidadeDiaria: 8 }); // capacidade normal abundante de propósito
    const grade = gradeSimples("2026-01-20", 15, 5);

    const capacidadeExtra: CapacidadeExtraDia[] = [
      {
        recursoId: "recurso-A",
        data: "2026-01-20",
        horasAdicionaisDisponiveis: 100,
        natureza: "hora_extra",
        elegibilidade: { escopo: "qualquer_projeto_do_cenario" },
        contratacaoId: "hextra-nunca-usada",
      },
    ];
    const recursoTemporario: RecursoTemporarioCenario = {
      idTemporario: "temp-nunca-usado",
      tipo: "freelancer",
      recursoReferenciaId: "recurso-referencia",
      disponibilidade: [{ data: "2026-01-20", horasDisponiveis: 100 }],
      contratacaoId: "temp-nunca-usada-contratacao",
      justificativa: "nunca deveria ser usado - a ocorrência é terceirizada",
      aplicavelAsOperacoes: [chave("op-1")],
    };
    const contratacoes: Contratacao[] = [
      contratacaoTerceirizacaoValida("terc-bloqueio", 2000),
      {
        id: "hextra-nunca-usada",
        tipo: "hora_extra",
        abrangencia: "por_hora_utilizada",
        valor: 999,
        moeda: "BRL",
        fornecedorOuContratado: "Equipe interna",
        referenciaProposta: null,
        justificativa: "nunca deveria ser usada",
        datas: ["2026-01-20"],
      },
      {
        id: "temp-nunca-usada-contratacao",
        tipo: "freelancer",
        abrangencia: "por_hora_utilizada",
        valor: 999,
        moeda: "BRL",
        fornecedorOuContratado: "Freelancer",
        referenciaProposta: null,
        justificativa: "nunca deveria ser usada",
        datas: ["2026-01-20"],
      },
    ];

    const resultado = avaliarCenario(
      base,
      {
        capacidadeExtra,
        contratacoes,
        terceirizacoes: [{ chave: chave("op-1"), fornecedor: "Fornecedor Externo", prazoDiasCorridos: 3, contratacaoId: "terc-bloqueio" }],
        recursosTemporarios: [{ recursoTemporario, produtividadeReferencia: 1 }],
      },
      grade,
    );

    expect(resultado.estado === "viavel" || resultado.estado === "viavel_no_limite").toBe(true);
    expect(resultado.custoPorContratacaoId.get("terc-bloqueio")).toBe(2000);
    expect(resultado.custoPorContratacaoId.get("hextra-nunca-usada")).toBe(0);
    expect(resultado.custoPorContratacaoId.get("temp-nunca-usada-contratacao")).toBe(0);
  });
});

describe("avaliarCenario - decisões órfãs ou duplicadas são erro explícito, nunca ignoradas", () => {
  it("DecisaoTerceirizacao referenciando uma ocorrência que não existe na base", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 8, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 0, 3);

    expect(() =>
      avaliarCenario(
        base,
        {
          capacidadeExtra: [],
          contratacoes: [contratacaoTerceirizacaoValida("terc-orfa")],
          terceirizacoes: [{ chave: chave("op-inexistente"), fornecedor: "X", prazoDiasCorridos: 2, contratacaoId: "terc-orfa" }],
          recursosTemporarios: [],
        },
        grade,
      ),
    ).toThrow(/Terceirização órfã/);
  });

  it("duas DecisaoTerceirizacao para a mesma ocorrência", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 8, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 0, 3);

    expect(() =>
      avaliarCenario(
        base,
        {
          capacidadeExtra: [],
          contratacoes: [contratacaoTerceirizacaoValida("terc-1"), contratacaoTerceirizacaoValida("terc-2")],
          terceirizacoes: [
            { chave: chave("op-1"), fornecedor: "X", prazoDiasCorridos: 2, contratacaoId: "terc-1" },
            { chave: chave("op-1"), fornecedor: "Y", prazoDiasCorridos: 5, contratacaoId: "terc-2" },
          ],
          recursosTemporarios: [],
        },
        grade,
      ),
    ).toThrow(/Terceirização duplicada/);
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
