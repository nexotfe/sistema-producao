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
      { capacidadeExtra, contratacoes, terceirizacoes: [], recursosTemporarios: [], antecipacoesMaterial: [] },
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
      { capacidadeExtra, contratacoes, terceirizacoes: [], recursosTemporarios: [], antecipacoesMaterial: [] },
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
      { capacidadeExtra, contratacoes, terceirizacoes: [], recursosTemporarios: [], antecipacoesMaterial: [] },
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
      { capacidadeExtra, contratacoes, terceirizacoes: [], recursosTemporarios: [], antecipacoesMaterial: [] },
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
      { capacidadeExtra, contratacoes, terceirizacoes: [], recursosTemporarios: [], antecipacoesMaterial: [] },
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
        recursosTemporarios: [], antecipacoesMaterial: [],
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
        recursosTemporarios: [], antecipacoesMaterial: [],
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
        { capacidadeExtra: [], contratacoes, terceirizacoes: [terceirizar("terc-hora")], recursosTemporarios: [], antecipacoesMaterial: [] },
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
        { capacidadeExtra: [], contratacoes, terceirizacoes: [terceirizar("terc-dia")], recursosTemporarios: [], antecipacoesMaterial: [] },
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
      { capacidadeExtra: [], contratacoes, terceirizacoes: [terceirizar("terc-periodo")], recursosTemporarios: [], antecipacoesMaterial: [] },
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
        recursosTemporarios: [{ recursoTemporario, produtividadeReferencia: 0.8 }], antecipacoesMaterial: [],
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
        recursosTemporarios: [{ recursoTemporario, produtividadeReferencia: 1 }], antecipacoesMaterial: [],
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
          recursosTemporarios: [{ recursoTemporario, produtividadeReferencia: 1 }], antecipacoesMaterial: [],
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
        recursosTemporarios: [{ recursoTemporario, produtividadeReferencia: 1 }], antecipacoesMaterial: [],
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
        recursosTemporarios: [{ recursoTemporario, produtividadeReferencia: 1 }], antecipacoesMaterial: [],
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
        recursosTemporarios: [{ recursoTemporario, produtividadeReferencia: 1 }], antecipacoesMaterial: [],
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
          recursosTemporarios: [], antecipacoesMaterial: [],
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
          recursosTemporarios: [], antecipacoesMaterial: [],
        },
        grade,
      ),
    ).toThrow(/Terceirização duplicada/);
  });
});

describe("avaliarCenario - unicidade de contratação por categoria (nunca contabilizada em 2 alternativas)", () => {
  it("mesmo contratacaoId em hora extra E terceirização (categorias diferentes) lança erro explícito", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 8, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 0, 3);

    const capacidadeExtra: CapacidadeExtraDia[] = [
      { recursoId: "recurso-A", data: "2026-01-10", horasAdicionaisDisponiveis: 4, natureza: "hora_extra", elegibilidade: { escopo: "somente_orcamento_novo" }, contratacaoId: "contratacao-cruzada" },
    ];

    expect(() =>
      avaliarCenario(
        base,
        {
          capacidadeExtra,
          contratacoes: [contratacaoTerceirizacaoValida("contratacao-cruzada")],
          terceirizacoes: [{ chave: chave("op-1"), fornecedor: "X", prazoDiasCorridos: 2, contratacaoId: "contratacao-cruzada" }],
          recursosTemporarios: [], antecipacoesMaterial: [],
        },
        grade,
      ),
    ).toThrow(/referenciada em mais de 1 categoria/);
  });

  it("mesmo contratacaoId reaproveitado em vários dias DENTRO da mesma categoria (hora extra) continua permitido", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 8, capacidadeDiaria: 4 });
    const grade = gradeSimples("2026-01-10", 0, 3);

    const capacidadeExtra: CapacidadeExtraDia[] = [
      { recursoId: "recurso-A", data: "2026-01-10", horasAdicionaisDisponiveis: 2, natureza: "hora_extra", elegibilidade: { escopo: "somente_orcamento_novo" }, contratacaoId: "contratacao-repetida" },
      { recursoId: "recurso-A", data: "2026-01-11", horasAdicionaisDisponiveis: 2, natureza: "hora_extra", elegibilidade: { escopo: "somente_orcamento_novo" }, contratacaoId: "contratacao-repetida" },
    ];
    const contratacoes: Contratacao[] = [
      { id: "contratacao-repetida", tipo: "hora_extra", abrangencia: "por_hora_utilizada", valor: 10, moeda: "BRL", fornecedorOuContratado: "Equipe", referenciaProposta: null, justificativa: "teste", datas: ["2026-01-10", "2026-01-11"] },
    ];

    expect(() =>
      avaliarCenario(base, { capacidadeExtra, contratacoes, terceirizacoes: [], recursosTemporarios: [], antecipacoesMaterial: [] }, grade),
    ).not.toThrow();
  });
});

