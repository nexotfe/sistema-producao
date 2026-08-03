// Entrega 3 (Calculador Reverso) - Fase 2: integração com o calendário
// REAL (fins de semana, feriados, eventos), usando o mesmo cliente falso
// já estabelecido para o resto do módulo de calendário
// (criarClienteCalendarioFalso.ts) - não reimplementa a regra de
// precedência, só prova que a construção de P e a contagem com
// expansão a reaproveitam corretamente. `criarClienteCalendarioFalsoComContagem`
// prova o custo de consultas: constante, nunca proporcional ao tamanho
// da janela nem ao número de iterações da busca binária.
import { describe, expect, it } from "vitest";
import {
  criarClienteCalendarioFalso,
  criarClienteCalendarioFalsoComContagem,
  type FixtureCalendario,
} from "@/modules/calendario/lib/testHelpers/criarClienteCalendarioFalso";
import {
  MAX_DIAS_CIVIS_BUSCA_REVERSA,
  calcularEstimativaInicioNecessarioComCalendarioReal,
  construirSequenciaDiasProdutivos,
  criarContarDiasProdutivosEntre,
} from "./prepararCalculadorReverso";
import { calcularEstimativaInicioNecessario } from "./estimarInicioNecessario";
import type { BaseFixaMotor } from "./prepararEntradasMotor";

const EMPRESA_ID = "empresa-teste";

const PADRAO_SEGUNDA_A_SEXTA = {
  segunda: true,
  terca: true,
  quarta: true,
  quinta: true,
  sexta: true,
  sabado: false,
  domingo: false,
};

function fixturePadrao(overrides: Partial<FixtureCalendario> = {}): FixtureCalendario {
  return {
    empresaId: EMPRESA_ID,
    padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
    empresa: { pais_codigo: "BR", uf_codigo: "SP", municipio_codigo: null },
    ...overrides,
  };
}

function baseFixaSimples(overrides: Partial<BaseFixaMotor> = {}): BaseFixaMotor {
  return {
    operacoesOrdenadas: [
      { bomOperacaoId: "op-1", recursoOriginalId: "r1", tempoEstimadoMinutos: 60, quantidade: 24 },
    ],
    recursoIds: ["r1"],
    compatibilidades: {},
    capacidadeDiariaPorRecurso: { r1: 8 },
    produtividadePorRecurso: { r1: 1 },
    comprometidoInicialPorRecurso: { r1: 0 },
    ...overrides,
  };
}

// 2026-11-02 = segunda-feira; 2026-11-13 = sexta-feira - duas semanas
// completas (10 dias úteis), mesma referência de data já usada em
// prepararJanelaComercial.test.ts.
const INICIO = "2026-11-02";
const FIM = "2026-11-13";

