// DEC-007 §6.2 (investigação de inconsistência no uso de horas extras,
// achada em teste visual real - projeto 260011): usuário reportou um
// cenário B (mais recursos/horas extras oferecidas que um cenário A)
// entregando uma data PIOR que A, com a maior parte da hora extra
// oferecida aparentemente descartada sem explicação. Este arquivo prova,
// contra o código real (nunca uma reimplementação), duas propriedades
// que deveriam garantir que isso não pode ser um defeito do MOTOR de
// distribuição (resolverDistribuicaoConjunta/avaliarPrevisaoComercialFlexivel):
//
// 1. MONOTONICIDADE: oferecer MAIS capacidade extra (nunca removendo ou
//    reduzindo o que já existia) nunca piora primeiraEntregaPossivel nem
//    torna um horizonte antes suficiente em insuficiente.
// 2. INDEPENDÊNCIA ENTRE RECURSOS DISJUNTOS: autorizar hora extra para um
//    recurso que uma necessidade NÃO usa (nem original, nem compatível)
//    nunca muda a alocação dessa necessidade - nem o total de horas, nem
//    as datas, nem o tipo de capacidade usado.
//
// Reprodução dirigida (primeiro describe) usa os números REAIS do
// projeto 260011 (recursos_produtivos.capacidade_horas_dia lido do banco
// em 2026-08-20: FER-001=8.8h/dia, FCNC-007=8.8h/dia, FCNC-006=17.6h/dia,
// FER-001 sem nenhuma recurso_produtivo_compatibilidades cadastrada,
// FCNC-007->FCNC-006 cadastrado) - resultado: rodando o motor real com
// esses números, adicionar horas extras de CNC (2h+6h) mantendo a regra
// do Ajustador (10h) intacta produz alocação BYTE-IDÊNTICA para o
// Ajustador nos dois cenários (mesmas datas, mesmas horas, mesmo tipo) e
// a mesma primeiraEntregaPossivel - a suspeita de erro matemático no
// motor não se confirma para este caso; ver a conclusão completa na
// entrega desta tarefa (causa raiz mais provável: a própria regra do
// Ajustador variou entre as duas rodadas manuais, não o motor).
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { avaliarPrevisaoComercialFlexivel } from "./avaliarPrevisaoComercialFlexivel";
import type { CapacidadeNormalRecurso, NecessidadeCapacidadeFlexivel } from "./necessidadeCapacidadeFlexivel";
import type { CapacidadeExtraDia, ElegibilidadeCapacidadeExtra } from "./capacidadeDia";

function gerarDatas(inicio: string, quantidade: number): string[] {
  const [ano, mes, dia] = inicio.split("-").map(Number);
  return Array.from({ length: quantidade }, (_, i) => new Date(Date.UTC(ano, mes - 1, dia + i)).toISOString().slice(0, 10));
}

function ehFimDeSemana(data: string): boolean {
  const [ano, mes, dia] = data.split("-").map(Number);
  const dow = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  return dow === 0 || dow === 6;
}

