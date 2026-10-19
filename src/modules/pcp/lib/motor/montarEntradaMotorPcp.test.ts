// PCP-P8D.1: testes automatizados do assembler, sem dados reais, sem
// banco (cliente Supabase falso, mesma filosofia de
// criarClienteCalendarioFalso.ts), sem executar o Motor.
import { describe, expect, it } from "vitest";
import { montarEntradaMotorPcp } from "./montarEntradaMotorPcp";
import { criarClientePcpFalso, fixturePcpVazia, type FixturePcp } from "./testHelpers/criarClientePcpFalso";

const EMPRESA_A = "empresa-a";
const EMPRESA_B = "empresa-b";
const USER_A = "user-a";
const USER_B = "user-b";
const GRADE_BASE = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];

function usuarioPadrao(fixture: FixturePcp, id: string, empresaId: string): void {
  fixture.usuarios.push({ id, empresa_id: empresaId });
}

/** Calendário "sempre produtivo" (sem feriados/eventos, todo dia da semana útil) - suficiente para a maioria dos testes, que não são sobre calendário em si. */
function marcarCalendarioSempreProdutivo(fixture: FixturePcp, empresaId: string): void {
  fixture.calendario_operacional_empresa.push({
    empresa_id: empresaId,
    segunda: true,
    terca: true,
    quarta: true,
    quinta: true,
    sexta: true,
    sabado: true,
    domingo: true,
  });
  fixture.empresas.push({ id: empresaId, pais_codigo: null, uf_codigo: null, municipio_codigo: null });
}

function filaPadrao(fixture: FixturePcp, empresaId: string, projetoId: string, posicao = 1000): void {
  fixture.pcp_fila_projetos.push({ empresa_id: empresaId, projeto_id: projetoId, posicao });
}

function ofPadrao(
  fixture: FixturePcp,
  overrides: Partial<FixturePcp["ordens_fabricacao"][number]> & { id: string; projeto_id: string },
): void {
  fixture.ordens_fabricacao.push({
    empresa_id: EMPRESA_A,
    quantidade_planejada: 10,
    estado_aprovacao: "aprovada",
    estado_execucao: "em_producao",
    ...overrides,
  });
}

function opPadrao(
  fixture: FixturePcp,
  overrides: Partial<FixturePcp["ordens_fabricacao_operacoes"][number]> & { id: string; of_id: string },
): void {
  fixture.ordens_fabricacao_operacoes.push({
    nao_aplicavel: false,
    bom_operacao_id: null,
    recurso_vigente_id: "rec-1",
    tempo_vigente_minutos: 60,
    tempo_restante_estimado_minutos: null,
    recurso_restante_estimado_id: null,
    ...overrides,
  });
}

function recursoPadrao(fixture: FixturePcp, id = "rec-1", capacidadeHorasDia = 8): void {
  if (!fixture.recursos_produtivos.some((r) => r.id === id)) {
    fixture.recursos_produtivos.push({ id, capacidade_horas_dia: capacidadeHorasDia });
  }
}