describe("construirSequenciaDiasProdutivos", () => {
  it("duas semanas completas (padrão segunda-sexta): P tem exatamente os 10 dias úteis, sem os 4 dias de fim de semana", async () => {
    const client = criarClienteCalendarioFalso(fixturePadrao());

    const { P } = await construirSequenciaDiasProdutivos(client, EMPRESA_ID, INICIO, FIM);

    expect(P).toHaveLength(10);
    expect(P).not.toContain("2026-11-07"); // sábado
    expect(P).not.toContain("2026-11-08"); // domingo
    expect(P).not.toContain("2026-11-14"); // sábado seguinte, fora do intervalo
    expect(P[0]).toBe("2026-11-02");
    expect(P[P.length - 1]).toBe("2026-11-13");
    // Ordem ascendente, sem duplicata.
    expect(P).toEqual([...P].sort());
  });

  it("feriado nacional dentro do intervalo é excluído de P", async () => {
    const client = criarClienteCalendarioFalso(
      fixturePadrao({
        feriados: [
          { data: "2026-11-11", abrangencia: "nacional", pais_codigo: "BR", uf_codigo: null, municipio_codigo: null, descricao: "Feriado de teste" },
        ],
      }),
    );

    const { P } = await construirSequenciaDiasProdutivos(client, EMPRESA_ID, INICIO, FIM);

    expect(P).toHaveLength(9); // 10 úteis - 1 feriado
    expect(P).not.toContain("2026-11-11");
    expect(P).toContain("2026-11-10");
    expect(P).toContain("2026-11-12");
  });

  it("evento dia_trabalhado_excepcional num sábado inclui esse dia em P, mesmo contra o padrão semanal", async () => {
    const client = criarClienteCalendarioFalso(
      fixturePadrao({
        eventos: [{ id: "evt-1", data: "2026-11-07", tipo: "dia_trabalhado_excepcional" }], // sábado
      }),
    );

    const { P } = await construirSequenciaDiasProdutivos(client, EMPRESA_ID, INICIO, FIM);

    expect(P).toHaveLength(11); // 10 úteis + 1 sábado excepcional
    expect(P).toContain("2026-11-07");
  });

  it("evento recesso_coletivo numa segunda normalmente produtiva exclui esse dia de P", async () => {
    const client = criarClienteCalendarioFalso(
      fixturePadrao({
        eventos: [{ id: "evt-1", data: "2026-11-09", tipo: "recesso_coletivo" }], // segunda
      }),
    );

    const { P } = await construirSequenciaDiasProdutivos(client, EMPRESA_ID, INICIO, FIM);

    expect(P).toHaveLength(9);
    expect(P).not.toContain("2026-11-09");
  });

  it("sequência de vários dias não produtivos consecutivos (feriado emendado com fim de semana) - P pula todos sem erro de contagem", async () => {
    // Sexta 2026-11-06 vira feriado, emendando com sábado 07 e domingo 08
    // - 3 dias não produtivos seguidos.
    const client = criarClienteCalendarioFalso(
      fixturePadrao({
        feriados: [
          { data: "2026-11-06", abrangencia: "nacional", pais_codigo: "BR", uf_codigo: null, municipio_codigo: null, descricao: "Emenda de teste" },
        ],
      }),
    );

    const { P } = await construirSequenciaDiasProdutivos(client, EMPRESA_ID, INICIO, FIM);

    expect(P).toHaveLength(9); // 10 úteis - 1 (sexta 06, que já seria produtiva)
    const indiceQuinta = P.indexOf("2026-11-05");
    // Depois da quinta 05, o próximo dia em P deve pular direto para a
    // segunda 09 - nenhum dos três dias não produtivos (06,07,08) aparece.
    expect(P[indiceQuinta + 1]).toBe("2026-11-09");
    expect(P).not.toContain("2026-11-06");
    expect(P).not.toContain("2026-11-07");
    expect(P).not.toContain("2026-11-08");
  });
});

describe("criarContarDiasProdutivosEntre", () => {
  it("dentro do contexto já carregado: conta corretamente e NÃO dispara nenhuma consulta nova", async () => {
    const { client, contador } = criarClienteCalendarioFalsoComContagem(fixturePadrao());
    const { contexto } = await construirSequenciaDiasProdutivos(client, EMPRESA_ID, INICIO, FIM);

    const totalAntes = contador.total();
    const contarFn = criarContarDiasProdutivosEntre(client, EMPRESA_ID, contexto);
    const n = await contarFn("2026-11-05", "2026-11-10"); // qui,sex,[sab,dom],seg,ter - dentro do contexto

    expect(n).toBe(4); // 05(qui),06(sex),09(seg),10(ter) - fim de semana excluído
    expect(contador.total()).toBe(totalAntes); // reaproveitou o contexto, zero consultas novas
  });

  it("fora do contexto já carregado (ex.: material após o Prazo Interno): expande e conta certo, com um número PEQUENO e fixo de consultas novas", async () => {
    const { client, contador } = criarClienteCalendarioFalsoComContagem(
      fixturePadrao({
        feriados: [
          { data: "2026-11-20", abrangencia: "nacional", pais_codigo: "BR", uf_codigo: null, municipio_codigo: null, descricao: "Feriado além do contexto original" },
        ],
      }),
    );
    const { contexto } = await construirSequenciaDiasProdutivos(client, EMPRESA_ID, INICIO, FIM); // só cobre até 2026-11-13

    const totalAntes = contador.total();
    const contarFn = criarContarDiasProdutivosEntre(client, EMPRESA_ID, contexto);
    // 2026-11-16 a 2026-11-20: segunda a sexta, com o feriado de teste na
    // própria sexta 20 - fora do contexto original (que só ia até 13).
    const n = await contarFn("2026-11-16", "2026-11-20");

    expect(n).toBe(4); // seg,ter,qua,qui produtivos - sexta é feriado
    const consultasNovas = contador.total() - totalAntes;
    expect(consultasNovas).toBeGreaterThan(0); // expandiu de verdade
    expect(consultasNovas).toBeLessThanOrEqual(4); // mesmo teto de carregarContextoCalendario, não proporcional ao intervalo
  });
});