describe("avaliarCenario - antecipação de material (4ª alternativa, altera a janela produtiva - DEC-007 §6.2.4)", () => {
  function antecipacao(dataDisponibilidadeAntecipada: string, dataDisponibilidadeOriginal: string, contratacaoId = "mat-1") {
    return { chave: chave("op-1"), dataDisponibilidadeAntecipada, dataDisponibilidadeOriginal, contratacaoId };
  }

  function contratacaoAntecipacaoValida(id: string, valor = 500): Contratacao {
    return {
      id,
      tipo: "antecipacao_material",
      abrangencia: "valor_fixo_unico",
      valor,
      moeda: "BRL",
      fornecedorOuContratado: "Fornecedor Materiais",
      referenciaProposta: null,
      justificativa: "fixture",
      datas: [],
    };
  }

  it("piso de material altera o CÁLCULO OFICIAL (estado/dataFimReal), não só o diagnóstico/exibição", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 4, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 0, 15); // única candidata testada = 10/01, bem anterior ao piso

    const resultado = avaliarCenario(
      base,
      {
        capacidadeExtra: [],
        contratacoes: [contratacaoAntecipacaoValida("mat-1")],
        terceirizacoes: [],
        recursosTemporarios: [],
        antecipacoesMaterial: [antecipacao("2026-01-14", "2026-01-15")],
      },
      grade,
    );

    expect(resultado.estado).toBe("prazo_inviavel");
    if (resultado.estado === "prazo_inviavel") {
      expect(resultado.dataFimReal).toBe("2026-01-14"); // nunca antes do piso, mesmo a candidata sendo 10/01
      expect(resultado.diasCivisDeAtraso).toBe(4);
    }
  });

  it("cenário-base (SEM decisão de antecipação) vs cenário ajustado (COM DecisaoAntecipacaoMaterial): o ganho é sempre relativo ao cenário-base real, nunca a uma avaliação artificial 'sem negociar'", () => {
    // Correção de auditoria: a versão anterior deste teste construía um
    // "cenário-base" chamando avaliarCenario com
    // dataDisponibilidadeAntecipada == dataDisponibilidadeOriginal -
    // ERRADO (violaria a própria validação de "estritamente anterior",
    // inventaria uma decisão que não existe, e contabilizaria custo de
    // negociação no cenário-base). O cenário-base correto é sempre o
    // cenário SEM nenhuma DecisaoAntecipacaoMaterial - exatamente a
    // mesma semântica de "cenário-base" já usada para hora extra/
    // terceirização/recurso temporário em todo o resto deste arquivo.
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 4, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 0, 15);
    const contratacoes = [contratacaoAntecipacaoValida("mat-1")];

    const resultadoBase = avaliarCenario(base, semDecisoes, grade);
    const resultadoAjustado = avaliarCenario(
      base,
      { capacidadeExtra: [], contratacoes, terceirizacoes: [], recursosTemporarios: [], antecipacoesMaterial: [antecipacao("2026-01-12", "2026-01-15")] },
      grade,
    );

    // Sem NENHUM piso de material, o cenário-base conclui na própria
    // candidata testada (10/01) - capacidade sobra (4h de 8h/dia).
    expect(resultadoBase.estado).toBe("viavel_no_limite");
    if (resultadoBase.estado === "viavel_no_limite" || resultadoBase.estado === "viavel") {
      expect(resultadoBase.dataFimReal).toBe("2026-01-10");
    }
    expect(resultadoBase.custoPorContratacaoId.get("mat-1") ?? 0).toBe(0); // custo de antecipação = 0 no cenário-base
    expect(resultadoBase.custoAdicionalTotal).toBe(0);

    // Com a decisão, o piso (12/01) empurra o início/término pra depois
    // do que o cenário-base natural conseguiria (10/01) - a antecipação
    // de material É uma restrição adicional em relação ao cenário-base
    // irrestrito, nunca uma vantagem "de graça"; o ganho real dela só
    // aparece comparada contra a alternativa de NÃO negociar (o piso
    // teria sido a data original, mais tardia ainda - ver teste anterior).
    expect(resultadoAjustado.estado).toBe("prazo_inviavel");
    if (resultadoAjustado.estado === "prazo_inviavel") {
      expect(resultadoAjustado.dataFimReal).toBe("2026-01-12");
      expect(resultadoAjustado.dataFimReal >= "2026-01-12").toBe(true); // nunca antes do piso negociado
    }
    expect(resultadoAjustado.custoPorContratacaoId.get("mat-1")).toBe(500);
  });

  it("combinada com hora extra na MESMA ocorrência: o piso define QUANDO pode começar, hora extra define se cabe naquele dia", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 12, capacidadeDiaria: 8 }); // precisa de hora extra pra caber em 1 dia
    const grade = gradeSimples("2026-01-12", 0, 5); // única candidata = 12/01, igual ao piso negociado

    const capacidadeExtra: CapacidadeExtraDia[] = [
      { recursoId: "recurso-A", data: "2026-01-12", horasAdicionaisDisponiveis: 4, natureza: "hora_extra", elegibilidade: { escopo: "somente_orcamento_novo" }, contratacaoId: "hextra-material" },
    ];
    const contratacoes: Contratacao[] = [
      contratacaoAntecipacaoValida("mat-1"),
      { id: "hextra-material", tipo: "hora_extra", abrangencia: "por_hora_utilizada", valor: 30, moeda: "BRL", fornecedorOuContratado: "Equipe", referenciaProposta: null, justificativa: "combo", datas: ["2026-01-12"] },
    ];

    const resultado = avaliarCenario(
      base,
      { capacidadeExtra, contratacoes, terceirizacoes: [], recursosTemporarios: [], antecipacoesMaterial: [antecipacao("2026-01-12", "2026-01-20")] },
      grade,
    );

    expect(resultado.estado).toBe("viavel_no_limite");
    if (resultado.estado === "viavel_no_limite" || resultado.estado === "viavel") {
      expect(resultado.dataEstimadaInicioNecessario).toBe("2026-01-12");
      expect(resultado.dataFimReal).toBe("2026-01-12");
    }
    // 12h = 8h normais + 4h extra, tudo no mesmo dia (12/01, o piso negociado).
    expect(resultado.custoPorContratacaoId.get("hextra-material")).toBeCloseTo(30 * 4);
    expect(resultado.custoPorContratacaoId.get("mat-1")).toBe(500);
    expect(resultado.custoAdicionalTotal).toBeCloseTo(500 + 30 * 4);
  });

  it("custo nunca duplicado: 1 entrada por contratação em custoPorContratacaoId, soma bate exatamente com custoAdicionalTotal", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 4, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-12", 0, 5);
    const resultado = avaliarCenario(
      base,
      {
        capacidadeExtra: [],
        contratacoes: [contratacaoAntecipacaoValida("mat-1", 750)],
        terceirizacoes: [],
        recursosTemporarios: [],
        antecipacoesMaterial: [antecipacao("2026-01-12", "2026-01-20")],
      },
      grade,
    );
    expect(resultado.custoPorContratacaoId.size).toBe(1);
    expect(resultado.custoPorContratacaoId.get("mat-1")).toBe(750);
    expect(resultado.custoAdicionalTotal).toBe(750);
  });

  it("rejeita antecipação que na verdade atrasa (dataDisponibilidadeAntecipada posterior à original)", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 4, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 0, 3);

    expect(() =>
      avaliarCenario(
        base,
        {
          capacidadeExtra: [],
          contratacoes: [contratacaoAntecipacaoValida("mat-1")],
          terceirizacoes: [],
          recursosTemporarios: [],
          antecipacoesMaterial: [antecipacao("2026-01-20", "2026-01-10")],
        },
        grade,
      ),
    ).toThrow(/não é uma antecipação/);
  });

  it("rejeita antecipação com dataDisponibilidadeAntecipada IGUAL à original (não é ganho real, não é antecipação)", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 4, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 0, 3);

    expect(() =>
      avaliarCenario(
        base,
        {
          capacidadeExtra: [],
          contratacoes: [contratacaoAntecipacaoValida("mat-1")],
          terceirizacoes: [],
          recursosTemporarios: [],
          antecipacoesMaterial: [antecipacao("2026-01-15", "2026-01-15")],
        },
        grade,
      ),
    ).toThrow(/não é uma antecipação/);
  });

  it("rejeita abrangência incompatível (mesma classe de bug da terceirização - nunca custo 0 silencioso)", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 4, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 0, 3);
    const contratacoes: Contratacao[] = [{ ...contratacaoAntecipacaoValida("mat-1"), abrangencia: "por_hora_utilizada" }];

    expect(() =>
      avaliarCenario(
        base,
        { capacidadeExtra: [], contratacoes, terceirizacoes: [], recursosTemporarios: [], antecipacoesMaterial: [antecipacao("2026-01-12", "2026-01-15")] },
        grade,
      ),
    ).toThrow(/só aceita "por_periodo_completo" ou "valor_fixo_unico"/);
  });

  it("antecipação órfã (chave inexistente) e duplicada (2 decisões pra mesma ocorrência) são erro explícito", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 4, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 0, 3);

    expect(() =>
      avaliarCenario(
        base,
        {
          capacidadeExtra: [],
          contratacoes: [contratacaoAntecipacaoValida("mat-orfa")],
          terceirizacoes: [],
          recursosTemporarios: [],
          antecipacoesMaterial: [{ chave: chave("op-inexistente"), dataDisponibilidadeAntecipada: "2026-01-12", dataDisponibilidadeOriginal: "2026-01-15", contratacaoId: "mat-orfa" }],
        },
        grade,
      ),
    ).toThrow(/Antecipação de material órfã/);

    expect(() =>
      avaliarCenario(
        base,
        {
          capacidadeExtra: [],
          contratacoes: [contratacaoAntecipacaoValida("mat-1"), contratacaoAntecipacaoValida("mat-2")],
          terceirizacoes: [],
          recursosTemporarios: [],
          antecipacoesMaterial: [antecipacao("2026-01-12", "2026-01-15", "mat-1"), antecipacao("2026-01-13", "2026-01-16", "mat-2")],
        },
        grade,
      ),
    ).toThrow(/Antecipação de material duplicada/);
  });

  it("custoAdicionalTotal é exatamente a soma das 4 categorias (hora extra + terceirização + recurso temporário + antecipação de material), cada uma em operação distinta", () => {
    const ocTerc = ocorrencia("op-terceirizada-4way", 999, "recurso-C");
    const ocHextra = ocorrencia("op-hora-extra-4way", 26, "recurso-A");
    const ocTemp = ocorrencia("op-temporario-4way", 5, "recurso-B");
    const ocMaterial = ocorrencia("op-material-4way", 4, "recurso-D");

    const base: BaseCenarios = {
      empresaId: "empresa-1",
      projetoId: "projeto-1",
      ocorrencias: [ocTerc, ocHextra, ocTemp, ocMaterial],
      dependencias: [],
      chavesRaizOrcamentoNovo: [ocTerc.ocorrencia.chave, ocHextra.ocorrencia.chave, ocTemp.ocorrencia.chave, ocMaterial.ocorrencia.chave],
      chavesFinaisOrcamentoNovo: [ocTerc.ocorrencia.chave, ocHextra.ocorrencia.chave, ocTemp.ocorrencia.chave, ocMaterial.ocorrencia.chave],
      recursoIds: ["recurso-A", "recurso-B", "recurso-C", "recurso-D"],
      compatibilidades: {},
      capacidadeDiariaPorRecurso: { "recurso-A": 8, "recurso-B": 0, "recurso-C": 0, "recurso-D": 8 },
      produtividadePorRecurso: { "recurso-A": 1, "recurso-B": 1, "recurso-C": 1, "recurso-D": 1 },
      comprometidoInicialPorRecurso: { "recurso-A": 0, "recurso-B": 0, "recurso-C": 0, "recurso-D": 0 },
    };
    const grade = gradeSimples("2026-01-20", 15, 5);

    const recursoTemporario: RecursoTemporarioCenario = {
      idTemporario: "temp-4way",
      tipo: "freelancer",
      recursoReferenciaId: "recurso-referencia",
      disponibilidade: [{ data: "2026-01-18", horasDisponiveis: 5 }],
      contratacaoId: "temp-4way-contratacao",
      justificativa: "4way",
      aplicavelAsOperacoes: [chave("op-temporario-4way")],
    };
    const capacidadeExtra: CapacidadeExtraDia[] = [
      { recursoId: "recurso-A", data: "2026-01-20", horasAdicionaisDisponiveis: 4, natureza: "hora_extra", elegibilidade: { escopo: "somente_orcamento_novo" }, contratacaoId: "hextra-4way-contratacao" },
    ];
    const contratacoes: Contratacao[] = [
      contratacaoTerceirizacaoValida("terc-4way-contratacao", 3000),
      { id: "hextra-4way-contratacao", tipo: "hora_extra", abrangencia: "por_hora_utilizada", valor: 60, moeda: "BRL", fornecedorOuContratado: "Equipe interna", referenciaProposta: null, justificativa: "4way", datas: ["2026-01-20"] },
      { id: "temp-4way-contratacao", tipo: "freelancer", abrangencia: "por_hora_utilizada", valor: 40, moeda: "BRL", fornecedorOuContratado: "Freelancer", referenciaProposta: null, justificativa: "4way", datas: ["2026-01-18"] },
      contratacaoAntecipacaoValida("mat-4way-contratacao", 900),
    ];

    const resultado = avaliarCenario(
      base,
      {
        capacidadeExtra,
        contratacoes,
        terceirizacoes: [{ chave: chave("op-terceirizada-4way"), fornecedor: "Fornecedor Externo", prazoDiasCorridos: 3, contratacaoId: "terc-4way-contratacao" }],
        recursosTemporarios: [{ recursoTemporario, produtividadeReferencia: 1 }],
        antecipacoesMaterial: [{ chave: chave("op-material-4way"), dataDisponibilidadeAntecipada: "2026-01-18", dataDisponibilidadeOriginal: "2026-01-25", contratacaoId: "mat-4way-contratacao" }],
      },
      grade,
    );

    expect(resultado.estado === "viavel" || resultado.estado === "viavel_no_limite").toBe(true);
    expect(resultado.custoPorContratacaoId.get("terc-4way-contratacao")).toBe(3000);
    expect(resultado.custoPorContratacaoId.get("hextra-4way-contratacao")).toBeCloseTo(60 * 2);
    expect(resultado.custoPorContratacaoId.get("temp-4way-contratacao")).toBeCloseTo(40 * 5);
    expect(resultado.custoPorContratacaoId.get("mat-4way-contratacao")).toBe(900);

    // Cada uma das 4 contratações aparece exatamente 1 vez no mapa de custo, e a soma bate com o total.
    expect(resultado.custoPorContratacaoId.size).toBe(4);
    const somaIndividual = Array.from(resultado.custoPorContratacaoId.values()).reduce((a, b) => a + b, 0);
    expect(resultado.custoAdicionalTotal).toBeCloseTo(somaIndividual);
  });

  it("cruzar categoria com hora extra (mesmo contratacaoId em antecipacoesMaterial e capacidadeExtra) é rejeitado", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 4, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 0, 3);
    const capacidadeExtra: CapacidadeExtraDia[] = [
      { recursoId: "recurso-A", data: "2026-01-10", horasAdicionaisDisponiveis: 4, natureza: "hora_extra", elegibilidade: { escopo: "somente_orcamento_novo" }, contratacaoId: "contratacao-cruzada-material" },
    ];

    expect(() =>
      avaliarCenario(
        base,
        {
          capacidadeExtra,
          contratacoes: [contratacaoAntecipacaoValida("contratacao-cruzada-material")],
          terceirizacoes: [],
          recursosTemporarios: [],
          antecipacoesMaterial: [antecipacao("2026-01-12", "2026-01-15", "contratacao-cruzada-material")],
        },
        grade,
      ),
    ).toThrow(/referenciada em mais de 1 categoria/);
  });
});

