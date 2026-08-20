import { describe, expect, it } from "vitest";
import { estimarFifoComercial, type CapacidadeRecursoFifo } from "./estimativaFifoComercial";
import type { CompromissoCapacidade } from "./compromissoCapacidade";

function compromisso(overrides: Partial<CompromissoCapacidade> = {}): CompromissoCapacidade {
  return {
    empresaId: "empresa-1",
    projetoId: "projeto-1",
    recursoId: "solda",
    horasRestantesPadrao: 8,
    disponivelAPartirDe: "2026-09-01",
    dataEntradaFila: "2026-08-20",
    prioridade: 0,
    classeFila: "confirmado",
    chaveOrdenacao: "chave-padrao",
    origem: "snapshot_comercial",
    chavesTrabalhoOrigem: ["op-1"],
    ...overrides,
  };
}

function capacidadeMap(entradas: CapacidadeRecursoFifo[]): ReadonlyMap<string, CapacidadeRecursoFifo> {
  return new Map(entradas.map((c) => [c.recursoId, c]));
}

function gerarDatas(inicio: string, quantidade: number): string[] {
  const [ano, mes, dia] = inicio.split("-").map(Number);
  const datas: string[] = [];
  for (let i = 0; i < quantidade; i++) {
    datas.push(new Date(Date.UTC(ano, mes - 1, dia + i)).toISOString().slice(0, 10));
  }
  return datas;
}