describe("calcularEstimativaInicioNecessarioComCalendarioReal - fim a fim, com calendário real", () => {
  it("viavel: reproduz o mesmo resultado do núcleo puro, agora alimentado pelo calendário real", async () => {
    const client = criarClienteCalendarioFalso(fixturePadrao());
    const prazoInterno = FIM; // 2026-11-13

    const resultado = await calcularEstimativaInicioNecessarioComCalendarioReal(
      client,
      EMPRESA_ID,
      baseFixaSimples(), // 24h necessárias, 8h/dia -> precisa de 3 dias produtivos
      prazoInterno,
      "2026-11-02", // material bem antes - folga grande
    );

    expect(resultado.estado).toBe("viavel");
    if (resultado.estado === "viavel") {
      // 3 dias produtivos antes de 13/11 (sex): 11(qua),12(qui),13(sex).
      expect(resultado.dataEstimadaInicioNecessario).toBe("2026-11-11");
    }
  });

  it("janela_insuficiente com material DEPOIS do Prazo Interno (fora do horizonte original de P) - expande o calendário corretamente", async () => {
    const client = criarClienteCalendarioFalso(fixturePadrao());
    const prazoInterno = FIM;

    const resultado = await calcularEstimativaInicioNecessarioComCalendarioReal(
      client,
      EMPRESA_ID,
      baseFixaSimples(),
      prazoInterno,
      "2026-11-20", // depois do Prazo Interno - fora de [floorDate, prazoInterno]
    );

    expect(resultado.estado).toBe("janela_insuficiente");
    if (resultado.estado === "janela_insuficiente") {
      expect(resultado.dataEstimadaInicioNecessario).toBe("2026-11-11");
      expect(resultado.folgaDiasProdutivos).toBeLessThan(0);
    }
  });

  it("custo de consultas é O(1) - não escala com o tamanho da busca nem com o número de iterações da busca binária", async () => {
    // Cenário 1: converge rápido (poucas iterações até achar D* perto do Prazo Interno).
    const { client: cliente1, contador: contador1 } = criarClienteCalendarioFalsoComContagem(fixturePadrao());
    await calcularEstimativaInicioNecessarioComCalendarioReal(
      cliente1,
      EMPRESA_ID,
      baseFixaSimples(), // 3 dias produtivos bastam
      FIM,
      "2026-11-02",
    );

    // Cenário 2: precisa de MUITO mais dias produtivos (obriga a busca
    // binária a caminhar muito mais fundo dentro do horizonte técnico) -
    // mesmo MAX_DIAS_CIVIS_BUSCA_REVERSA de 10000 dias.
    const { client: cliente2, contador: contador2 } = criarClienteCalendarioFalsoComContagem(fixturePadrao());
    await calcularEstimativaInicioNecessarioComCalendarioReal(
      cliente2,
      EMPRESA_ID,
      baseFixaSimples({
        operacoesOrdenadas: [
          { bomOperacaoId: "op-1", recursoOriginalId: "r1", tempoEstimadoMinutos: 60, quantidade: 8000 }, // precisa de ~1000 dias produtivos
        ],
      }),
      FIM,
      "2020-01-01",
    );

    // O custo de consultas não pode depender de quantas iterações a busca
    // binária precisou nem de quão fundo em P ela foi - só do
    // carregamento inicial do contexto (~4 consultas, sempre).
    expect(contador1.total()).toBe(contador2.total());
    expect(contador1.total()).toBeLessThanOrEqual(4);
  });

  it("MAX_DIAS_CIVIS_BUSCA_REVERSA é um horizonte técnico grande o bastante para qualquer prazo comercial razoável", () => {
    expect(MAX_DIAS_CIVIS_BUSCA_REVERSA).toBeGreaterThanOrEqual(1000);
  });
});

describe("consistência entre a composição manual (Fase 1) e o orquestrador real (Fase 2)", () => {
  it("calcularEstimativaInicioNecessarioComCalendarioReal produz o mesmo resultado que compor construirSequenciaDiasProdutivos + criarContarDiasProdutivosEntre + calcularEstimativaInicioNecessario manualmente", async () => {
    const client = criarClienteCalendarioFalso(fixturePadrao());
    const prazoInterno = FIM;
    const floorDate = "2026-10-01";

    const { P, contexto } = await construirSequenciaDiasProdutivos(client, EMPRESA_ID, floorDate, prazoInterno);
    const contarFn = criarContarDiasProdutivosEntre(client, EMPRESA_ID, contexto);
    const resultadoManual = await calcularEstimativaInicioNecessario(
      baseFixaSimples(),
      P,
      prazoInterno,
      "2026-11-02",
      contarFn,
      33, // dias civis entre floorDate e prazoInterno, não crítico para este teste
    );

    const resultadoOrquestrado = await calcularEstimativaInicioNecessarioComCalendarioReal(
      client,
      EMPRESA_ID,
      baseFixaSimples(),
      prazoInterno,
      "2026-11-02",
    );

    expect(resultadoOrquestrado).toEqual(resultadoManual);
  });
});
