import { describe, expect, it } from "vitest";
import { construirProgramacaoPorRecursoEDia } from "./construirProgramacaoPorRecursoEDia";
import type {
  AlocacaoProgramacaoVigentePcp,
  OperacaoProgramacaoVigentePcp,
  ProgramacaoVigentePcp,
} from "./buscarProgramacaoVigentePcp";

function alocacao(overrides: Partial<AlocacaoProgramacaoVigentePcp> = {}): AlocacaoProgramacaoVigentePcp {
  return {
    data: "2026-10-26",
    recursoId: "recurso-1",
    nomeRecurso: "Torno CNC 01",
    natureza: "normal",
    horasMaquina: 3,
    horasPadrao: 3,
    ...overrides,
  };
}

function operacao(overrides: Partial<OperacaoProgramacaoVigentePcp> = {}): OperacaoProgramacaoVigentePcp {
  return {
    opId: "op-1",
    codigoOperacional: "OP10",
    descricaoOperacao: "Torneamento externo",
    ofId: "of-1",
    numeroOf: "260001-0001",
    projetoId: "projeto-1",
    numeroProjeto: "260001",
    nomeProjeto: "Projeto 1",
    prioridadeUsada: 1,
    statusCalculoMotor: "concluida",
    dataInicioPrevista: "2026-10-26",
    dataFimPrevista: "2026-10-26",
    deficitResidualHorasPadrao: 0,
    alocacoes: [alocacao()],
    ...overrides,
  };
}

function programacao(operacoes: OperacaoProgramacaoVigentePcp[]): ProgramacaoVigentePcp {
  return {
    programacaoId: "programacao-1",
    versaoSequencial: 1,
    empresaCapacidadeVersaoOrigem: 1,
    nomeEmpresa: "Empresa Fictícia Teste",
    janelaInicio: "2026-10-26",
    janelaFim: "2026-11-01",
    criadaEm: "2026-10-25T10:00:00Z",
    criadaPor: "adm-1",
    motivo: null,
    operacoes,
    versaoCapacidadeAtual: 1,
  };
}