describe("avaliarPrevisaoComercialFlexivel - reprodução dirigida (projeto 260011, Ajustador + CNC)", () => {
  const HOLIDAY = "2026-10-12"; // Nossa Senhora Aparecida - feriado nacional
  const datasGrade = gerarDatas("2026-10-05", 20);
  const diasProdutivos = new Set(datasGrade.filter((d) => !ehFimDeSemana(d) && d !== HOLIDAY));

  // Necessidade única equivalente à soma real das 5 OPs de Ajustador do
  // projeto 260011 (1080+360+120+360+360 minutos = 38h) - o total é o
  // que importa para esta propriedade (independência entre recursos
  // disjuntos não depende de quantas necessidades compõem cada recurso).
  const necessidadeAjustador: NecessidadeCapacidadeFlexivel = {
    empresaId: "e1",
    projetoId: "260011",
    projetoItemId: "item-1",
    chaveTrabalho: "op-ajustador",
    recursoOriginalId: "ajustador",
    recursosCompativeisPorPrioridade: [], // FER-001 real: 0 linhas em recurso_produtivo_compatibilidades como origem.
    horasNecessariasPadrao: 38,
    disponivelAPartirDe: "2026-10-08",
  };

  const necessidadeCnc: NecessidadeCapacidadeFlexivel = {
    empresaId: "e1",
    projetoId: "260011",
    projetoItemId: "item-2",
    chaveTrabalho: "op-cnc",
    recursoOriginalId: "cnc2500",
    recursosCompativeisPorPrioridade: ["cnc3000"], // FCNC-007 -> FCNC-006 real, prioridade 1.
    horasNecessariasPadrao: 4, // 240 minutos reais.
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
  ]; // total = 10h, exatamente como reportado no cenário A.

  const extraCnc: CapacidadeExtraDia[] = [
    { recursoId: "cnc2500", data: "2026-10-08", horasAdicionaisDisponiveis: 2, natureza: "hora_extra", elegibilidade, contratacaoId: "contrato-cnc" },
    { recursoId: "cnc3000", data: "2026-10-08", horasAdicionaisDisponiveis: 6, natureza: "hora_extra", elegibilidade, contratacaoId: "contrato-cnc" },
  ]; // 2h + 6h, exatamente como reportado no cenário B.

  function avaliar(capacidadeExtraAutorizada: CapacidadeExtraDia[]) {
    return avaliarPrevisaoComercialFlexivel({
      dataSolicitadaCliente: "2026-10-13",
      compromissosConfirmados: [],
      necessidadesOrcamentoNovo: [necessidadeAjustador, necessidadeCnc],
      capacidadesNormais,
      capacidadeExtraAutorizada,
      temporariosPorPrioridade: [],
      datasGrade,
      diasProdutivos,
    });
  }

  it("cenário A (só Ajustador com 10h extra autorizadas) conclui em 14/10, usando parte da hora extra oferecida", () => {
    const a = avaliar(extraAjustador);
    const ajustador = a.resultadosPorOp.find((r) => r.chaveTrabalho === "op-ajustador")!.resultado;
    const horasExtraUsadas = ajustador.alocacoes.filter((x) => x.tipoCapacidade === "adicional").reduce((s, x) => s + x.horasPadrao, 0);

    expect(a.primeiraEntregaPossivel).toBe("2026-10-14");
    expect(a.recursosQueDeterminamTermino).toEqual(["ajustador"]);
    // 38h necessárias; 08,09,13,14/10 são os únicos dias produtivos
    // normais dentro da janela (10-11/10 fim de semana, 12/10 feriado
    // nacional) - 4 × 8,8h = 35,2h de capacidade normal, faltando 2,8h,
    // cobertas por parte da hora extra oferecida (nunca as 10h inteiras -
    // o motor usa só o necessário, nunca o teto autorizado).
    expect(horasExtraUsadas).toBeCloseTo(2.8, 5);
  });

  it("cenário B (Ajustador IDÊNTICO ao A + CNC com 2h/6h extra) - Ajustador fica byte-idêntico e o prazo global não piora", () => {
    const a = avaliar(extraAjustador);
    const b = avaliar([...extraAjustador, ...extraCnc]);

    const ajustadorA = a.resultadosPorOp.find((r) => r.chaveTrabalho === "op-ajustador")!.resultado;
    const ajustadorB = b.resultadosPorOp.find((r) => r.chaveTrabalho === "op-ajustador")!.resultado;

    // Independência entre recursos disjuntos: nenhuma hora extra de CNC
    // pode mudar QUALQUER aspecto da alocação do Ajustador - nem o
    // total, nem a data, nem o tipo de capacidade usado em cada data.
    expect(ajustadorB.horasAlocadasPadrao).toBe(ajustadorA.horasAlocadasPadrao);
    expect(ajustadorB.alocacoes).toEqual(ajustadorA.alocacoes);

    // Monotonicidade observável (o que a tela mostra como "prazo"): B é
    // superconjunto estrito de capacidade de A (nada removido/reduzido,
    // só CNC ganhou horas extras novas) - o prazo não pode piorar.
    expect(b.primeiraEntregaPossivel! <= a.primeiraEntregaPossivel!).toBe(true);
    expect(b.primeiraEntregaPossivel).toBe(a.primeiraEntregaPossivel);

    // CNC nunca deveria se tornar o recurso determinante aqui (4h de
    // necessidade, 8,8h/dia de capacidade normal, muito antes do prazo).
    expect(b.recursosQueDeterminamTermino).toEqual(["ajustador"]);
  });
});

// --- Propriedade geral (fast-check): qualquer cenário, não só o caso dirigido acima ---

const NUM_DIAS_GRADE_PROP = 12;
const GRADE_PROP = gerarDatas("2026-09-01", NUM_DIAS_GRADE_PROP);

interface CasoMonotonicidade {
  numRecursos: number;
  numNecessidades: number;
  capacidades: number[];
  horasNecessarias: number[];
  recursoOriginalIdx: number[];
  compativeisIdx: number[][];
  extraBaseRecursoIdx: number[];
  extraBaseDiaIdx: number[];
  extraBaseHoras: number[];
  extraAdicionalRecursoIdx: number[];
  extraAdicionalDiaIdx: number[];
  extraAdicionalHoras: number[];
}