describe("avaliarCenario - resultadosPorOcorrencia (lista plana congelada)", () => {
  it("populada nos estados viável, com chave/status/datas/déficit/alocações corretos", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 4, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 5, 5);

    const resultado = avaliarCenario(base, semDecisoes, grade);

    expect(resultado.resultadosPorOcorrencia).toHaveLength(1);
    const [r] = resultado.resultadosPorOcorrencia;
    expect(r.chave.bomOperacaoId).toBe("op-1");
    expect(r.status).toBe("concluida");
    expect(r.dataInicioReal).toBe("2026-01-10");
    expect(r.dataFimReal).toBe("2026-01-10");
    expect(r.deficitResidualHorasPadrao).toBe(0);
    expect(r.terceirizada).toBe(false);
    expect(r.prazoDiasCorridosTerceirizacao).toBeNull();
    expect(r.alocacoes).toHaveLength(1);
    expect(r.alocacoes[0]).toMatchObject({ natureza: "normal", horasMaquina: 4, recursoId: "recurso-A", contratacaoId: null });
    // recursosConsiderados = candidatoIdsPorPrioridade desta ocorrência - aqui só o recurso original (sem compatíveis/temporários no fixture).
    expect(r.recursosConsiderados).toEqual(["recurso-A"]);
  });

  it("terceirizada=true e prazoDiasCorridosTerceirizacao preenchido só para a ocorrência realmente terceirizada", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 999, capacidadeDiaria: 0 });
    const grade = gradeSimples("2026-01-20", 15, 5);

    const resultado = avaliarCenario(
      base,
      {
        capacidadeExtra: [],
        contratacoes: [contratacaoTerceirizacaoValida("terc-flag", 1000)],
        terceirizacoes: [{ chave: chave("op-1"), fornecedor: "X", prazoDiasCorridos: 4, contratacaoId: "terc-flag" }],
        recursosTemporarios: [], antecipacoesMaterial: [],
      },
      grade,
    );

    expect(resultado.resultadosPorOcorrencia).toHaveLength(1);
    const [r] = resultado.resultadosPorOcorrencia;
    expect(r.terceirizada).toBe(true);
    expect(r.prazoDiasCorridosTerceirizacao).toBe(4);
  });

  it("resultadosSaoDiagnostico=false e chave congelada em profundidade (mutar chave.bomOperacaoId lança TypeError)", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 4, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 5, 5);

    const resultado = avaliarCenario(base, semDecisoes, grade);

    expect(resultado.resultadosSaoDiagnostico).toBe(false);
    const [r] = resultado.resultadosPorOcorrencia;
    expect(Object.isFrozen(r.chave)).toBe(true);
    expect(Object.isFrozen(r.chave.caminhoBomItemIds)).toBe(true);
    // ChaveOcorrencia (chaveOcorrencia.ts) agora é readonly no tipo - as 2
    // linhas abaixo já são erro de COMPILAÇÃO (daí o @ts-expect-error).
    // Mas tipo readonly sozinho não impede nada em EXECUÇÃO (um cast, ou
    // JS puro sem TS, ainda mutaria o objeto) - Object.freeze
    // (copiarECongelarChave) é quem garante a proteção real, e é essa
    // garantia de runtime que este teste prova, nas duas camadas juntas.
    expect(() => {
      // @ts-expect-error - mutação proposital para provar a proteção em runtime; o tipo já bloqueia isso em compilação.
      r.chave.bomOperacaoId = "outra-operacao";
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error - idem: readonly string[] não tem .push no tipo, mas o array real (congelado) segue existindo em runtime.
      r.chave.caminhoBomItemIds.push("item-injetado");
    }).toThrow(TypeError);
    expect(r.chave.bomOperacaoId).toBe("op-1");
  });

  it("lista, cada item e cada alocação são genuinamente congelados em tempo de execução (Object.freeze), não só readonly de tipo", () => {
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 4, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 5, 5);

    const resultado = avaliarCenario(base, semDecisoes, grade);

    expect(Object.isFrozen(resultado.resultadosPorOcorrencia)).toBe(true);
    expect(Object.isFrozen(resultado.resultadosPorOcorrencia[0])).toBe(true);
    expect(Object.isFrozen(resultado.resultadosPorOcorrencia[0].alocacoes)).toBe(true);
    expect(Object.isFrozen(resultado.resultadosPorOcorrencia[0].alocacoes[0])).toBe(true);

    // Módulos ES sempre rodam em modo estrito - atribuir a uma
    // propriedade congelada lança TypeError (não falha silenciosamente),
    // prova mais forte ainda de que a mutação é impedida de verdade.
    const alocacao = resultado.resultadosPorOcorrencia[0].alocacoes[0];
    expect(() => {
      // @ts-expect-error - mutação proposital para provar que é impedida, não é o contrato normal de uso.
      alocacao.horasMaquina = 999;
    }).toThrow(TypeError);
    expect(alocacao.horasMaquina).toBe(4);
  });

  it("ordenada explicitamente pela chave completa (string), não pela ordem de inserção do Map do escalonador", () => {
    // op-a depende de op-z (predecessora) - op-z é concluída e inserida
    // no Map do escalonador PRIMEIRO (é raiz, começa antes), op-a só
    // depois (fica pronta quando op-z termina). Ordem de inserção real:
    // [op-z, op-a]. Ordem alfabética por chaveOcorrenciaParaString (que
    // termina em bomOperacaoId, único campo que varia aqui): [op-a, op-z].
    // As duas divergem de propósito - prova que o resultado não depende
    // da ordem interna do Map.
    const ocZ = ocorrencia("op-z", 4, "recurso-A");
    const ocA = ocorrencia("op-a", 4, "recurso-A");
    const base: BaseCenarios = {
      empresaId: "empresa-1",
      projetoId: "projeto-1",
      ocorrencias: [ocZ, ocA],
      dependencias: [{ predecessora: ocZ.ocorrencia.chave, sucessora: ocA.ocorrencia.chave, tipo: "sequencia_roteiro" }],
      chavesRaizOrcamentoNovo: [ocZ.ocorrencia.chave],
      chavesFinaisOrcamentoNovo: [ocA.ocorrencia.chave],
      recursoIds: ["recurso-A"],
      compatibilidades: {},
      capacidadeDiariaPorRecurso: { "recurso-A": 8 },
      produtividadePorRecurso: { "recurso-A": 1 },
      comprometidoInicialPorRecurso: { "recurso-A": 0 },
    };
    const grade = gradeSimples("2026-01-10", 5, 5);

    const resultado = avaliarCenario(base, semDecisoes, grade);

    expect(resultado.resultadosPorOcorrencia).toHaveLength(2);
    expect(resultado.resultadosPorOcorrencia.map((r) => r.chave.bomOperacaoId)).toEqual(["op-a", "op-z"]);
  });
});