describe("montarEntradaMotorPcp — PCP-P8D.1", () => {
  it("OP nunca iniciada: carga = tempo_vigente_minutos/60 × quantidade_planejada da OF (nunca o saldo)", async () => {
    const fixture = fixturePcpVazia();
    marcarCalendarioSempreProdutivo(fixture, EMPRESA_A);
    usuarioPadrao(fixture, USER_A, EMPRESA_A);
    filaPadrao(fixture, EMPRESA_A, "proj-1");
    ofPadrao(fixture, { id: "of-1", projeto_id: "proj-1", quantidade_planejada: 10 });
    opPadrao(fixture, { id: "op-1", of_id: "of-1", tempo_vigente_minutos: 60 }); // 60min/peça x 10 = 600min = 10h
    recursoPadrao(fixture);

    const entrada = await montarEntradaMotorPcp(criarClientePcpFalso(fixture), USER_A, GRADE_BASE);

    expect(entrada.excluidas).toEqual([]);
    expect(entrada.ocorrencias).toHaveLength(1);
    expect(entrada.ocorrencias[0].chave.opId).toBe("op-1");
    expect(entrada.ocorrencias[0].necessarioHorasPadrao).toBeCloseTo(10, 6);
  });

  it("OP iniciada com saldo estimado: carga = tempo_restante_estimado_minutos TOTAL, nunca multiplicado pela quantidade (DEC-P8-02)", async () => {
    const fixture = fixturePcpVazia();
    marcarCalendarioSempreProdutivo(fixture, EMPRESA_A);
    usuarioPadrao(fixture, USER_A, EMPRESA_A);
    filaPadrao(fixture, EMPRESA_A, "proj-1");
    ofPadrao(fixture, { id: "of-1", projeto_id: "proj-1", quantidade_planejada: 10 });
    opPadrao(fixture, { id: "op-1", of_id: "of-1", tempo_vigente_minutos: 60, tempo_restante_estimado_minutos: 210 });
    recursoPadrao(fixture);
    fixture.eventosEfetivosPorOp["op-1"] = [{ tipo_evento: "iniciar" }];

    const entrada = await montarEntradaMotorPcp(criarClientePcpFalso(fixture), USER_A, GRADE_BASE);

    expect(entrada.ocorrencias).toHaveLength(1);
    // 210 minutos totais / 60 = 3.5h - NUNCA 210 * 10.
    expect(entrada.ocorrencias[0].necessarioHorasPadrao).toBeCloseTo(3.5, 6);
  });

  it("fecho transitivo de dados insuficientes: OP10 sem saldo bloqueia OP20 e OP30 (transitiva), OP40 independente permanece", async () => {
    const fixture = fixturePcpVazia();
    marcarCalendarioSempreProdutivo(fixture, EMPRESA_A);
    usuarioPadrao(fixture, USER_A, EMPRESA_A);
    filaPadrao(fixture, EMPRESA_A, "proj-1");
    ofPadrao(fixture, { id: "of-1", projeto_id: "proj-1" });
    opPadrao(fixture, { id: "op-10", of_id: "of-1" });
    opPadrao(fixture, { id: "op-20", of_id: "of-1" });
    opPadrao(fixture, { id: "op-30", of_id: "of-1" });
    opPadrao(fixture, { id: "op-40", of_id: "of-1" }); // independente
    recursoPadrao(fixture);

    fixture.of_operacao_dependencias.push(
      { op_origem_id: "op-10", op_dependente_id: "op-20" },
      { op_origem_id: "op-20", op_dependente_id: "op-30" },
    );
    // OP10 iniciada, SEM saldo estimado -> dados insuficientes.
    fixture.eventosEfetivosPorOp["op-10"] = [{ tipo_evento: "iniciar" }];

    const entrada = await montarEntradaMotorPcp(criarClientePcpFalso(fixture), USER_A, GRADE_BASE);

    const idsOcorrencias = entrada.ocorrencias.map((oc) => oc.chave.opId).sort();
    expect(idsOcorrencias).toEqual(["op-40"]); // só a independente sobra

    const motivosPorOp = Object.fromEntries(entrada.excluidas.map((e) => [e.opId, e.motivo]));
    expect(motivosPorOp["op-10"]).toBe("iniciada_sem_saldo_estimado");
    expect(motivosPorOp["op-20"]).toBe("bloqueada_por_antecessora_com_dados_insuficientes");
    expect(motivosPorOp["op-30"]).toBe("bloqueada_por_antecessora_com_dados_insuficientes");
    expect(motivosPorOp["op-40"]).toBeUndefined();

    // Nenhuma dependência residual aponta para uma ocorrência ausente.
    expect(entrada.dependencias).toEqual([]);
  });

  it("predecessora RESOLVIDA nunca bloqueia a sucessora (resolvida != dados insuficientes)", async () => {
    const fixture = fixturePcpVazia();
    marcarCalendarioSempreProdutivo(fixture, EMPRESA_A);
    usuarioPadrao(fixture, USER_A, EMPRESA_A);
    filaPadrao(fixture, EMPRESA_A, "proj-1");
    ofPadrao(fixture, { id: "of-1", projeto_id: "proj-1" });
    opPadrao(fixture, { id: "op-50", of_id: "of-1" });
    opPadrao(fixture, { id: "op-60", of_id: "of-1" });
    recursoPadrao(fixture);

    fixture.of_operacao_dependencias.push({ op_origem_id: "op-50", op_dependente_id: "op-60" });
    fixture.opResolvida["op-50"] = true;
    fixture.eventosEfetivosPorOp["op-50"] = [{ tipo_evento: "iniciar" }, { tipo_evento: "finalizar" }];

    const entrada = await montarEntradaMotorPcp(criarClientePcpFalso(fixture), USER_A, GRADE_BASE);

    const idsOcorrencias = entrada.ocorrencias.map((oc) => oc.chave.opId).sort();
    expect(idsOcorrencias).toEqual(["op-60"]); // op-50 resolvida não entra, mas também não é "exclusão" nem bloqueia op-60
    expect(entrada.excluidas).toEqual([]);
    // op-50 resolvida: dependência para ela não é entregue ao Motor (predecessora ausente do conjunto final).
    expect(entrada.dependencias).toEqual([]);
  });

  it("recurso primário ausente (null/null) é exclusão explícita, nunca candidatoIdsPorPrioridade vazio silencioso", async () => {
    const fixture = fixturePcpVazia();
    marcarCalendarioSempreProdutivo(fixture, EMPRESA_A);
    usuarioPadrao(fixture, USER_A, EMPRESA_A);
    filaPadrao(fixture, EMPRESA_A, "proj-1");
    ofPadrao(fixture, { id: "of-1", projeto_id: "proj-1" });
    opPadrao(fixture, { id: "op-sem-recurso", of_id: "of-1", recurso_vigente_id: null, recurso_restante_estimado_id: null });

    const entrada = await montarEntradaMotorPcp(criarClientePcpFalso(fixture), USER_A, GRADE_BASE);

    expect(entrada.ocorrencias).toEqual([]);
    expect(entrada.excluidas).toEqual([{ opId: "op-sem-recurso", motivo: "recurso_vigente_ausente_ou_invalido" }]);
  });

  it("recurso primário sem capacidade cadastrada é exclusão explícita (mesmo motivo)", async () => {
    const fixture = fixturePcpVazia();
    marcarCalendarioSempreProdutivo(fixture, EMPRESA_A);
    usuarioPadrao(fixture, USER_A, EMPRESA_A);
    filaPadrao(fixture, EMPRESA_A, "proj-1");
    ofPadrao(fixture, { id: "of-1", projeto_id: "proj-1" });
    opPadrao(fixture, { id: "op-recurso-invalido", of_id: "of-1", recurso_vigente_id: "rec-inexistente" });
    // Nenhum recurso cadastrado em recursos_produtivos - "rec-inexistente" nunca resolve capacidade.

    const entrada = await montarEntradaMotorPcp(criarClientePcpFalso(fixture), USER_A, GRADE_BASE);

    expect(entrada.ocorrencias).toEqual([]);
    expect(entrada.excluidas).toEqual([{ opId: "op-recurso-invalido", motivo: "recurso_vigente_ausente_ou_invalido" }]);
  });

  it("prioridade vem da posição na fila PCP (menor posição = maior prioridade), nunca de projetos.prioridade", async () => {
    const fixture = fixturePcpVazia();
    marcarCalendarioSempreProdutivo(fixture, EMPRESA_A);
    usuarioPadrao(fixture, USER_A, EMPRESA_A);
    filaPadrao(fixture, EMPRESA_A, "proj-alta", 500);
    filaPadrao(fixture, EMPRESA_A, "proj-baixa", 2000);
    ofPadrao(fixture, { id: "of-alta", projeto_id: "proj-alta" });
    ofPadrao(fixture, { id: "of-baixa", projeto_id: "proj-baixa" });
    opPadrao(fixture, { id: "op-alta", of_id: "of-alta" });
    opPadrao(fixture, { id: "op-baixa", of_id: "of-baixa" });
    recursoPadrao(fixture);

    const entrada = await montarEntradaMotorPcp(criarClientePcpFalso(fixture), USER_A, GRADE_BASE);

    const ocAlta = entrada.ocorrencias.find((oc) => oc.chave.opId === "op-alta")!;
    const ocBaixa = entrada.ocorrencias.find((oc) => oc.chave.opId === "op-baixa")!;
    expect(entrada.criterioPrioridadeDeNegocio(ocAlta)).toBe(500);
    expect(entrada.criterioPrioridadeDeNegocio(ocBaixa)).toBe(2000);
    expect(entrada.criterioPrioridadeDeNegocio(ocAlta)).toBeLessThan(entrada.criterioPrioridadeDeNegocio(ocBaixa));
  });

  it("isolamento multiempresa: nada da empresa B aparece ao consultar a empresa A", async () => {
    const fixture = fixturePcpVazia();
    marcarCalendarioSempreProdutivo(fixture, EMPRESA_A);
    usuarioPadrao(fixture, USER_A, EMPRESA_A);
    marcarCalendarioSempreProdutivo(fixture, EMPRESA_B);
    usuarioPadrao(fixture, USER_B, EMPRESA_B);
    filaPadrao(fixture, EMPRESA_A, "proj-a");
    filaPadrao(fixture, EMPRESA_B, "proj-b");
    ofPadrao(fixture, { id: "of-a", projeto_id: "proj-a", empresa_id: EMPRESA_A });
    ofPadrao(fixture, { id: "of-b", projeto_id: "proj-b", empresa_id: EMPRESA_B });
    opPadrao(fixture, { id: "op-a", of_id: "of-a" });
    opPadrao(fixture, { id: "op-b", of_id: "of-b" });
    recursoPadrao(fixture);

    const entradaA = await montarEntradaMotorPcp(criarClientePcpFalso(fixture), USER_A, GRADE_BASE);

    expect(entradaA.ocorrencias.map((oc) => oc.chave.opId)).toEqual(["op-a"]);
  });

  it("capacidade respeita o calendário real da empresa: dia marcado como não produtivo zera a faixa normal do recurso", async () => {
    const fixture = fixturePcpVazia();
    const dataTeste = "2026-11-14";
    const diaSemana = new Date(`${dataTeste}T00:00:00Z`).getUTCDay(); // 0=domingo..6=sábado
    const colunas = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"] as const;

    fixture.calendario_operacional_empresa.push({
      empresa_id: EMPRESA_A,
      segunda: true,
      terca: true,
      quarta: true,
      quinta: true,
      sexta: true,
      sabado: true,
      domingo: true,
      [colunas[diaSemana]]: false, // só este dia da semana é marcado como não produtivo
    } as FixturePcp["calendario_operacional_empresa"][number]);
    fixture.empresas.push({ id: EMPRESA_A, pais_codigo: null, uf_codigo: null, municipio_codigo: null });
    usuarioPadrao(fixture, USER_A, EMPRESA_A);

    filaPadrao(fixture, EMPRESA_A, "proj-1");
    ofPadrao(fixture, { id: "of-1", projeto_id: "proj-1" });
    opPadrao(fixture, { id: "op-1", of_id: "of-1" });
    recursoPadrao(fixture, "rec-1", 8);

    const entrada = await montarEntradaMotorPcp(criarClientePcpFalso(fixture), USER_A, GRADE_BASE);

    const candidato = entrada.registroCandidatos.get("rec-1")!;
    expect(candidato.faixasDoDia(dataTeste)).toEqual([]); // dia não produtivo -> sem faixa normal
    const outraData = GRADE_BASE.find((d) => d !== dataTeste)!;
    const diaSemanaOutra = new Date(`${outraData}T00:00:00Z`).getUTCDay();
    if (diaSemanaOutra !== diaSemana) {
      expect(candidato.faixasDoDia(outraData)).toEqual([
        { natureza: "normal", horasDisponiveis: 8, contratacaoId: null, elegibilidade: null },
      ]);
    }
  });

  it("OF fora dos estados elegíveis (ex.: planejada) não entra, mesmo com Projeto na fila", async () => {
    const fixture = fixturePcpVazia();
    marcarCalendarioSempreProdutivo(fixture, EMPRESA_A);
    usuarioPadrao(fixture, USER_A, EMPRESA_A);
    filaPadrao(fixture, EMPRESA_A, "proj-1");
    ofPadrao(fixture, { id: "of-planejada", projeto_id: "proj-1", estado_execucao: "planejada" });
    opPadrao(fixture, { id: "op-1", of_id: "of-planejada" });
    recursoPadrao(fixture);

    const entrada = await montarEntradaMotorPcp(criarClientePcpFalso(fixture), USER_A, GRADE_BASE);

    expect(entrada.ocorrencias).toEqual([]);
    expect(entrada.excluidas).toEqual([]); // nem chega a ser "excluída" - a OF nunca foi elegível
  });

  it("OP nao_aplicavel=true nunca entra no conjunto", async () => {
    const fixture = fixturePcpVazia();
    marcarCalendarioSempreProdutivo(fixture, EMPRESA_A);
    usuarioPadrao(fixture, USER_A, EMPRESA_A);
    filaPadrao(fixture, EMPRESA_A, "proj-1");
    ofPadrao(fixture, { id: "of-1", projeto_id: "proj-1" });
    opPadrao(fixture, { id: "op-na", of_id: "of-1", nao_aplicavel: true });
    recursoPadrao(fixture);

    const entrada = await montarEntradaMotorPcp(criarClientePcpFalso(fixture), USER_A, GRADE_BASE);

    expect(entrada.ocorrencias).toEqual([]);
  });
});