const arbitrarioCaso: fc.Arbitrary<CasoMonotonicidade> = fc
  .tuple(fc.integer({ min: 1, max: 3 }), fc.integer({ min: 1, max: 3 }))
  .chain(([numRecursos, numNecessidades]) =>
    fc.record({
      numRecursos: fc.constant(numRecursos),
      numNecessidades: fc.constant(numNecessidades),
      capacidades: fc.array(fc.constantFrom(0, 2, 4), { minLength: numRecursos, maxLength: numRecursos }),
      horasNecessarias: fc.array(fc.integer({ min: 1, max: 12 }), { minLength: numNecessidades, maxLength: numNecessidades }),
      recursoOriginalIdx: fc.array(fc.integer({ min: 0, max: numRecursos - 1 }), { minLength: numNecessidades, maxLength: numNecessidades }),
      compativeisIdx: fc.array(fc.uniqueArray(fc.integer({ min: 0, max: numRecursos - 1 }), { maxLength: numRecursos }), {
        minLength: numNecessidades,
        maxLength: numNecessidades,
      }),
      extraBaseRecursoIdx: fc.array(fc.integer({ min: 0, max: numRecursos - 1 }), { minLength: 0, maxLength: 4 }),
      extraBaseDiaIdx: fc.array(fc.integer({ min: 0, max: NUM_DIAS_GRADE_PROP - 1 }), { minLength: 0, maxLength: 4 }),
      extraBaseHoras: fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 0, maxLength: 4 }),
      extraAdicionalRecursoIdx: fc.array(fc.integer({ min: 0, max: numRecursos - 1 }), { minLength: 0, maxLength: 4 }),
      extraAdicionalDiaIdx: fc.array(fc.integer({ min: 0, max: NUM_DIAS_GRADE_PROP - 1 }), { minLength: 0, maxLength: 4 }),
      extraAdicionalHoras: fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 0, maxLength: 4 }),
    }),
  );

function montarCenario(caso: CasoMonotonicidade) {
  const recursoIds = Array.from({ length: caso.numRecursos }, (_, i) => `recurso-${i}`);
  const capacidadesNormais = new Map<string, CapacidadeNormalRecurso>(
    recursoIds.map((id, i) => [id, { recursoId: id, capacidadeHorasMaquinaDia: caso.capacidades[i], produtividade: 1 }]),
  );

  const necessidades: NecessidadeCapacidadeFlexivel[] = Array.from({ length: caso.numNecessidades }, (_, i) => {
    const originalIdx = caso.recursoOriginalIdx[i];
    const compativeis = (caso.compativeisIdx[i] ?? []).filter((idx) => idx !== originalIdx).map((idx) => recursoIds[idx]);
    return {
      empresaId: "e1",
      projetoId: "p1",
      projetoItemId: `item-${i}`,
      chaveTrabalho: `op-${i}`,
      recursoOriginalId: recursoIds[originalIdx],
      recursosCompativeisPorPrioridade: compativeis,
      horasNecessariasPadrao: caso.horasNecessarias[i],
      disponivelAPartirDe: GRADE_PROP[0],
    };
  });

  const elegibilidade: ElegibilidadeCapacidadeExtra = { escopo: "qualquer_projeto_do_cenario" };

  function construirExtra(recursoIdx: number[], diaIdx: number[], horas: number[]): CapacidadeExtraDia[] {
    const vistos = new Set<string>();
    const lista: CapacidadeExtraDia[] = [];
    const n = Math.min(recursoIdx.length, diaIdx.length, horas.length);
    for (let i = 0; i < n; i++) {
      const recursoId = recursoIds[recursoIdx[i]];
      const data = GRADE_PROP[diaIdx[i]];
      const chave = `${recursoId}::${data}`;
      if (vistos.has(chave)) continue; // nunca duas entradas pro mesmo recurso+data+natureza (violaria validação de duplicata).
      vistos.add(chave);
      lista.push({ recursoId, data, horasAdicionaisDisponiveis: horas[i], natureza: "hora_extra", elegibilidade, contratacaoId: `contrato-${i}` });
    }
    return lista;
  }

  const extraBase = construirExtra(caso.extraBaseRecursoIdx, caso.extraBaseDiaIdx, caso.extraBaseHoras);
  const chavesBase = new Set(extraBase.map((e) => `${e.recursoId}::${e.data}`));
  // Cenário B = A ∪ adicional, nunca sobrescrevendo uma chave que A já usa (garante "superconjunto estrito", nunca reduz A).
  const extraAdicionalBruto = construirExtra(caso.extraAdicionalRecursoIdx, caso.extraAdicionalDiaIdx, caso.extraAdicionalHoras);
  const extraAdicional = extraAdicionalBruto.filter((e) => !chavesBase.has(`${e.recursoId}::${e.data}`));

  return { necessidades, capacidadesNormais, extraBase, extraAdicional };
}

