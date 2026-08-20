import { describe, expect, it } from "vitest";
import { avaliarPrevisaoComercialFlexivel } from "./avaliarPrevisaoComercialFlexivel";
import type { CompromissoCapacidade } from "./compromissoCapacidade";
import type { NecessidadeCapacidadeFlexivel, CapacidadeNormalRecurso } from "./necessidadeCapacidadeFlexivel";
import type { CapacidadeExtraDia } from "./capacidadeDia";

function confirmado(overrides: Partial<CompromissoCapacidade> = {}): CompromissoCapacidade {
  return {
    empresaId: "empresa-1",
    projetoId: "projeto-confirmado",
    recursoId: "recurso-A",
    horasRestantesPadrao: 8,
    disponivelAPartirDe: "2026-09-01",
    dataEntradaFila: "2026-08-01",
    prioridade: 0,
    classeFila: "confirmado",
    chaveOrdenacao: "confirmado-1",
    origem: "snapshot_comercial",
    chavesTrabalhoOrigem: ["op-confirmado-1"],
    ...overrides,
  };
}

function necessidade(overrides: Partial<NecessidadeCapacidadeFlexivel> = {}): NecessidadeCapacidadeFlexivel {
  return {
    empresaId: "empresa-1",
    projetoId: "projeto-novo",
    projetoItemId: "item-1",
    chaveTrabalho: "op-novo-1",
    recursoOriginalId: "recurso-A",
    recursosCompativeisPorPrioridade: [],
    horasNecessariasPadrao: 8,
    disponivelAPartirDe: "2026-09-01",
    ...overrides,
  };
}

function capacidade(recursoId: string, capacidadeHorasMaquinaDia: number, produtividade = 1): CapacidadeNormalRecurso {
  return { recursoId, capacidadeHorasMaquinaDia, produtividade };
}