describe("construirProgramacaoPorRecursoEDia", () => {
  it("caso especial: programação vigente ausente devolve null", () => {
    expect(construirProgramacaoPorRecursoEDia(null)).toBeNull();
  });

  it("caso especial: programação existente sem operações devolve grupos e bloqueadas vazios", () => {
    const resultado = construirProgramacaoPorRecursoEDia(programacao([]));
    expect(resultado).toEqual({
      programacaoId: "programacao-1",
      versaoSequencial: 1,
      nomeEmpresa: "Empresa Fictícia Teste",
      janelaInicio: "2026-10-26",
      janelaFim: "2026-11-01",
      grupos: [],
      operacoesSemAlocacao: [],
    });
  });

  it("teste 1: projeto de prioridade superior (prioridadeUsada menor) vem antes mesmo com numero_of maior", () => {
    const opPrioritariaNumeroMaior = operacao({
      opId: "op-prioritaria",
      numeroOf: "260030-0001", // textualmente MAIOR
      prioridadeUsada: 1, // MELHOR prioridade (posição 1 na fila do PCP)
      alocacoes: [alocacao({ recursoId: "recurso-X" })],
    });
    const opSecundariaNumeroMenor = operacao({
      opId: "op-secundaria",
      numeroOf: "260001-0001", // textualmente MENOR
      prioridadeUsada: 5, // PIOR prioridade
      alocacoes: [alocacao({ recursoId: "recurso-X" })],
    });

    const resultado = construirProgramacaoPorRecursoEDia(programacao([opSecundariaNumeroMenor, opPrioritariaNumeroMaior]));
    const grupo = resultado!.grupos[0];
    expect(grupo.itens.map((i) => i.opId)).toEqual(["op-prioritaria", "op-secundaria"]);
    expect(grupo.itens.map((i) => i.ordemApresentacao)).toEqual([1, 2]);
  });

  it("teste 2: dois projetos disputando o mesmo recurso aparecem no mesmo grupo", () => {
    const opProjetoA = operacao({ opId: "op-a", projetoId: "projeto-a", numeroProjeto: "260010", alocacoes: [alocacao({ recursoId: "recurso-1" })] });
    const opProjetoB = operacao({ opId: "op-b", projetoId: "projeto-b", numeroProjeto: "260020", alocacoes: [alocacao({ recursoId: "recurso-1" })] });

    const resultado = construirProgramacaoPorRecursoEDia(programacao([opProjetoA, opProjetoB]));
    expect(resultado!.grupos).toHaveLength(1);
    expect(resultado!.grupos[0].itens).toHaveLength(2);
    expect(new Set(resultado!.grupos[0].itens.map((i) => i.projetoId))).toEqual(new Set(["projeto-a", "projeto-b"]));
  });

  it("teste 3: uma OF com operações em três recursos produz três grupos, nenhum recebendo tudo", () => {
    const mesmaOf = { ofId: "of-tres-recursos", numeroOf: "260001-0005" };
    const opSerra = operacao({ ...mesmaOf, opId: "op-serra", alocacoes: [alocacao({ recursoId: "serra", nomeRecurso: "Serra" })] });
    const opTorno = operacao({ ...mesmaOf, opId: "op-torno", alocacoes: [alocacao({ recursoId: "torno", nomeRecurso: "Torno CNC 01" })] });
    const opCentro = operacao({ ...mesmaOf, opId: "op-centro", alocacoes: [alocacao({ recursoId: "centro", nomeRecurso: "Centro de Usinagem" })] });

    const resultado = construirProgramacaoPorRecursoEDia(programacao([opSerra, opTorno, opCentro]));
    expect(resultado!.grupos).toHaveLength(3);
    for (const grupo of resultado!.grupos) {
      expect(grupo.itens).toHaveLength(1);
      expect(grupo.itens[0].ofId).toBe("of-tres-recursos");
    }
  });

  it("teste 4: uma OP distribuída em dois dias aparece nos dois dias correspondentes", () => {
    const opDoisDias = operacao({
      opId: "op-dois-dias",
      alocacoes: [
        alocacao({ data: "2026-10-26", horasPadrao: 4 }),
        alocacao({ data: "2026-10-27", horasPadrao: 4 }),
      ],
    });

    const resultado = construirProgramacaoPorRecursoEDia(programacao([opDoisDias]));
    expect(resultado!.grupos).toHaveLength(2);
    expect(resultado!.grupos.map((g) => g.data)).toEqual(["2026-10-26", "2026-10-27"]);
    expect(resultado!.grupos.every((g) => g.itens[0].opId === "op-dois-dias")).toBe(true);
  });

  it("teste 5: duas OPs alocadas no mesmo recurso e dia ficam no mesmo grupo, com ordem de apresentação 1 e 2", () => {
    const op1 = operacao({ opId: "op-1", prioridadeUsada: 2, alocacoes: [alocacao({ recursoId: "recurso-unico" })] });
    const op2 = operacao({ opId: "op-2", prioridadeUsada: 1, alocacoes: [alocacao({ recursoId: "recurso-unico" })] });

    const resultado = construirProgramacaoPorRecursoEDia(programacao([op1, op2]));
    expect(resultado!.grupos).toHaveLength(1);
    expect(resultado!.grupos[0].itens.map((i) => i.opId)).toEqual(["op-2", "op-1"]);
    expect(resultado!.grupos[0].itens.map((i) => i.ordemApresentacao)).toEqual([1, 2]);
  });

  it("teste 6: soma exata das horas, sem duplicidade", () => {
    const opA = operacao({ opId: "op-a", alocacoes: [alocacao({ recursoId: "r1", horasPadrao: 3, horasMaquina: 3 })] });
    const opB = operacao({ opId: "op-b", alocacoes: [alocacao({ recursoId: "r1", horasPadrao: 2.5, horasMaquina: 2.5 })] });

    const resultado = construirProgramacaoPorRecursoEDia(programacao([opA, opB]));
    const totalItens = resultado!.grupos.reduce((soma, g) => soma + g.itens.length, 0);
    const somaHoras = resultado!.grupos.reduce((soma, g) => soma + g.itens.reduce((s, i) => s + i.horasPadrao, 0), 0);
    expect(totalItens).toBe(2);
    expect(somaHoras).toBe(5.5);
  });

  it("teste 7: operação bloqueada (sem alocação) é preservada em operacoesSemAlocacao, nunca escondida", () => {
    const opBloqueada = operacao({
      opId: "op-bloqueada",
      statusCalculoMotor: "bloqueada_por_deficit",
      dataInicioPrevista: null,
      dataFimPrevista: null,
      deficitResidualHorasPadrao: 8,
      alocacoes: [],
    });

    const resultado = construirProgramacaoPorRecursoEDia(programacao([opBloqueada]));
    expect(resultado!.grupos).toHaveLength(0);
    expect(resultado!.operacoesSemAlocacao).toHaveLength(1);
    expect(resultado!.operacoesSemAlocacao[0]).toMatchObject({
      opId: "op-bloqueada",
      statusCalculoMotor: "bloqueada_por_deficit",
      deficitResidualHorasPadrao: 8,
    });
  });

  it("teste 8: OF-mãe desdobrada nunca aparece (já excluída da elegibilidade do Motor, antes desta função) - só as filhas", () => {
    // A mãe (260025-0001) deliberadamente NUNCA aparece na entrada desta
    // função - ela é excluída rio acima, em montarEntradaMotorPcp, porque
    // estado_execucao='desdobrada' não é elegível (só liberada/em_producao).
    // Esta função não precisa (e não deve) saber nada sobre of_pai_id.
    const filha1 = operacao({ opId: "op-filha-1", ofId: "of-filha-1", numeroOf: "260025-0001-01" });
    const filha2 = operacao({ opId: "op-filha-2", ofId: "of-filha-2", numeroOf: "260025-0001-02" });

    const resultado = construirProgramacaoPorRecursoEDia(programacao([filha1, filha2]));
    const numerosOf = resultado!.grupos.flatMap((g) => g.itens.map((i) => i.numeroOf));
    expect(numerosOf.sort()).toEqual(["260025-0001-01", "260025-0001-02"]);
    expect(numerosOf).not.toContain("260025-0001");
  });

  it("teste 9: prioridade usada é sempre a persistida, nunca recalculada", () => {
    const op = operacao({ prioridadeUsada: 7 });
    const resultado = construirProgramacaoPorRecursoEDia(programacao([op]));
    expect(resultado!.grupos[0].itens[0].prioridadeUsada).toBe(7);
  });

  it("teste 10: nenhum horário de início/término é inventado - o item não tem esses campos", () => {
    const resultado = construirProgramacaoPorRecursoEDia(programacao([operacao()]));
    const item = resultado!.grupos[0].itens[0];
    expect("horaInicio" in item).toBe(false);
    expect("horaFim" in item).toBe(false);
    expect("inicio" in item).toBe(false);
    expect("fim" in item).toBe(false);
    expect(Object.keys(item).sort()).toEqual(
      [
        "codigoOperacional",
        "descricaoOperacao",
        "data",
        "natureza",
        "nomeProjeto",
        "nomeRecurso",
        "numeroOf",
        "numeroProjeto",
        "ofId",
        "opId",
        "ordemApresentacao",
        "horasMaquina",
        "horasPadrao",
        "prioridadeUsada",
        "projetoId",
        "recursoId",
        "statusCalculoMotor",
      ].sort(),
    );
  });

  it("teste 11: estabilidade - a mesma entrada produz exatamente o mesmo resultado", () => {
    const entrada = programacao([
      operacao({ opId: "op-a", prioridadeUsada: 2 }),
      operacao({ opId: "op-b", prioridadeUsada: 1, numeroOf: "260002-0001" }),
    ]);

    const resultado1 = construirProgramacaoPorRecursoEDia(entrada);
    const resultado2 = construirProgramacaoPorRecursoEDia(JSON.parse(JSON.stringify(entrada)));
    expect(resultado1).toEqual(resultado2);
  });

  it("teste 12: a função não muta a entrada e não envolve nenhum cálculo do Motor", () => {
    const entrada = programacao([operacao({ alocacoes: [alocacao(), alocacao({ data: "2026-10-27" })] })]);
    const copiaAntes = JSON.parse(JSON.stringify(entrada));

    construirProgramacaoPorRecursoEDia(entrada);

    expect(entrada).toEqual(copiaAntes);
  });

  it("caso especial: OP com várias naturezas de capacidade no mesmo dia gera um item por natureza, sem somar", () => {
    const op = operacao({
      alocacoes: [
        alocacao({ natureza: "normal", horasPadrao: 8, recursoId: "r1" }),
        alocacao({ natureza: "sabado", horasPadrao: 2, recursoId: "r1" }),
      ],
    });

    const resultado = construirProgramacaoPorRecursoEDia(programacao([op]));
    expect(resultado!.grupos).toHaveLength(1);
    expect(resultado!.grupos[0].itens).toHaveLength(2);
    expect(resultado!.grupos[0].itens.map((i) => i.natureza).sort()).toEqual(["normal", "sabado"]);
  });

  it("caso especial: recurso cadastrado sem nome disponível vira null, nunca string vazia disfarçada", () => {
    const op = operacao({ alocacoes: [alocacao({ nomeRecurso: "" })] });
    const resultado = construirProgramacaoPorRecursoEDia(programacao([op]));
    expect(resultado!.grupos[0].nomeRecurso).toBeNull();
    expect(resultado!.grupos[0].itens[0].nomeRecurso).toBeNull();
  });

  it("etapa 2I - teste 1/2: exibe codigo_operacional (OP10/OP20) e descricao corretos, propagados sem alteração", () => {
    const opA = operacao({ opId: "op-a", codigoOperacional: "OP10", descricaoOperacao: "Torneamento externo" });
    const opB = operacao({ opId: "op-b", codigoOperacional: "OP20", descricaoOperacao: "Furação", alocacoes: [alocacao({ recursoId: "r2" })] });

    const resultado = construirProgramacaoPorRecursoEDia(programacao([opA, opB]));
    const todosItens = resultado!.grupos.flatMap((g) => g.itens);
    expect(todosItens.find((i) => i.opId === "op-a")).toMatchObject({ codigoOperacional: "OP10", descricaoOperacao: "Torneamento externo" });
    expect(todosItens.find((i) => i.opId === "op-b")).toMatchObject({ codigoOperacional: "OP20", descricaoOperacao: "Furação" });
  });

  it("etapa 2I: OP sem registro correspondente em ordens_fabricacao_operacoes vira null explícito, nunca inventado", () => {
    const opSemCadastro = operacao({ codigoOperacional: null, descricaoOperacao: null });
    const resultado = construirProgramacaoPorRecursoEDia(programacao([opSemCadastro]));
    expect(resultado!.grupos[0].itens[0].codigoOperacional).toBeNull();
    expect(resultado!.grupos[0].itens[0].descricaoOperacao).toBeNull();
  });

  it("etapa 2I: operação bloqueada também preserva codigo_operacional/descricao", () => {
    const opBloqueada = operacao({
      codigoOperacional: "OP30",
      descricaoOperacao: "Inspeção final",
      statusCalculoMotor: "bloqueada_por_predecessora",
      alocacoes: [],
    });
    const resultado = construirProgramacaoPorRecursoEDia(programacao([opBloqueada]));
    expect(resultado!.operacoesSemAlocacao[0]).toMatchObject({ codigoOperacional: "OP30", descricaoOperacao: "Inspeção final" });
  });

  it("etapa 2L.1: nome da empresa e janela são propagados sem alteração", () => {
    const entrada = programacao([operacao()]);
    const resultado = construirProgramacaoPorRecursoEDia({
      ...entrada,
      nomeEmpresa: "Indústria Fictícia LTDA",
      janelaInicio: "2026-11-02",
      janelaFim: "2026-11-08",
    });
    expect(resultado).toMatchObject({
      nomeEmpresa: "Indústria Fictícia LTDA",
      janelaInicio: "2026-11-02",
      janelaFim: "2026-11-08",
    });
  });

  it("caso especial: mudança de prioridade entre duas versões reflete o valor persistido de cada uma", () => {
    const versaoAntiga = programacao([operacao({ opId: "op-x", prioridadeUsada: 3 })]);
    const versaoNova = programacao([operacao({ opId: "op-x", prioridadeUsada: 1 })]);

    const resultadoAntigo = construirProgramacaoPorRecursoEDia(versaoAntiga);
    const resultadoNovo = construirProgramacaoPorRecursoEDia(versaoNova);

    expect(resultadoAntigo!.grupos[0].itens[0].prioridadeUsada).toBe(3);
    expect(resultadoNovo!.grupos[0].itens[0].prioridadeUsada).toBe(1);
  });
});