function avaliarCaso(params: {
  necessidades: NecessidadeCapacidadeFlexivel[];
  capacidadesNormais: ReadonlyMap<string, CapacidadeNormalRecurso>;
  capacidadeExtraAutorizada: CapacidadeExtraDia[];
}) {
  return avaliarPrevisaoComercialFlexivel({
    dataSolicitadaCliente: GRADE_PROP[GRADE_PROP.length - 1],
    compromissosConfirmados: [],
    necessidadesOrcamentoNovo: params.necessidades,
    capacidadesNormais: params.capacidadesNormais,
    capacidadeExtraAutorizada: params.capacidadeExtraAutorizada,
    temporariosPorPrioridade: [],
    datasGrade: GRADE_PROP,
  });
}

describe("avaliarPrevisaoComercialFlexivel - monotonicidade (fast-check)", () => {
  it("oferecer MAIS capacidade extra (superconjunto estrito) nunca piora primeiraEntregaPossivel nem torna suficiente em insuficiente", () => {
    fc.assert(
      fc.property(arbitrarioCaso, (caso) => {
        const { necessidades, capacidadesNormais, extraBase, extraAdicional } = montarCenario(caso);

        const a = avaliarCaso({ necessidades, capacidadesNormais, capacidadeExtraAutorizada: extraBase });
        const b = avaliarCaso({ necessidades, capacidadesNormais, capacidadeExtraAutorizada: [...extraBase, ...extraAdicional] });

        if (a.horizonteTecnico === "suficiente") {
          expect(b.horizonteTecnico).toBe("suficiente");
          expect(b.primeiraEntregaPossivel! <= a.primeiraEntregaPossivel!).toBe(true);
        }
        // Se A já era insuficiente, B pode virar suficiente (melhora) ou continuar insuficiente - nunca é uma regressão em si.
      }),
      { numRuns: 300 },
    );
  });

  /**
   * "Ilha de recursos" alcançada por ponto fixo a partir de um conjunto
   * inicial: toda necessidade que toca um recurso já marcado contribui
   * TODOS os seus próprios recursos ao conjunto (competem pelo mesmo
   * dia-nó, então uma pode legitimamente mudar de dia quando a outra
   * muda de comportamento - distribuição CONJUNTA, não 1 OP isolada).
   * Só uma necessidade inteiramente FORA dessa ilha é garantidamente
   * independente do que aconteceu dentro dela.
   */
  function calcularIlhaDeRecursosAfetados(
    necessidades: readonly NecessidadeCapacidadeFlexivel[],
    recursosTocadosDiretamente: ReadonlySet<string>,
  ): Set<string> {
    const afetados = new Set(recursosTocadosDiretamente);
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const n of necessidades) {
        const recursosDaNecessidade = [n.recursoOriginalId, ...n.recursosCompativeisPorPrioridade];
        if (recursosDaNecessidade.some((r) => afetados.has(r))) {
          for (const r of recursosDaNecessidade) {
            if (!afetados.has(r)) {
              afetados.add(r);
              mudou = true;
            }
          }
        }
      }
    }
    return afetados;
  }

  it("autorizar hora extra para um recurso fora da ilha de recursos de uma necessidade nunca muda a alocação dessa necessidade", () => {
    fc.assert(
      fc.property(arbitrarioCaso, (caso) => {
        const { necessidades, capacidadesNormais, extraBase, extraAdicional } = montarCenario(caso);
        if (necessidades.length === 0 || extraAdicional.length === 0) return;

        const a = avaliarCaso({ necessidades, capacidadesNormais, capacidadeExtraAutorizada: extraBase });
        const b = avaliarCaso({ necessidades, capacidadesNormais, capacidadeExtraAutorizada: [...extraBase, ...extraAdicional] });

        const recursosTocados = new Set(extraAdicional.map((e) => e.recursoId));
        const ilhaAfetada = calcularIlhaDeRecursosAfetados(necessidades, recursosTocados);

        for (const necessidade of necessidades) {
          const recursosDaNecessidade = [necessidade.recursoOriginalId, ...necessidade.recursosCompativeisPorPrioridade];
          const dentroDaIlha = recursosDaNecessidade.some((r) => ilhaAfetada.has(r));
          if (dentroDaIlha) continue; // dentro da ilha, redistribuição conjunta é esperada - só a garantia de monotonicidade global se aplica (teste acima).

          const resultadoA = a.resultadosPorOp.find((r) => r.chaveTrabalho === necessidade.chaveTrabalho)!.resultado;
          const resultadoB = b.resultadosPorOp.find((r) => r.chaveTrabalho === necessidade.chaveTrabalho)!.resultado;
          expect(resultadoB.horasAlocadasPadrao).toBe(resultadoA.horasAlocadasPadrao);
          expect(resultadoB.alocacoes).toEqual(resultadoA.alocacoes);
        }
      }),
      { numRuns: 300 },
    );
  });
});