function capacidadesMap(entradas: CapacidadeNormalRecurso[]): ReadonlyMap<string, CapacidadeNormalRecurso> {
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

describe("avaliarPrevisaoComercialFlexivel", () => {
  describe("validações", () => {
    it("rejeita necessidadesOrcamentoNovo vazio", () => {
      expect(() =>
        avaliarPrevisaoComercialFlexivel({
          dataSolicitadaCliente: "2026-09-10",
          compromissosConfirmados: [],
          necessidadesOrcamentoNovo: [],
          capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
          capacidadeExtraAutorizada: [],
          temporariosPorPrioridade: [],
          datasGrade: gerarDatas("2026-09-01", 5),
        }),
      ).toThrow(/necessidadesOrcamentoNovo/);
    });

    it("rejeita compromissosConfirmados com classeFila diferente de 'confirmado'", () => {
      expect(() =>
        avaliarPrevisaoComercialFlexivel({
          dataSolicitadaCliente: "2026-09-10",
          compromissosConfirmados: [confirmado({ classeFila: "orcamento_novo" })],
          necessidadesOrcamentoNovo: [necessidade()],
          capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
          capacidadeExtraAutorizada: [],
          temporariosPorPrioridade: [],
          datasGrade: gerarDatas("2026-09-01", 5),
        }),
      ).toThrow(/classeFila/);
    });

    it("rejeita confirmado sem dataEntradaFila", () => {
      expect(() =>
        avaliarPrevisaoComercialFlexivel({
          dataSolicitadaCliente: "2026-09-10",
          compromissosConfirmados: [confirmado({ dataEntradaFila: null })],
          necessidadesOrcamentoNovo: [necessidade()],
          capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
          capacidadeExtraAutorizada: [],
          temporariosPorPrioridade: [],
          datasGrade: gerarDatas("2026-09-01", 5),
        }),
      ).toThrow(/dataEntradaFila/);
    });

    it("rejeita recurso referenciado sem entrada em capacidadesNormais", () => {
      expect(() =>
        avaliarPrevisaoComercialFlexivel({
          dataSolicitadaCliente: "2026-09-10",
          compromissosConfirmados: [],
          necessidadesOrcamentoNovo: [necessidade({ recursoOriginalId: "recurso-fantasma" })],
          capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
          capacidadeExtraAutorizada: [],
          temporariosPorPrioridade: [],
          datasGrade: gerarDatas("2026-09-01", 5),
        }),
      ).toThrow(/recurso-fantasma/);
    });
  });

  it("1. compromissos confirmados consomem primeiro a capacidade fixa - orçamento novo recebe só o saldo", () => {
    const resultado = avaliarPrevisaoComercialFlexivel({
      dataSolicitadaCliente: "2026-09-10",
      compromissosConfirmados: [confirmado({ horasRestantesPadrao: 5 })], // consome 5h do dia 1 (capacidade 8h)
      necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 3 })], // só resta 3h no dia 1
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasGrade: gerarDatas("2026-09-01", 5),
    });

    expect(resultado.horizonteTecnico).toBe("suficiente");
    expect(resultado.primeiraEntregaPossivel).toBe("2026-09-01"); // coube tudo no dia 1, com o saldo restante
    expect(resultado.resultadosPorOp[0].resultado.status).toBe("concluida");
  });

  it("2. orçamento novo entra depois de TODOS os confirmados, em ordem FIFO entre eles", () => {
    const resultado = avaliarPrevisaoComercialFlexivel({
      dataSolicitadaCliente: "2026-09-10",
      compromissosConfirmados: [
        confirmado({ chaveOrdenacao: "c-2", dataEntradaFila: "2026-08-10", horasRestantesPadrao: 4 }),
        confirmado({ chaveOrdenacao: "c-1", dataEntradaFila: "2026-08-01", horasRestantesPadrao: 4 }), // entrou antes, apesar de vir depois no array
      ],
      necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 8 })], // 8h de capacidade, 8h já usadas pelos 2 confirmados
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasGrade: gerarDatas("2026-09-01", 5),
    });

    // Os 2 confirmados (8h) esgotam o dia 1 inteiro - o orçamento novo só consegue começar no dia 2.
    expect(resultado.horizonteTecnico).toBe("suficiente");
    expect(resultado.primeiraEntregaPossivel).toBe("2026-09-02");
  });

  it("3. OP do orçamento usa recurso original e compatível conforme a regra validada (original insuficiente após confirmados)", () => {
    const resultado = avaliarPrevisaoComercialFlexivel({
      dataSolicitadaCliente: "2026-09-10",
      compromissosConfirmados: [confirmado({ recursoId: "recurso-A", horasRestantesPadrao: 6 })], // deixa só 2h no original
      necessidadesOrcamentoNovo: [
        necessidade({ horasNecessariasPadrao: 5, recursosCompativeisPorPrioridade: ["recurso-B"] }),
      ],
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8), capacidade("recurso-B", 8)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasGrade: gerarDatas("2026-09-01", 5),
    });

    expect(resultado.horizonteTecnico).toBe("suficiente");
    const alocacoes = resultado.resultadosPorOp[0].resultado.alocacoes;
    const porRecurso = new Map(alocacoes.map((a) => [a.recursoId, a.horasPadrao]));
    expect(porRecurso.get("recurso-A")).toBe(2); // saldo restante do original após o confirmado
    expect(porRecurso.get("recurso-B")).toBe(3); // resto via compatível
  });

  it("4. recursos diferentes operando em paralelo - carga pesada num recurso não afeta o resultado de outro", () => {
    const resultado = avaliarPrevisaoComercialFlexivel({
      dataSolicitadaCliente: "2026-09-20",
      compromissosConfirmados: [confirmado({ recursoId: "recurso-A", horasRestantesPadrao: 32 })], // 4 dias inteiros ocupados em A
      necessidadesOrcamentoNovo: [
        necessidade({ chaveTrabalho: "op-A", recursoOriginalId: "recurso-A", horasNecessariasPadrao: 8 }),
        necessidade({ chaveTrabalho: "op-B", recursoOriginalId: "recurso-B", horasNecessariasPadrao: 8 }),
      ],
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8), capacidade("recurso-B", 8)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasGrade: gerarDatas("2026-09-01", 10),
    });

    const opB = resultado.resultadosPorOp.find((r) => r.chaveTrabalho === "op-B")!;
    expect(opB.resultado.alocacoes[0].data).toBe("2026-09-01"); // recurso-B nunca foi tocado pela carga de A
    const opA = resultado.resultadosPorOp.find((r) => r.chaveTrabalho === "op-A")!;
    expect(opA.resultado.alocacoes[0].data).toBe("2026-09-05"); // só depois dos 4 dias do confirmado em A
  });

  it("5. previsão do projeto é a maior data final entre os recursos utilizados", () => {
    const resultado = avaliarPrevisaoComercialFlexivel({
      dataSolicitadaCliente: "2026-09-20",
      compromissosConfirmados: [],
      necessidadesOrcamentoNovo: [
        necessidade({ chaveTrabalho: "op-A", recursoOriginalId: "recurso-A", horasNecessariasPadrao: 40 }), // 5 dias
        necessidade({ chaveTrabalho: "op-B", recursoOriginalId: "recurso-B", horasNecessariasPadrao: 8 }), // 1 dia
      ],
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8), capacidade("recurso-B", 8)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasGrade: gerarDatas("2026-09-01", 10),
    });

    expect(resultado.primeiraEntregaPossivel).toBe("2026-09-05"); // determinado pelo recurso mais lento (A)
    expect(resultado.recursosQueDeterminamTermino).toEqual(["recurso-A"]);
  });

  it("6. comparação com a data solicitada: atendeDataSolicitada true e false", () => {
    const capacidades = capacidadesMap([capacidade("recurso-A", 8)]);
    const datasGrade = gerarDatas("2026-09-01", 10);

    const atende = avaliarPrevisaoComercialFlexivel({
      dataSolicitadaCliente: "2026-09-05",
      compromissosConfirmados: [],
      necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 8 })],
      capacidadesNormais: capacidades,
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasGrade,
    });
    expect(atende.atendeDataSolicitada).toBe(true);

    const naoAtende = avaliarPrevisaoComercialFlexivel({
      dataSolicitadaCliente: "2026-09-01",
      compromissosConfirmados: [confirmado({ horasRestantesPadrao: 8 })], // ocupa o dia 1 inteiro
      necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 8 })],
      capacidadesNormais: capacidades,
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasGrade,
    });
    expect(naoAtende.atendeDataSolicitada).toBe(false);
    expect(naoAtende.primeiraEntregaPossivel).toBe("2026-09-02");
  });

  it("7. horizonte estendido além da data solicitada encontra a primeira entrega possível, nunca finge a última data da grade", () => {
    const resultado = avaliarPrevisaoComercialFlexivel({
      dataSolicitadaCliente: "2026-09-02", // pedido cedo - a capacidade real só resolve depois
      compromissosConfirmados: [confirmado({ horasRestantesPadrao: 32 })], // 4 dias ocupados
      necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 8 })],
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasGrade: gerarDatas("2026-09-01", 15), // horizonte bem além do pedido
    });

    expect(resultado.horizonteTecnico).toBe("suficiente");
    expect(resultado.primeiraEntregaPossivel).toBe("2026-09-05");
    expect(resultado.atendeDataSolicitada).toBe(false);
  });

  it("horizonte técnico insuficiente: nenhuma OP encaixa dentro da grade fornecida", () => {
    const resultado = avaliarPrevisaoComercialFlexivel({
      dataSolicitadaCliente: "2026-09-10",
      compromissosConfirmados: [],
      necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 1000 })],
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasGrade: gerarDatas("2026-09-01", 5),
    });

    expect(resultado.horizonteTecnico).toBe("insuficiente");
    expect(resultado.primeiraEntregaPossivel).toBeNull();
    expect(resultado.atendeDataSolicitada).toBe(false);
    expect(resultado.recursosQueDeterminamTermino).toEqual([]);
  });

  it("2 OPs do mesmo orçamento novo compartilhando o mesmo recurso disputam a capacidade na ordem do array", () => {
    const resultado = avaliarPrevisaoComercialFlexivel({
      dataSolicitadaCliente: "2026-09-10",
      compromissosConfirmados: [],
      necessidadesOrcamentoNovo: [
        necessidade({ chaveTrabalho: "op-1", horasNecessariasPadrao: 6 }),
        necessidade({ chaveTrabalho: "op-2", horasNecessariasPadrao: 6 }),
      ],
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasGrade: gerarDatas("2026-09-01", 5),
    });

    const op1 = resultado.resultadosPorOp.find((r) => r.chaveTrabalho === "op-1")!;
    const op2 = resultado.resultadosPorOp.find((r) => r.chaveTrabalho === "op-2")!;
    expect(op1.resultado.horasAlocadasPadrao).toBe(6); // processada primeiro - pega tudo que precisa no dia 1
    expect(op2.resultado.alocacoes.find((a) => a.data === "2026-09-01")?.horasPadrao).toBe(2); // só o saldo do dia 1
    expect(op2.resultado.alocacoes.find((a) => a.data === "2026-09-02")?.horasPadrao).toBe(4); // resto no dia 2
  });

  describe("checkpoint: previsão comercial independente da ordem das OPs do orçamento novo", () => {
    // Caso adversarial: OP1 só pode usar recurso-A (sem alternativa).
    // OP2 pode usar recurso-A OU recurso-B (tem alternativa). As duas
    // precisam de toda a capacidade diária de A (4h). Se a OP processada
    // primeiro "vencer" a disputa por A só por estar primeiro no array,
    // a previsão do projeto muda dependendo da ordem: se OP2 (que TINHA
    // alternativa) processar antes e ficar com A, OP1 (que não tinha
    // alternativa nenhuma) é empurrada para o dia seguinte - pior
    // resultado agregado do que se OP1 tivesse sido atendida em A e OP2
    // desviada para B, que tinha de sobra.
    function fixtureAdversarial(ordemNecessidades: NecessidadeCapacidadeFlexivel[]) {
      return avaliarPrevisaoComercialFlexivel({
        dataSolicitadaCliente: "2026-09-10",
        compromissosConfirmados: [],
        necessidadesOrcamentoNovo: ordemNecessidades,
        capacidadesNormais: capacidadesMap([capacidade("recurso-A", 4), capacidade("recurso-B", 100)]),
        capacidadeExtraAutorizada: [],
        temporariosPorPrioridade: [],
        datasGrade: gerarDatas("2026-09-01", 5),
      });
    }

    it("resultado agregado (primeira entrega, horas totais, recursos usados) é o mesmo nas duas ordens de entrada", () => {
      const op1SemAlternativa = necessidade({ chaveTrabalho: "op-1", recursoOriginalId: "recurso-A", recursosCompativeisPorPrioridade: [], horasNecessariasPadrao: 4 });
      const op2ComAlternativa = necessidade({ chaveTrabalho: "op-2", recursoOriginalId: "recurso-A", recursosCompativeisPorPrioridade: ["recurso-B"], horasNecessariasPadrao: 4 });

      const ordemA = fixtureAdversarial([op1SemAlternativa, op2ComAlternativa]);
      const ordemB = fixtureAdversarial([op2ComAlternativa, op1SemAlternativa]);

      expect(ordemA.primeiraEntregaPossivel).toBe(ordemB.primeiraEntregaPossivel);
      expect(ordemA.atendeDataSolicitada).toBe(ordemB.atendeDataSolicitada);
      const horasA = ordemA.resultadosPorOp.reduce((s, r) => s + r.resultado.horasAlocadasPadrao, 0);
      const horasB = ordemB.resultadosPorOp.reduce((s, r) => s + r.resultado.horasAlocadasPadrao, 0);
      expect(horasA).toBe(horasB);
      const recursosA = new Set(ordemA.resultadosPorOp.flatMap((r) => r.resultado.recursosEfetivamenteUsados));
      const recursosB = new Set(ordemB.resultadosPorOp.flatMap((r) => r.resultado.recursosEfetivamenteUsados));
      expect(recursosA).toEqual(recursosB);
    });

    it("a OP sem alternativa nunca é penalizada por uma OP com alternativa que \"chegou primeiro\" no array - a previsão continua sendo o melhor resultado agregado possível (Dia 1), nas duas ordens", () => {
      const op1SemAlternativa = necessidade({ chaveTrabalho: "op-1", recursoOriginalId: "recurso-A", recursosCompativeisPorPrioridade: [], horasNecessariasPadrao: 4 });
      const op2ComAlternativa = necessidade({ chaveTrabalho: "op-2", recursoOriginalId: "recurso-A", recursosCompativeisPorPrioridade: ["recurso-B"], horasNecessariasPadrao: 4 });

      const ordemA = fixtureAdversarial([op1SemAlternativa, op2ComAlternativa]);
      const ordemB = fixtureAdversarial([op2ComAlternativa, op1SemAlternativa]);

      // O melhor resultado agregado possível é Dia 1 (OP1 fica com A,
      // OP2 desvia para B, que tem sobra) - nunca Dia 2 (o que
      // aconteceria se a OP com alternativa "roubasse" A da OP sem
      // alternativa só por vir primeiro no array).
      expect(ordemA.primeiraEntregaPossivel).toBe("2026-09-01");
      expect(ordemB.primeiraEntregaPossivel).toBe("2026-09-01");
    });

    it("com 3 OPs e várias permutações de entrada, o resultado agregado nunca muda", () => {
      const opSemAlternativa = necessidade({ chaveTrabalho: "op-sem-alt", recursoOriginalId: "recurso-A", recursosCompativeisPorPrioridade: [], horasNecessariasPadrao: 4 });
      const opComAlternativa1 = necessidade({ chaveTrabalho: "op-com-alt-1", recursoOriginalId: "recurso-A", recursosCompativeisPorPrioridade: ["recurso-B"], horasNecessariasPadrao: 4 });
      const opComAlternativa2 = necessidade({ chaveTrabalho: "op-com-alt-2", recursoOriginalId: "recurso-A", recursosCompativeisPorPrioridade: ["recurso-B"], horasNecessariasPadrao: 4 });

      const permutacoes = [
        [opSemAlternativa, opComAlternativa1, opComAlternativa2],
        [opComAlternativa1, opSemAlternativa, opComAlternativa2],
        [opComAlternativa1, opComAlternativa2, opSemAlternativa],
        [opComAlternativa2, opComAlternativa1, opSemAlternativa],
      ];

      const resultados = permutacoes.map((ordem) => fixtureAdversarial(ordem));
      const primeirasEntregas = new Set(resultados.map((r) => r.primeiraEntregaPossivel));
      expect(primeirasEntregas.size).toBe(1); // 1 valor só, independente da permutação
    });
  });

  it("confirmados ficam fixos no recurso congelado - nunca usam substituição, só o orçamento novo pode", () => {
    // O confirmado esgota recurso-A no Dia 1 inteiro. recurso-B está
    // livre (capacidade de sobra), mas o confirmado NUNCA tem lista de
    // compatíveis (CompromissoCapacidade não carrega isso) - seu déficit
    // eventual (se houvesse) nunca "vaza" para B. Só a OP do orçamento
    // novo, que declara recurso-B como compatível, pode usar B.
    const resultado = avaliarPrevisaoComercialFlexivel({
      dataSolicitadaCliente: "2026-09-10",
      compromissosConfirmados: [confirmado({ recursoId: "recurso-A", horasRestantesPadrao: 4 })],
      necessidadesOrcamentoNovo: [necessidade({ recursoOriginalId: "recurso-A", recursosCompativeisPorPrioridade: ["recurso-B"], horasNecessariasPadrao: 4 })],
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 4), capacidade("recurso-B", 100)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasGrade: gerarDatas("2026-09-01", 5),
    });

    // Recurso-A esgotado pelo confirmado no Dia 1 - a OP do orçamento novo desvia inteiramente para o compatível B, no mesmo dia.
    const alocacoes = resultado.resultadosPorOp[0].resultado.alocacoes;
    expect(alocacoes.every((a) => a.recursoId === "recurso-B")).toBe(true);
    expect(resultado.primeiraEntregaPossivel).toBe("2026-09-01");
  });

  it("8. cenários avaliados sobre bases independentes: sem contaminação entre chamadas", () => {
    const params = {
      dataSolicitadaCliente: "2026-09-10",
      compromissosConfirmados: [confirmado({ horasRestantesPadrao: 4 })],
      necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 4 })],
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasGrade: gerarDatas("2026-09-01", 5),
    };

    const resultado1 = avaliarPrevisaoComercialFlexivel(params);
    // "Cenário" bem diferente entre as duas chamadas.
    avaliarPrevisaoComercialFlexivel({
      ...params,
      compromissosConfirmados: [confirmado({ horasRestantesPadrao: 8 })],
      necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 500 })],
    });
    const resultado2 = avaliarPrevisaoComercialFlexivel(params);

    expect(resultado1).toEqual(resultado2);
  });

  describe("Etapa A - diasProdutivos (correção de calendário)", () => {
    function extra(overrides: Partial<CapacidadeExtraDia> = {}): CapacidadeExtraDia {
      return {
        recursoId: "recurso-A",
        data: "2026-09-01",
        horasAdicionaisDisponiveis: 8,
        natureza: "sabado",
        elegibilidade: { escopo: "qualquer_projeto_do_cenario" },
        contratacaoId: "contratacao-1",
        ...overrides,
      };
    }

    it("diasProdutivos omitido (default): toda data de datasGrade é tratada como produtiva - comportamento idêntico ao de antes desta correção", () => {
      const resultado = avaliarPrevisaoComercialFlexivel({
        dataSolicitadaCliente: "2026-09-10",
        compromissosConfirmados: [],
        necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 8 })],
        capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
        capacidadeExtraAutorizada: [],
        temporariosPorPrioridade: [],
        datasGrade: gerarDatas("2026-09-01", 5),
        // diasProdutivos OMITIDO de propósito.
      });

      expect(resultado.primeiraEntregaPossivel).toBe("2026-09-01");
    });

    it("data em datasGrade mas FORA de diasProdutivos: capacidade normal é 0h nessa data - a OP desliza para a próxima data produtiva", () => {
      const resultado = avaliarPrevisaoComercialFlexivel({
        dataSolicitadaCliente: "2026-09-10",
        compromissosConfirmados: [],
        necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 8 })],
        capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
        capacidadeExtraAutorizada: [],
        temporariosPorPrioridade: [],
        datasGrade: gerarDatas("2026-09-01", 5),
        diasProdutivos: new Set(["2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]), // 09-01 fora (ex.: domingo)
      });

      expect(resultado.resultadosPorOp[0].resultado.alocacoes[0].data).toBe("2026-09-02");
    });

    it("capacidade adicional continua disponível numa data FORA de diasProdutivos - é o mecanismo que viabiliza hora extra num sábado/feriado", () => {
      const resultado = avaliarPrevisaoComercialFlexivel({
        dataSolicitadaCliente: "2026-09-10",
        compromissosConfirmados: [],
        necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 8 })],
        capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
        capacidadeExtraAutorizada: [extra({ data: "2026-09-01", horasAdicionaisDisponiveis: 8 })],
        temporariosPorPrioridade: [],
        datasGrade: gerarDatas("2026-09-01", 5),
        diasProdutivos: new Set(["2026-09-02"]), // 09-01 (data da hora extra) fica FORA - normal não existe ali
      });

      // Mesmo com normal=0h em 09-01, a hora extra autorizada cobre a OP inteira nessa mesma data.
      expect(resultado.primeiraEntregaPossivel).toBe("2026-09-01");
      const alocacao = resultado.resultadosPorOp[0].resultado.alocacoes[0];
      expect(alocacao.data).toBe("2026-09-01");
      expect(alocacao.tipoCapacidade).toBe("adicional");
    });

    it("data produtiva COM hora extra autorizada no mesmo dia: as duas faixas somam, sem dupla contagem (sábado produtivo + hora extra)", () => {
      const resultado = avaliarPrevisaoComercialFlexivel({
        dataSolicitadaCliente: "2026-09-10",
        compromissosConfirmados: [],
        necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 12 })], // > 8h normais do dia - só fecha usando as 2 faixas
        capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
        capacidadeExtraAutorizada: [extra({ data: "2026-09-01", horasAdicionaisDisponiveis: 4 })],
        temporariosPorPrioridade: [],
        datasGrade: gerarDatas("2026-09-01", 5),
        diasProdutivos: new Set(["2026-09-01"]), // sábado marcado como produtivo (dia_trabalhado_excepcional)
      });

      expect(resultado.primeiraEntregaPossivel).toBe("2026-09-01"); // as 12h inteiras couberam no mesmo dia
      const alocacoes = resultado.resultadosPorOp[0].resultado.alocacoes;
      const porTipo = new Map(alocacoes.map((a) => [a.tipoCapacidade, a.horasPadrao]));
      expect(porTipo.get("normal_original")).toBe(8); // faixa normal cheia (dia produtivo)
      expect(porTipo.get("adicional")).toBe(4); // faixa extra, por cima, sem sobrepor a normal
    });

    it("confirmados e orçamento novo respeitam o MESMO diasProdutivos - nenhum dos dois consome capacidade normal numa data fora do calendário", () => {
      const resultado = avaliarPrevisaoComercialFlexivel({
        dataSolicitadaCliente: "2026-09-10",
        compromissosConfirmados: [confirmado({ horasRestantesPadrao: 8 })],
        necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 8 })],
        capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
        capacidadeExtraAutorizada: [],
        temporariosPorPrioridade: [],
        datasGrade: gerarDatas("2026-09-01", 5),
        diasProdutivos: new Set(["2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]), // 09-01 fora para os dois lados
      });

      // Se confirmados e orçamento novo usassem calendários diferentes, o
      // confirmado teria "consumido" 09-01 (data fora do calendário) e a
      // OP do orçamento novo começaria em 09-02 sozinha (competindo com
      // nada) - em vez disso, os dois pulam 09-01 igualmente e disputam
      // 09-02 juntos, como concorrentes reais pela mesma capacidade.
      expect(resultado.resultadosPorOp[0].resultado.alocacoes[0].data).toBe("2026-09-03"); // confirmado pega 09-02, OP fica com 09-03
    });
  });
});