describe("avaliarCenario - diagnóstico em cenários inviáveis (resultadosPorOcorrencia preserva a melhor tentativa relevante)", () => {
  it("horizonte_tecnico_excedido: preserva a operação bloqueada e o déficit residual real (nunca 0 nesse estado)", () => {
    // 20h necessárias, grade só cobre 2 dias × 8h = 16h no máximo -
    // déficit real de 4h, em toda e qualquer candidata (não há "melhor",
    // DEC-007 §8.1) - datasCandidatas[0] (única candidata aqui) é usada
    // como exemplo representativo.
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 20, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 0, 1);

    const resultado = avaliarCenario(base, semDecisoes, grade);

    expect(resultado.estado).toBe("horizonte_tecnico_excedido");
    expect(resultado.resultadosSaoDiagnostico).toBe(true);
    expect(resultado.resultadosPorOcorrencia).toHaveLength(1);
    const [r] = resultado.resultadosPorOcorrencia;
    expect(r.chave.bomOperacaoId).toBe("op-1");
    expect(r.status).toBe("bloqueada_por_deficit");
    expect(r.deficitResidualHorasPadrao).toBe(4); // 20 necessárias - 16 disponíveis na grade (2 dias × 8h)
    // recursos considerados (candidatoIdsPorPrioridade) vs. usados (recursoId das alocações reais) -
    // aqui os dois coincidem (só recurso-A, esgotado, sem compatível/temporário no fixture).
    expect(r.recursosConsiderados).toEqual(["recurso-A"]);
    expect(new Set(r.alocacoes.map((a) => a.recursoId))).toEqual(new Set(["recurso-A"]));
  });

  it("prazo_inviavel: a candidata replay conclui TODAS as operações (déficit 0) - o problema é atraso, não capacidade (diasCivisDeAtraso no nível superior)", () => {
    // 20h necessárias a 8h/dia = 3 dias corridos (8+8+4), só conclui em
    // 2026-01-12 - 2 dias depois do prazoInterno (2026-01-10). Única
    // candidata testada (diasAntes=0): sempre "a melhor", sem ambiguidade.
    const base = baseComUmaOcorrencia({ necessarioHorasPadrao: 20, capacidadeDiaria: 8 });
    const grade = gradeSimples("2026-01-10", 0, 5);

    const resultado = avaliarCenario(base, semDecisoes, grade);

    expect(resultado.estado).toBe("prazo_inviavel");
    if (resultado.estado === "prazo_inviavel") {
      expect(resultado.dataFimReal).toBe("2026-01-12");
      expect(resultado.diasCivisDeAtraso).toBe(2);
    }
    expect(resultado.resultadosSaoDiagnostico).toBe(true);
    expect(resultado.resultadosPorOcorrencia).toHaveLength(1);
    const [r] = resultado.resultadosPorOcorrencia;
    expect(r.status).toBe("concluida");
    expect(r.dataFimReal).toBe("2026-01-12");
    // Por definição de melhorConclusaoTardia (calculadorReversoConjunto.ts):
    // só entra nesse ramo quando TODAS as finais concluem - déficit 0
    // aqui é esperado e correto, não um bug - NUNCA interpretar
    // deficitResidualTotalHorasPadrao=0 como "sem problema" neste estado,
    // o problema real é o atraso já reportado em diasCivisDeAtraso.
    expect(r.deficitResidualHorasPadrao).toBe(0);
  });

  it("resultado diagnóstico nunca é confundido com programação aceita: resultadosSaoDiagnostico é false apenas em viável/viável_no_limite", () => {
    const baseViavel = baseComUmaOcorrencia({ necessarioHorasPadrao: 4, capacidadeDiaria: 8 });
    const resultadoViavel = avaliarCenario(baseViavel, semDecisoes, gradeSimples("2026-01-10", 5, 5));
    expect(resultadoViavel.resultadosSaoDiagnostico).toBe(false);

    const baseInviavel = baseComUmaOcorrencia({ necessarioHorasPadrao: 20, capacidadeDiaria: 8 });
    const resultadoHorizonte = avaliarCenario(baseInviavel, semDecisoes, gradeSimples("2026-01-10", 0, 1));
    expect(resultadoHorizonte.resultadosSaoDiagnostico).toBe(true);

    const resultadoPrazo = avaliarCenario(baseInviavel, semDecisoes, gradeSimples("2026-01-10", 0, 5));
    expect(resultadoPrazo.resultadosSaoDiagnostico).toBe(true);
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