describe("estimarFifoComercial", () => {
  it("pedidos confirmados são consumidos antes do orçamento novo, nunca por data artificial", () => {
    const confirmado = compromisso({ chaveOrdenacao: "c1", horasRestantesPadrao: 8 }); // consome o dia 1 inteiro
    const novo = compromisso({
      classeFila: "orcamento_novo",
      origem: "orcamento_novo",
      dataEntradaFila: null,
      chaveOrdenacao: "novo",
      horasRestantesPadrao: 8,
    });

    const resultado = estimarFifoComercial({
      dataSolicitadaCliente: "2026-09-10",
      recursosNecessarios: ["solda"],
      compromissos: [confirmado, novo],
      capacidadesPorRecurso: capacidadeMap([{ recursoId: "solda", capacidadeHorasMaquinaDia: 8, produtividade: 1 }]),
      datasGrade: gerarDatas("2026-09-01", 10),
    });

    expect(resultado.primeiraEntregaPossivel).toBe("2026-09-02"); // dia 1 já era do confirmado
  });

  it("fila independente por recurso: recurso pesado não afeta o término de outro recurso, mesmo processados juntos", () => {
    const soldaConfirmado = compromisso({ recursoId: "solda", chaveOrdenacao: "c1", horasRestantesPadrao: 40 }); // 5 dias inteiros
    const soldaNovo = compromisso({
      recursoId: "solda",
      classeFila: "orcamento_novo",
      origem: "orcamento_novo",
      dataEntradaFila: null,
      chaveOrdenacao: "novo-solda",
      horasRestantesPadrao: 8,
    });
    const pinturaNovo = compromisso({
      recursoId: "pintura",
      classeFila: "orcamento_novo",
      origem: "orcamento_novo",
      dataEntradaFila: null,
      chaveOrdenacao: "novo-pintura",
      horasRestantesPadrao: 8,
    });

    const resultado = estimarFifoComercial({
      dataSolicitadaCliente: "2026-09-20",
      recursosNecessarios: ["solda", "pintura"],
      compromissos: [soldaConfirmado, soldaNovo, pinturaNovo],
      capacidadesPorRecurso: capacidadeMap([
        { recursoId: "solda", capacidadeHorasMaquinaDia: 8, produtividade: 1 },
        { recursoId: "pintura", capacidadeHorasMaquinaDia: 8, produtividade: 1 },
      ]),
      datasGrade: gerarDatas("2026-09-01", 15),
    });

    const filaPintura = resultado.filasPorRecurso.find((f) => f.recursoId === "pintura")!;
    expect(filaPintura.terminoOrcamentoNovo).toBe("2026-09-01"); // não foi empurrado pela fila pesada da solda

    const filaSolda = resultado.filasPorRecurso.find((f) => f.recursoId === "solda")!;
    expect(filaSolda.terminoOrcamentoNovo).toBe("2026-09-06"); // 5 dias do confirmado + 1 dia do novo
  });

  it("recursos diferentes trabalhando em paralelo: a previsão final é o maior término entre eles (o recurso mais lento determina a entrega)", () => {
    const soldaNovo = compromisso({ recursoId: "solda", classeFila: "orcamento_novo", origem: "orcamento_novo", dataEntradaFila: null, chaveOrdenacao: "a", horasRestantesPadrao: 40 });
    const pinturaNovo = compromisso({ recursoId: "pintura", classeFila: "orcamento_novo", origem: "orcamento_novo", dataEntradaFila: null, chaveOrdenacao: "b", horasRestantesPadrao: 8 });

    const resultado = estimarFifoComercial({
      dataSolicitadaCliente: "2026-09-20",
      recursosNecessarios: ["solda", "pintura"],
      compromissos: [soldaNovo, pinturaNovo],
      capacidadesPorRecurso: capacidadeMap([
        { recursoId: "solda", capacidadeHorasMaquinaDia: 8, produtividade: 1 },
        { recursoId: "pintura", capacidadeHorasMaquinaDia: 8, produtividade: 1 },
      ]),
      datasGrade: gerarDatas("2026-09-01", 15),
    });

    expect(resultado.primeiraEntregaPossivel).toBe("2026-09-05"); // solda: 40h/8h-dia = 5 dias
    expect(resultado.recursosQueDeterminamTermino).toEqual(["solda"]);
  });

  it("empate no recurso determinante: os dois recursos terminando no mesmo dia aparecem em recursosQueDeterminamTermino", () => {
    const soldaNovo = compromisso({ recursoId: "solda", classeFila: "orcamento_novo", origem: "orcamento_novo", dataEntradaFila: null, chaveOrdenacao: "a", horasRestantesPadrao: 8 });
    const pinturaNovo = compromisso({ recursoId: "pintura", classeFila: "orcamento_novo", origem: "orcamento_novo", dataEntradaFila: null, chaveOrdenacao: "b", horasRestantesPadrao: 8 });

    const resultado = estimarFifoComercial({
      dataSolicitadaCliente: "2026-09-20",
      recursosNecessarios: ["solda", "pintura"],
      compromissos: [soldaNovo, pinturaNovo],
      capacidadesPorRecurso: capacidadeMap([
        { recursoId: "solda", capacidadeHorasMaquinaDia: 8, produtividade: 1 },
        { recursoId: "pintura", capacidadeHorasMaquinaDia: 8, produtividade: 1 },
      ]),
      datasGrade: gerarDatas("2026-09-01", 15),
    });

    expect(resultado.primeiraEntregaPossivel).toBe("2026-09-01");
    expect([...resultado.recursosQueDeterminamTermino].sort()).toEqual(["pintura", "solda"]);
  });

  it("horizonte técnico continua depois da data solicitada: encontra a data real mesmo além do que o cliente pediu, nunca clipa no dia solicitado", () => {
    const confirmado = compromisso({ chaveOrdenacao: "c1", horasRestantesPadrao: 32 }); // 4 dias
    const novo = compromisso({ classeFila: "orcamento_novo", origem: "orcamento_novo", dataEntradaFila: null, chaveOrdenacao: "novo", horasRestantesPadrao: 8 });

    const resultado = estimarFifoComercial({
      dataSolicitadaCliente: "2026-09-02", // pedido é cedo - a capacidade real só resolve depois
      recursosNecessarios: ["solda"],
      compromissos: [confirmado, novo],
      capacidadesPorRecurso: capacidadeMap([{ recursoId: "solda", capacidadeHorasMaquinaDia: 8, produtividade: 1 }]),
      datasGrade: gerarDatas("2026-09-01", 15), // grade vai bem além de 09-02
    });

    expect(resultado.primeiraEntregaPossivel).toBe("2026-09-05"); // 4 dias do confirmado + 1 dia do novo, depois da data solicitada
    expect(resultado.atendeDataSolicitada).toBe(false);
  });

  it("horizonte técnico insuficiente: nunca finge que o último dia da grade é a resposta - retorna horizonteTecnico='insuficiente' e primeiraEntregaPossivel=null", () => {
    const novo = compromisso({
      classeFila: "orcamento_novo",
      origem: "orcamento_novo",
      dataEntradaFila: null,
      chaveOrdenacao: "novo",
      horasRestantesPadrao: 1000, // não cabe em nenhuma grade razoável
    });

    const resultado = estimarFifoComercial({
      dataSolicitadaCliente: "2026-09-10",
      recursosNecessarios: ["solda"],
      compromissos: [novo],
      capacidadesPorRecurso: capacidadeMap([{ recursoId: "solda", capacidadeHorasMaquinaDia: 8, produtividade: 1 }]),
      datasGrade: gerarDatas("2026-09-01", 15), // 15 dias × 8h = 120h, insuficiente para 1000h
    });

    expect(resultado.horizonteTecnico).toBe("insuficiente");
    expect(resultado.primeiraEntregaPossivel).toBeNull();
    expect(resultado.atendeDataSolicitada).toBe(false);
    const fila = resultado.filasPorRecurso.find((f) => f.recursoId === "solda")!;
    expect(fila.deficitResidualHorasPadrao).toBeGreaterThan(0);
  });

  it("nenhuma precedência artificial: a ordem dos compromissos no array de entrada não muda o resultado - só a ordem FIFO documentada importa", () => {
    const confirmadoCedo = compromisso({ chaveOrdenacao: "c1", dataEntradaFila: "2026-08-01", horasRestantesPadrao: 8 });
    const confirmadoDepois = compromisso({ chaveOrdenacao: "c2", dataEntradaFila: "2026-08-15", horasRestantesPadrao: 8 });
    const novo = compromisso({ classeFila: "orcamento_novo", origem: "orcamento_novo", dataEntradaFila: null, chaveOrdenacao: "novo", horasRestantesPadrao: 8 });

    const capacidades = capacidadeMap([{ recursoId: "solda", capacidadeHorasMaquinaDia: 8, produtividade: 1 }]);
    const datasGrade = gerarDatas("2026-09-01", 10);

    const resultadoOrdemA = estimarFifoComercial({
      dataSolicitadaCliente: "2026-09-20",
      recursosNecessarios: ["solda"],
      compromissos: [confirmadoCedo, confirmadoDepois, novo],
      capacidadesPorRecurso: capacidades,
      datasGrade,
    });
    const resultadoOrdemB = estimarFifoComercial({
      dataSolicitadaCliente: "2026-09-20",
      recursosNecessarios: ["solda"],
      compromissos: [novo, confirmadoDepois, confirmadoCedo], // ordem invertida no array
      capacidadesPorRecurso: capacidades,
      datasGrade,
    });

    expect(resultadoOrdemA.primeiraEntregaPossivel).toBe("2026-09-03"); // 2 dias de confirmados + 1 do novo
    expect(resultadoOrdemA).toEqual(resultadoOrdemB);
  });

  it("produtividade aplicada exatamente uma vez: recurso com produtividade 0,5 precisa do DOBRO de dias-máquina para a mesma necessidade em horas-padrão", () => {
    const novo = compromisso({ classeFila: "orcamento_novo", origem: "orcamento_novo", dataEntradaFila: null, chaveOrdenacao: "novo", horasRestantesPadrao: 8 });
    const datasGrade = gerarDatas("2026-09-01", 10);

    const comProdutividadeIntegral = estimarFifoComercial({
      dataSolicitadaCliente: "2026-09-20",
      recursosNecessarios: ["solda"],
      compromissos: [novo],
      capacidadesPorRecurso: capacidadeMap([{ recursoId: "solda", capacidadeHorasMaquinaDia: 8, produtividade: 1 }]),
      datasGrade,
    });
    const comProdutividadeMetade = estimarFifoComercial({
      dataSolicitadaCliente: "2026-09-20",
      recursosNecessarios: ["solda"],
      compromissos: [novo],
      capacidadesPorRecurso: capacidadeMap([{ recursoId: "solda", capacidadeHorasMaquinaDia: 8, produtividade: 0.5 }]),
      datasGrade,
    });

    // 8h-padrão / produtividade 1 = 8h-máquina = 1 dia. 8h-padrão / 0,5 = 16h-máquina = 2 dias.
    expect(comProdutividadeIntegral.primeiraEntregaPossivel).toBe("2026-09-01");
    expect(comProdutividadeMetade.primeiraEntregaPossivel).toBe("2026-09-02");
  });

  it("nova instância de capacidade em cada cenário: chamadas repetidas com os mesmos parâmetros produzem exatamente o mesmo resultado, sem contaminação entre elas", () => {
    const confirmado = compromisso({ chaveOrdenacao: "c1", horasRestantesPadrao: 8 });
    const novo = compromisso({ classeFila: "orcamento_novo", origem: "orcamento_novo", dataEntradaFila: null, chaveOrdenacao: "novo", horasRestantesPadrao: 8 });
    const params = {
      dataSolicitadaCliente: "2026-09-20",
      recursosNecessarios: ["solda"],
      compromissos: [confirmado, novo],
      capacidadesPorRecurso: capacidadeMap([{ recursoId: "solda", capacidadeHorasMaquinaDia: 8, produtividade: 1 }]),
      datasGrade: gerarDatas("2026-09-01", 10),
    };

    const resultado1 = estimarFifoComercial(params);
    // Cenário "intermediário" com números bem diferentes, para provar que não deixa resíduo.
    estimarFifoComercial({ ...params, compromissos: [compromisso({ chaveOrdenacao: "outro", horasRestantesPadrao: 999 })] });
    const resultado2 = estimarFifoComercial(params);

    expect(resultado1).toEqual(resultado2);
  });

  it("resultado comercial: atendeDataSolicitada=true quando a entrega cabe até a data pedida", () => {
    const novo = compromisso({ classeFila: "orcamento_novo", origem: "orcamento_novo", dataEntradaFila: null, chaveOrdenacao: "novo", horasRestantesPadrao: 8 });
    const resultado = estimarFifoComercial({
      dataSolicitadaCliente: "2026-09-05",
      recursosNecessarios: ["solda"],
      compromissos: [novo],
      capacidadesPorRecurso: capacidadeMap([{ recursoId: "solda", capacidadeHorasMaquinaDia: 8, produtividade: 1 }]),
      datasGrade: gerarDatas("2026-09-01", 10),
    });

    expect(resultado.primeiraEntregaPossivel).toBe("2026-09-01");
    expect(resultado.atendeDataSolicitada).toBe(true);
  });

  it("resultado comercial: atendeDataSolicitada=false com primeiraEntregaPossivel preenchida quando cabe, só que depois do pedido", () => {
    const confirmado = compromisso({ chaveOrdenacao: "c1", horasRestantesPadrao: 16 }); // 2 dias
    const novo = compromisso({ classeFila: "orcamento_novo", origem: "orcamento_novo", dataEntradaFila: null, chaveOrdenacao: "novo", horasRestantesPadrao: 8 });
    const resultado = estimarFifoComercial({
      dataSolicitadaCliente: "2026-09-01",
      recursosNecessarios: ["solda"],
      compromissos: [confirmado, novo],
      capacidadesPorRecurso: capacidadeMap([{ recursoId: "solda", capacidadeHorasMaquinaDia: 8, produtividade: 1 }]),
      datasGrade: gerarDatas("2026-09-01", 10),
    });

    expect(resultado.primeiraEntregaPossivel).toBe("2026-09-03");
    expect(resultado.atendeDataSolicitada).toBe(false);
    expect(resultado.horizonteTecnico).toBe("suficiente");
  });
});
