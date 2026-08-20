// Verificação exata da regra "menos alternativas primeiro"
// (avaliarPrevisaoComercialFlexivel.ts) - NUNCA entra em produção, só
// teste. A função pública reordena as OPs do orçamento novo por (nº de
// recursosCompativeisPorPrioridade ascendente, chaveTrabalho ascendente)
// antes de processá-las - resolve a dependência da ORDEM DE ENTRADA do
// array (já provado em avaliarPrevisaoComercialFlexivel.test.ts, seção
// "checkpoint"), mas isso não prova que essa ordem fixa é a MELHOR entre
// TODAS as ordens de despacho possíveis. Este arquivo constrói esse
// verificador: para um conjunto pequeno de OPs (sem grafo de
// precedência aqui - é um conjunto plano disputando recursos
// compartilhados, diferente de escalonadorConjunto.ts), enumera TODAS
// as permutações de ordem de despacho e, para cada uma, reaproveita o
// NÚCLEO público `distribuirNecessidadeSobreCandidatos` (nunca uma
// reimplementação do laço por data/tier) - a mesma função que
// avaliarPrevisaoComercialFlexivel chama internamente, só que aqui SOB
// CONTROLE DIRETO da ordem, em vez da ordem calculada por "menos
// alternativas primeiro".
//
// Escopo deliberadamente restrito nesta rodada: sem confirmados, sem
// capacidade adicional, sem recursos temporários - isola exatamente o
// mecanismo em questão (disputa de capacidade normal entre original e
// compatíveis, entre OPs do mesmo orçamento nomeado). Os outros tiers já
// têm cobertura própria em distribuirNecessidadeFlexivel.test.ts.
//
// Teto de N (MAX_NECESSIDADES_BUSCA_EXAUSTIVA): busca exaustiva é O(N!)
// - 5 OPs = no máximo 120 ordens por caso, rápido mesmo em centenas de
// casos gerados.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { avaliarPrevisaoComercialFlexivel } from "./avaliarPrevisaoComercialFlexivel";
import { criarCandidatoNormalComExtra, distribuirNecessidadeSobreCandidatos } from "./distribuirNecessidadeFlexivel";
import { criarCandidatoRecursoTemporario } from "./recursoTemporario";
import { alocarOperacaoDiaAdia } from "./alocarOperacaoDiaAdia";
import type { CandidatoComCapacidadeDiaria } from "./alocarOperacaoDiaAdia";
import type { CapacidadeExtraDia } from "./capacidadeDia";
import type { CompromissoCapacidade } from "./compromissoCapacidade";
import type { DecisaoRecursoTemporario } from "./avaliarCenario";
import type {
  CapacidadeNormalRecurso,
  NecessidadeCapacidadeFlexivel,
  ResultadoDistribuicaoFlexivel,
} from "./necessidadeCapacidadeFlexivel";

const MAX_NECESSIDADES_BUSCA_EXAUSTIVA = 5;
const NUM_DIAS_GRADE = 14;

function gerarGradeDatas(base: string, quantidade: number): string[] {
  const [ano, mes, dia] = base.split("-").map(Number);
  return Array.from({ length: quantidade }, (_, i) => new Date(Date.UTC(ano, mes - 1, dia + i)).toISOString().slice(0, 10));
}

const GRADE = gerarGradeDatas("2026-09-01", NUM_DIAS_GRADE);

function todasPermutacoes<T>(itens: readonly T[]): T[][] {
  if (itens.length <= 1) return [[...itens]];
  const resultado: T[][] = [];
  for (let i = 0; i < itens.length; i++) {
    const resto = [...itens.slice(0, i), ...itens.slice(i + 1)];
    for (const permResto of todasPermutacoes(resto)) {
      resultado.push([itens[i], ...permResto]);
    }
  }
  return resultado;
}

/** Roda o NÚCLEO público em sequência, na ordem EXATA informada - nenhuma reimplementação do laço por data/tier. */
function rodarComOrdemForcada(params: {
  ordem: readonly NecessidadeCapacidadeFlexivel[];
  capacidadesNormais: ReadonlyMap<string, CapacidadeNormalRecurso>;
  datasGrade: readonly string[];
}): Map<string, ResultadoDistribuicaoFlexivel> {
  const { ordem, capacidadesNormais, datasGrade } = params;
  const candidatosNormaisPorRecurso = new Map<string, CandidatoComCapacidadeDiaria>();
  for (const [recursoId, cap] of capacidadesNormais) {
    candidatosNormaisPorRecurso.set(recursoId, criarCandidatoNormalComExtra(recursoId, cap.capacidadeHorasMaquinaDia, cap.produtividade, []));
  }

  const resultados = new Map<string, ResultadoDistribuicaoFlexivel>();
  for (const necessidade of ordem) {
    resultados.set(
      necessidade.chaveTrabalho,
      distribuirNecessidadeSobreCandidatos({
        necessidade,
        ehOrcamentoNovo: true,
        candidatosNormaisPorRecurso,
        candidatosTemporariosPorPrioridade: [],
        contratacaoIdPorTemporario: new Map(),
        datasOrdenadas: datasGrade,
      }),
    );
  }
  return resultados;
}

type AvaliacaoEntregaComercial = { viavel: true; dataEntrega: string } | { viavel: false };

/** Entrega = TODAS as OPs concluídas (sem déficit em nenhuma) - data = a mais tardia entre elas. */
function avaliarEntregaComercial(resultados: Map<string, ResultadoDistribuicaoFlexivel>): AvaliacaoEntregaComercial {
  const todasConcluidas = [...resultados.values()].every((r) => r.status === "concluida");
  if (!todasConcluidas) return { viavel: false };
  const todasAlocacoes = [...resultados.values()].flatMap((r) => r.alocacoes);
  const dataEntrega = todasAlocacoes.reduce((max, a) => (a.data > max ? a.data : max), "0000-00-00");
  return { viavel: true, dataEntrega };
}

interface CasoGeradoComercial {
  numNecessidades: number;
  numRecursos: number;
  produtividades: number[];
  capacidades: number[];
  horasNecessarias: number[];
  offsets: number[];
  recursoOriginalIdx: number[];
  compativeisIdx: number[][];
}

const arbitrarioCasoComercial: fc.Arbitrary<CasoGeradoComercial> = fc
  .tuple(fc.integer({ min: 2, max: MAX_NECESSIDADES_BUSCA_EXAUSTIVA }), fc.integer({ min: 1, max: 3 }))
  .chain(([numNecessidades, numRecursos]) =>
    fc.record({
      numNecessidades: fc.constant(numNecessidades),
      numRecursos: fc.constant(numRecursos),
      produtividades: fc.array(fc.constantFrom(0.5, 1), { minLength: numRecursos, maxLength: numRecursos }),
      capacidades: fc.array(fc.constantFrom(0, 4, 8), { minLength: numRecursos, maxLength: numRecursos }),
      horasNecessarias: fc.array(fc.integer({ min: 1, max: 10 }), { minLength: numNecessidades, maxLength: numNecessidades }),
      offsets: fc.array(fc.integer({ min: 0, max: 2 }), { minLength: numNecessidades, maxLength: numNecessidades }),
      recursoOriginalIdx: fc.array(fc.integer({ min: 0, max: numRecursos - 1 }), { minLength: numNecessidades, maxLength: numNecessidades }),
      // compatíveis: gerado sobre TODOS os índices de recurso; o próprio original é removido ao montar (evita violar "compatível != original").
      compativeisIdx: fc.array(fc.uniqueArray(fc.integer({ min: 0, max: numRecursos - 1 }), { maxLength: numRecursos }), {
        minLength: numNecessidades,
        maxLength: numNecessidades,
      }),
    }),
  );

// Variante SEM recurso morto - todo recurso tem capacidade > 0 sempre
// (exclui a classe de contraexemplo já confirmada e documentada acima).
// Mais variedade de capacidade/produtividade/disponibilidade que o
// gerador acima - especificamente para testar se a regra "menos
// alternativas primeiro" ainda falha quando toda alternativa é real
// (positiva), só que às vezes com pouco saldo ou indisponível a tempo
// (disponivelAPartirDe mais espalhado, capacidades baixas o bastante
// para gerar disputa genuína, até 4 recursos compartilhados por várias OPs).
const arbitrarioCasoComercialSemRecursoMorto: fc.Arbitrary<CasoGeradoComercial> = fc
  .tuple(fc.integer({ min: 2, max: MAX_NECESSIDADES_BUSCA_EXAUSTIVA }), fc.integer({ min: 1, max: 4 }))
  .chain(([numNecessidades, numRecursos]) =>
    fc.record({
      numNecessidades: fc.constant(numNecessidades),
      numRecursos: fc.constant(numRecursos),
      produtividades: fc.array(fc.constantFrom(0.25, 0.5, 0.75, 1), { minLength: numRecursos, maxLength: numRecursos }),
      // SEMPRE > 0 - inclui valores baixos (1, 2) deliberadamente, para criar alternativas com pouco saldo real.
      capacidades: fc.array(fc.constantFrom(1, 2, 3, 4, 6, 8), { minLength: numRecursos, maxLength: numRecursos }),
      horasNecessarias: fc.array(fc.integer({ min: 1, max: 12 }), { minLength: numNecessidades, maxLength: numNecessidades }),
      offsets: fc.array(fc.integer({ min: 0, max: 4 }), { minLength: numNecessidades, maxLength: numNecessidades }),
      recursoOriginalIdx: fc.array(fc.integer({ min: 0, max: numRecursos - 1 }), { minLength: numNecessidades, maxLength: numNecessidades }),
      compativeisIdx: fc.array(fc.uniqueArray(fc.integer({ min: 0, max: numRecursos - 1 }), { maxLength: numRecursos }), {
        minLength: numNecessidades,
        maxLength: numNecessidades,
      }),
    }),
  );

function montarCenarioComercial(caso: CasoGeradoComercial) {
  const recursoIds = Array.from({ length: caso.numRecursos }, (_, i) => `R${i}`);
  const capacidadesNormais: ReadonlyMap<string, CapacidadeNormalRecurso> = new Map(
    recursoIds.map((id, i) => [id, { recursoId: id, produtividade: caso.produtividades[i], capacidadeHorasMaquinaDia: caso.capacidades[i] }]),
  );

  const necessidades: NecessidadeCapacidadeFlexivel[] = Array.from({ length: caso.numNecessidades }, (_, i) => {
    const recursoOriginalId = recursoIds[caso.recursoOriginalIdx[i]];
    const compativeis = caso.compativeisIdx[i].filter((idx) => idx !== caso.recursoOriginalIdx[i]).map((idx) => recursoIds[idx]);
    return {
      empresaId: "empresa-1",
      projetoId: "projeto-novo",
      projetoItemId: `item-${i}`,
      chaveTrabalho: `OP-${i}`,
      recursoOriginalId,
      recursosCompativeisPorPrioridade: compativeis,
      horasNecessariasPadrao: caso.horasNecessarias[i],
      disponivelAPartirDe: GRADE[caso.offsets[i]],
    };
  });

  return { necessidades, capacidadesNormais };
}

describe("avaliarPrevisaoComercialFlexivel — verificação exata contra todas as ordens de despacho possíveis", () => {
  // CONTRAEXEMPLO CONFIRMADO SOB A HEURÍSTICA ANTIGA (2026-08-16, seed
  // abaixo) - "menos alternativas primeiro" entregava numa data PIOR do
  // que a melhor ordem de despacho possível neste caso (não é falsa
  // inviabilidade - as duas ordens completam tudo, só que em datas
  // diferentes). CORRIGIDO pela distribuição conjunta exata
  // (redeFluxoCapacidadeComercial.ts) - a propriedade abaixo agora
  // precisa valer sempre (sem `it.fails`); a seed fica fixa para manter
  // determinismo/reprodutibilidade, não porque ainda haja falha
  // conhecida.
  it("a previsão comercial sempre entrega na MELHOR data possível entre todas as ordens, em casos pequenos e variados (sem confirmados/adicional/temporário)", () => {
    fc.assert(
      fc.property(arbitrarioCasoComercial, (caso) => {
        const { necessidades, capacidadesNormais } = montarCenarioComercial(caso);

        const resultadoHeuristico = avaliarPrevisaoComercialFlexivel({
          dataSolicitadaCliente: GRADE[GRADE.length - 1],
          compromissosConfirmados: [],
          necessidadesOrcamentoNovo: necessidades,
          capacidadesNormais,
          capacidadeExtraAutorizada: [],
          temporariosPorPrioridade: [],
          datasGrade: GRADE,
        });

        // Conservação de horas: alocado + déficit == necessário, para toda OP.
        for (const opResultado of resultadoHeuristico.resultadosPorOp) {
          expect(opResultado.resultado.horasAlocadasPadrao + opResultado.resultado.deficitResidualHorasPadrao).toBeCloseTo(
            opResultado.resultado.horasNecessariasPadrao,
            6,
          );
        }

        // Distribuição dos recursos: nenhum recurso ultrapassa a capacidade cadastrada em nenhum dia.
        const consumidoPorRecursoEData = new Map<string, number>();
        for (const opResultado of resultadoHeuristico.resultadosPorOp) {
          for (const a of opResultado.resultado.alocacoes) {
            const chaveConsumo = `${a.recursoId}::${a.data}`;
            consumidoPorRecursoEData.set(chaveConsumo, (consumidoPorRecursoEData.get(chaveConsumo) ?? 0) + a.horasMaquina);
          }
        }
        for (const [recursoId, cap] of capacidadesNormais) {
          for (const data of GRADE) {
            const consumido = consumidoPorRecursoEData.get(`${recursoId}::${data}`) ?? 0;
            expect(consumido).toBeLessThanOrEqual(cap.capacidadeHorasMaquinaDia + 1e-9);
          }
        }

        const permutacoes = todasPermutacoes(necessidades);
        let melhorExato: string | null = null;
        for (const ordem of permutacoes) {
          const resultado = rodarComOrdemForcada({ ordem, capacidadesNormais, datasGrade: GRADE });
          const avaliacao = avaliarEntregaComercial(resultado);
          if (avaliacao.viavel && (melhorExato === null || avaliacao.dataEntrega < melhorExato)) {
            melhorExato = avaliacao.dataEntrega;
          }
        }

        if (melhorExato === null) {
          // Nenhuma ordem entre TODAS as permutações consegue concluir o conjunto inteiro - a heurística também não pode.
          expect(resultadoHeuristico.horizonteTecnico).toBe("insuficiente");
          return;
        }

        // Existe pelo menos 1 ordem viável - "menos alternativas primeiro" precisa achar uma também, e a
        // data de entrega dela NUNCA pode ser pior que a melhor entre todas as ordens exatas.
        expect(resultadoHeuristico.horizonteTecnico).toBe("suficiente");
        if (resultadoHeuristico.horizonteTecnico === "suficiente") {
          expect(resultadoHeuristico.primeiraEntregaPossivel).toBe(melhorExato);
        }
      }),
      // Seed FIXA (não omitida) - determinismo exigido: reproduzir manualmente com
      // `fc.assert(fc.property(arbitrarioCasoComercial, ...), { seed: -1334825345 })`.
      { numRuns: 300, seed: -1334825345 },
    );
  });
});

describe("avaliarPrevisaoComercialFlexivel — sem recurso morto (toda alternativa tem capacidade > 0)", () => {
  // CONTRAEXEMPLO CONFIRMADO SOB A HEURÍSTICA ANTIGA (2026-08-16, seed
  // abaixo) - "menos alternativas primeiro" falhava mesmo com TODOS os
  // recursos tendo capacidade positiva sempre (nenhum recurso morto):
  // a regra contava ALTERNATIVAS NOMINALMENTE (tamanho da lista), nunca
  // pelo saldo/margem real de cada uma nem pela urgência de OUTRAS OPs
  // que competem pelo MESMO recurso escasso. CORRIGIDO pela distribuição
  // conjunta exata (redeFluxoCapacidadeComercial.ts) - seed mantida fixa
  // por determinismo, não por falha conhecida.
  it("a previsão comercial sempre entrega na MELHOR data possível mesmo quando NENHUM recurso tem capacidade zero - alternativas reais, mas com pouco saldo/tempo, não são mais 'furadas'", () => {
    // Timeout explícito (padrão vitest é 5000ms): a enumeração exata por
    // permutação (todasPermutacoes) é fatorial no nº de necessidades - sob
    // concorrência da suíte inteira (não isolado), 500 runs passam de 5s
    // por contenção de CPU, não por regressão de lógica (confirmado:
    // roda em ~4,2s isolado). Escopo local a este teste, não config global.
    fc.assert(
      fc.property(arbitrarioCasoComercialSemRecursoMorto, (caso) => {
        const { necessidades, capacidadesNormais } = montarCenarioComercial(caso);

        const resultadoHeuristico = avaliarPrevisaoComercialFlexivel({
          dataSolicitadaCliente: GRADE[GRADE.length - 1],
          compromissosConfirmados: [],
          necessidadesOrcamentoNovo: necessidades,
          capacidadesNormais,
          capacidadeExtraAutorizada: [],
          temporariosPorPrioridade: [],
          datasGrade: GRADE,
        });

        for (const opResultado of resultadoHeuristico.resultadosPorOp) {
          expect(opResultado.resultado.horasAlocadasPadrao + opResultado.resultado.deficitResidualHorasPadrao).toBeCloseTo(
            opResultado.resultado.horasNecessariasPadrao,
            6,
          );
        }

        const consumidoPorRecursoEData = new Map<string, number>();
        for (const opResultado of resultadoHeuristico.resultadosPorOp) {
          for (const a of opResultado.resultado.alocacoes) {
            const chaveConsumo = `${a.recursoId}::${a.data}`;
            consumidoPorRecursoEData.set(chaveConsumo, (consumidoPorRecursoEData.get(chaveConsumo) ?? 0) + a.horasMaquina);
          }
        }
        for (const [recursoId, cap] of capacidadesNormais) {
          for (const data of GRADE) {
            const consumido = consumidoPorRecursoEData.get(`${recursoId}::${data}`) ?? 0;
            expect(consumido).toBeLessThanOrEqual(cap.capacidadeHorasMaquinaDia + 1e-9);
          }
        }

        const permutacoes = todasPermutacoes(necessidades);
        let melhorExato: string | null = null;
        for (const ordem of permutacoes) {
          const resultado = rodarComOrdemForcada({ ordem, capacidadesNormais, datasGrade: GRADE });
          const avaliacao = avaliarEntregaComercial(resultado);
          if (avaliacao.viavel && (melhorExato === null || avaliacao.dataEntrega < melhorExato)) {
            melhorExato = avaliacao.dataEntrega;
          }
        }

        if (melhorExato === null) {
          expect(resultadoHeuristico.horizonteTecnico).toBe("insuficiente");
          return;
        }

        expect(resultadoHeuristico.horizonteTecnico).toBe("suficiente");
        if (resultadoHeuristico.horizonteTecnico === "suficiente") {
          expect(resultadoHeuristico.primeiraEntregaPossivel).toBe(melhorExato);
        }
      }),
      // Seed FIXA (não omitida) - determinismo exigido: reproduzir manualmente com
      // `fc.assert(fc.property(arbitrarioCasoComercialSemRecursoMorto, ...), { seed: 1472966375 })`.
      { numRuns: 500, seed: 1472966375 },
    );
  }, 20_000);
});

// --- Terceiro gerador: capacidade adicional + recursos temporários ---
//
// Os 2 geradores acima isolam deliberadamente a disputa de capacidade
// NORMAL (original/compatível) - "Escopo deliberadamente restrito" no
// cabeçalho do arquivo. Agora que a distribuição conjunta exata
// (redeFluxoCapacidadeComercial.ts) está implementada, o plano técnico
// aprovado exige testar TAMBÉM os tiers de adicional e temporário -
// inclusive o sub-tier "temporário vinculado ao original" - antes de
// considerar o motor pronto. Reaproveita os MESMOS
// rodarComOrdemForcada/avaliarEntregaComercial/todasPermutacoes (só
// estendidos para aceitar capacidadeExtraAutorizada/temporariosPorPrioridade).
const NUM_DIAS_EXTRA_TEMPORARIO = 4;

interface CasoGeradoComercialCompleto extends CasoGeradoComercial {
  /** [recursoIdx][diaIdx] - horas adicionais (natureza "hora_extra") autorizadas nesse dia; 0 = nenhuma. */
  extrasPorRecurso: number[][];
  numTemporarios: number;
  temporarioProdutividades: number[];
  /** Índice do recurso real de referência (produtividade herdada) - também usado para decidir "vinculado ao original" quando bate com o recursoOriginalId de uma necessidade. */
  temporarioReferenciaIdx: number[];
  /** [temporarioIdx][diaIdx] - horas disponíveis nesse dia; 0 = indisponível. */
  temporarioDisponibilidades: number[][];
}

const arbitrarioCasoComercialCompleto: fc.Arbitrary<CasoGeradoComercialCompleto> = fc
  .tuple(fc.integer({ min: 2, max: MAX_NECESSIDADES_BUSCA_EXAUSTIVA }), fc.integer({ min: 1, max: 3 }), fc.integer({ min: 0, max: 2 }))
  .chain(([numNecessidades, numRecursos, numTemporarios]) =>
    fc.record({
      numNecessidades: fc.constant(numNecessidades),
      numRecursos: fc.constant(numRecursos),
      produtividades: fc.array(fc.constantFrom(0.5, 1), { minLength: numRecursos, maxLength: numRecursos }),
      capacidades: fc.array(fc.constantFrom(1, 2, 4), { minLength: numRecursos, maxLength: numRecursos }),
      horasNecessarias: fc.array(fc.integer({ min: 1, max: 8 }), { minLength: numNecessidades, maxLength: numNecessidades }),
      offsets: fc.array(fc.integer({ min: 0, max: 2 }), { minLength: numNecessidades, maxLength: numNecessidades }),
      recursoOriginalIdx: fc.array(fc.integer({ min: 0, max: numRecursos - 1 }), { minLength: numNecessidades, maxLength: numNecessidades }),
      compativeisIdx: fc.array(fc.uniqueArray(fc.integer({ min: 0, max: numRecursos - 1 }), { maxLength: numRecursos }), {
        minLength: numNecessidades,
        maxLength: numNecessidades,
      }),
      extrasPorRecurso: fc.array(fc.array(fc.constantFrom(0, 0, 1, 2), { minLength: NUM_DIAS_EXTRA_TEMPORARIO, maxLength: NUM_DIAS_EXTRA_TEMPORARIO }), {
        minLength: numRecursos,
        maxLength: numRecursos,
      }),
      numTemporarios: fc.constant(numTemporarios),
      temporarioProdutividades: fc.array(fc.constantFrom(0.5, 1), { minLength: numTemporarios, maxLength: numTemporarios }),
      // -1 = "sem vínculo real" (referência a um recurso fora do conjunto) - garante que o sub-tier "geral" também é exercitado, não só o "vinculado".
      temporarioReferenciaIdx: fc.array(fc.integer({ min: -1, max: numRecursos - 1 }), { minLength: numTemporarios, maxLength: numTemporarios }),
      temporarioDisponibilidades: fc.array(fc.array(fc.constantFrom(0, 0, 1, 2), { minLength: NUM_DIAS_EXTRA_TEMPORARIO, maxLength: NUM_DIAS_EXTRA_TEMPORARIO }), {
        minLength: numTemporarios,
        maxLength: numTemporarios,
      }),
    }),
  );

function montarCenarioComercialCompleto(caso: CasoGeradoComercialCompleto) {
  const { necessidades, capacidadesNormais } = montarCenarioComercial(caso);
  const recursoIds = Array.from({ length: caso.numRecursos }, (_, i) => `R${i}`);

  const capacidadeExtraAutorizada = recursoIds.flatMap((recursoId, recursoIdx) =>
    caso.extrasPorRecurso[recursoIdx].flatMap((horas, diaIdx) =>
      horas > 0
        ? [{ recursoId, data: GRADE[diaIdx], horasAdicionaisDisponiveis: horas, natureza: "hora_extra" as const, elegibilidade: { escopo: "qualquer_projeto_do_cenario" as const }, contratacaoId: `extra-${recursoId}-${diaIdx}` }]
        : [],
    ),
  );

  const temporariosPorPrioridade = Array.from({ length: caso.numTemporarios }, (_, i) => {
    const referenciaIdx = caso.temporarioReferenciaIdx[i];
    const recursoReferenciaId = referenciaIdx >= 0 ? recursoIds[referenciaIdx] : "recurso-fora-do-conjunto";
    const disponibilidade = caso.temporarioDisponibilidades[i]
      .map((horas, diaIdx) => ({ data: GRADE[diaIdx], horasDisponiveis: horas }))
      .filter((d) => d.horasDisponiveis > 0);
    return {
      recursoTemporario: {
        idTemporario: `T${i}`,
        tipo: "freelancer" as const,
        recursoReferenciaId,
        disponibilidade,
        contratacaoId: `temp-${i}`,
        justificativa: "gerado por teste de propriedade",
        aplicavelAsOperacoes: [],
      },
      produtividadeReferencia: caso.temporarioProdutividades[i],
    };
  });

  return { necessidades, capacidadesNormais, capacidadeExtraAutorizada, temporariosPorPrioridade };
}

/** Igual a rodarComOrdemForcada, mas com adicional/temporário também disponíveis - a MESMA cascata de tiers do núcleo público. */
function rodarComOrdemForcadaCompleto(params: {
  ordem: readonly NecessidadeCapacidadeFlexivel[];
  capacidadesNormais: ReadonlyMap<string, CapacidadeNormalRecurso>;
  capacidadeExtraAutorizada: readonly CapacidadeExtraDia[];
  temporariosPorPrioridade: readonly DecisaoRecursoTemporario[];
  datasGrade: readonly string[];
}): Map<string, ResultadoDistribuicaoFlexivel> {
  const { ordem, capacidadesNormais, capacidadeExtraAutorizada, temporariosPorPrioridade, datasGrade } = params;

  const extraPorRecurso = new Map<string, CapacidadeExtraDia[]>();
  for (const extra of capacidadeExtraAutorizada) {
    if (!extraPorRecurso.has(extra.recursoId)) extraPorRecurso.set(extra.recursoId, []);
    extraPorRecurso.get(extra.recursoId)!.push(extra);
  }
  const candidatosNormaisPorRecurso = new Map<string, CandidatoComCapacidadeDiaria>();
  for (const [recursoId, cap] of capacidadesNormais) {
    candidatosNormaisPorRecurso.set(recursoId, criarCandidatoNormalComExtra(recursoId, cap.capacidadeHorasMaquinaDia, cap.produtividade, extraPorRecurso.get(recursoId) ?? []));
  }

  const candidatosTemporariosPorPrioridade = temporariosPorPrioridade.map((d) => criarCandidatoRecursoTemporario(d.recursoTemporario, d.produtividadeReferencia));
  const contratacaoIdPorTemporario = new Map(temporariosPorPrioridade.map((d) => [d.recursoTemporario.idTemporario, d.recursoTemporario.contratacaoId]));

  const resultados = new Map<string, ResultadoDistribuicaoFlexivel>();
  for (const necessidade of ordem) {
    resultados.set(
      necessidade.chaveTrabalho,
      distribuirNecessidadeSobreCandidatos({
        necessidade,
        ehOrcamentoNovo: true,
        candidatosNormaisPorRecurso,
        candidatosTemporariosPorPrioridade,
        contratacaoIdPorTemporario,
        datasOrdenadas: datasGrade,
      }),
    );
  }
  return resultados;
}

describe("avaliarPrevisaoComercialFlexivel — com capacidade adicional e recursos temporários", () => {
  // Diferença importante frente aos 2 geradores anteriores: o verificador
  // (`rodarComOrdemForcadaCompleto`) só enumera ORDENS DE DESPACHO
  // SEQUENCIAIS (cada OP processada por inteiro, uma de cada vez, via o
  // núcleo `distribuirNecessidadeSobreCandidatos`) - o mesmo modelo da
  // heurística ANTIGA. Isso bastava como teto exato enquanto só a
  // capacidade normal estava em jogo (confirmado: centenas de casos sem
  // NENHUM contraexemplo nos 2 geradores acima). Mas com adicional/
  // temporário como dimensões extras, a rede de fluxo (que otimiza
  // TODAS as OPs e TODOS os tiers juntos) pode achar uma divisão do
  // MESMO dia entre 2 OPs diferentes que NENHUMA ordem sequencial
  // consegue representar (ex.: OP-A fica com parte da capacidade extra
  // de um recurso e OP-B com o resto, no mesmo dia, sem que nenhuma das
  // duas esgote o dia sozinha primeiro) - verificado à mão num
  // contraexemplo achado aqui (seed -1497372522): a rede entregava em
  // 2026-09-02, "pior" que o teto sequencial de 2026-09-03, quando na
  // verdade 2026-09-02 é FACTÍVEL (conferido manualmente, dividindo a
  // capacidade de R1 entre as 2 OPs no mesmo dia) - ou seja, a rede
  // estava CERTA e o verificador sequencial é só um LIMITE INFERIOR de
  // qualidade aqui, não mais o ótimo exato. Por isso a asserção abaixo é
  // "nunca pior que o sequencial" (<=), não "sempre igual" (===) -
  // ainda pega qualquer regressão real (a rede piorando), sem reportar
  // falso-positivo quando ela genuinamente supera o modelo sequencial.
  it("a previsão comercial nunca é PIOR que qualquer ordem de despacho sequencial, também quando adicional/temporário estão em jogo (inclusive o sub-tier 'temporário vinculado ao original')", () => {
    fc.assert(
      fc.property(arbitrarioCasoComercialCompleto, (caso) => {
        const { necessidades, capacidadesNormais, capacidadeExtraAutorizada, temporariosPorPrioridade } = montarCenarioComercialCompleto(caso);

        const resultadoHeuristico = avaliarPrevisaoComercialFlexivel({
          dataSolicitadaCliente: GRADE[GRADE.length - 1],
          compromissosConfirmados: [],
          necessidadesOrcamentoNovo: necessidades,
          capacidadesNormais,
          capacidadeExtraAutorizada,
          temporariosPorPrioridade,
          datasGrade: GRADE,
        });

        for (const opResultado of resultadoHeuristico.resultadosPorOp) {
          expect(opResultado.resultado.horasAlocadasPadrao + opResultado.resultado.deficitResidualHorasPadrao).toBeCloseTo(
            opResultado.resultado.horasNecessariasPadrao,
            6,
          );
        }

        const permutacoes = todasPermutacoes(necessidades);
        let melhorExato: string | null = null;
        for (const ordem of permutacoes) {
          const resultado = rodarComOrdemForcadaCompleto({ ordem, capacidadesNormais, capacidadeExtraAutorizada, temporariosPorPrioridade, datasGrade: GRADE });
          const avaliacao = avaliarEntregaComercial(resultado);
          if (avaliacao.viavel && (melhorExato === null || avaliacao.dataEntrega < melhorExato)) {
            melhorExato = avaliacao.dataEntrega;
          }
        }

        // Se NENHUMA ordem sequencial resolve (melhorExato === null), a
        // rede ainda pode achar uma solução (exatamente a divisão de
        // mesmo-dia que o modelo sequencial não representa) - nada a
        // comparar nesse caso além das checagens de conservação já
        // feitas acima. Se ALGUMA ordem sequencial resolve, a rede
        // NUNCA pode ser pior (nem inviável, nem numa data posterior).
        if (melhorExato !== null) {
          expect(resultadoHeuristico.horizonteTecnico).toBe("suficiente");
          if (resultadoHeuristico.horizonteTecnico === "suficiente") {
            expect(resultadoHeuristico.primeiraEntregaPossivel! <= melhorExato).toBe(true);
          }
        }
      }),
      // Seed FIXA (não omitida) - inclui deliberadamente o caso que revelou a
      // limitação do verificador sequencial (comentário acima da suíte).
      { numRuns: 500, seed: -1497372522 },
    );
  });
});

describe("avaliarPrevisaoComercialFlexivel — regressão fixa: contraexemplo SEM recurso morto corrigido pela rede de fluxo (Fase 2, 2026-08-16)", () => {
  // Reprodução mínima e legível do 2º contraexemplo (fast-check seed
  // 1472966375, 5 OPs / 3 recursos, TODOS com capacidade > 0 sempre -
  // diferente do 1º contraexemplo, que dependia de um recurso morto).
  // Achado sob a heurística "menos alternativas primeiro" (entregava em
  // 2026-09-09); CORRIGIDO pela distribuição conjunta exata
  // (redeFluxoCapacidadeComercial.ts) - este teste agora documenta o
  // comportamento CORRETO (2026-09-08), como regressão permanente.
  //
  // Cenário: R0 (4h-máquina/dia, produtividade 0.5 => 2h-padrão/dia),
  // R1 (6h-máquina/dia, produtividade 0.25 => 1.5h-padrão/dia), R2
  // (1h-máquina/dia, produtividade 0.25 => 0.25h-padrão/dia - pequeno,
  // mas nunca zero). 5 OPs:
  // - OP-0 (3h) e OP-4 (3h): original R1, SEM compatível - 0 alternativas.
  // - OP-3 (1h): original R0, SEM compatível - 0 alternativas.
  // - OP-1 (2h): original R0, compatível R2 - 1 alternativa.
  // - OP-2 (11h, a maior de todas): original R1, compatível R0 - 1 alternativa.
  //
  // A heurística antiga tratava OP-1 e OP-2 como empatados (1
  // alternativa cada) e desempatava por chaveTrabalho - OP-1 (que
  // precisava de só 2h e teria em R2, sozinho, capacidade de sobra ao
  // longo do tempo) consumia um pedaço de R0 que OP-2 (11h, a maior
  // demanda do lote, cujo recurso original R1 já estava tomado pelas OPs
  // sem alternativa) precisava com muito mais urgência - entregando em
  // 2026-09-09. A rede de fluxo acha a menor data (2026-09-08) primeiro,
  // sem nenhuma preferência de negócio envolvida, e só depois desvia OP-1
  // para R2 - nunca aceita a data pior só para privilegiar o original.
  it("OP-2 (a maior demanda, 11h) recebe a capacidade de R0 que precisa - OP-1 desvia para R2, mesmo sendo mais lenta", () => {
    const capacidadesNormais: ReadonlyMap<string, CapacidadeNormalRecurso> = new Map([
      ["R0", { recursoId: "R0", produtividade: 0.5, capacidadeHorasMaquinaDia: 4 }],
      ["R1", { recursoId: "R1", produtividade: 0.25, capacidadeHorasMaquinaDia: 6 }],
      ["R2", { recursoId: "R2", produtividade: 0.25, capacidadeHorasMaquinaDia: 1 }],
    ]);

    const necessidades: NecessidadeCapacidadeFlexivel[] = [
      { empresaId: "empresa-1", projetoId: "projeto-novo", projetoItemId: "item-0", chaveTrabalho: "OP-0", recursoOriginalId: "R1", recursosCompativeisPorPrioridade: [], horasNecessariasPadrao: 3, disponivelAPartirDe: GRADE[2] },
      { empresaId: "empresa-1", projetoId: "projeto-novo", projetoItemId: "item-1", chaveTrabalho: "OP-1", recursoOriginalId: "R0", recursosCompativeisPorPrioridade: ["R2"], horasNecessariasPadrao: 2, disponivelAPartirDe: GRADE[3] },
      { empresaId: "empresa-1", projetoId: "projeto-novo", projetoItemId: "item-2", chaveTrabalho: "OP-2", recursoOriginalId: "R1", recursosCompativeisPorPrioridade: ["R0"], horasNecessariasPadrao: 11, disponivelAPartirDe: GRADE[3] },
      { empresaId: "empresa-1", projetoId: "projeto-novo", projetoItemId: "item-3", chaveTrabalho: "OP-3", recursoOriginalId: "R0", recursosCompativeisPorPrioridade: [], horasNecessariasPadrao: 1, disponivelAPartirDe: GRADE[3] },
      { empresaId: "empresa-1", projetoId: "projeto-novo", projetoItemId: "item-4", chaveTrabalho: "OP-4", recursoOriginalId: "R1", recursosCompativeisPorPrioridade: [], horasNecessariasPadrao: 3, disponivelAPartirDe: GRADE[2] },
    ];

    const resultado = avaliarPrevisaoComercialFlexivel({
      dataSolicitadaCliente: GRADE[GRADE.length - 1],
      compromissosConfirmados: [],
      necessidadesOrcamentoNovo: necessidades,
      capacidadesNormais,
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasGrade: GRADE,
    });

    expect(resultado.horizonteTecnico).toBe("suficiente");
    expect(resultado.primeiraEntregaPossivel).toBe("2026-09-08");
  });
});

describe("avaliarPrevisaoComercialFlexivel — regressão fixa: contraexemplo COM recurso morto corrigido pela rede de fluxo (Fase 2, 2026-08-16)", () => {
  // Reprodução mínima e legível do 1º contraexemplo (fast-check seed
  // -1334825345, encolhido para 5 OPs / 3 recursos). Achado sob a
  // heurística "menos alternativas primeiro" (entregava em 2026-09-04);
  // CORRIGIDO pela distribuição conjunta exata
  // (redeFluxoCapacidadeComercial.ts) - este teste agora documenta o
  // comportamento CORRETO (2026-09-03), como regressão permanente.
  //
  // Cenário: 3 recursos - R0 (4h-máquina/dia), R1 (8h-máquina/dia, folgado),
  // R2 (0h-máquina/dia - SEM capacidade nenhuma, um recurso "morto" no
  // cadastro). Produtividade 0.5 em todos (4h-máquina = 2h-padrão/dia em
  // R0, 4h-padrão/dia em R1). 5 OPs, todas disponíveis desde o dia 1
  // (2026-09-01):
  // - OP-0, OP-1, OP-2 (1h cada): original R0, compatível R1 - podem
  //   perfeitamente usar R1 (folgado) se R0 estiver ocupado.
  // - OP-3 (5h): original R2 (SEM capacidade - nunca produz nada),
  //   compatível R0 - na prática, R0 é o ÚNICO recurso que existe para
  //   ela, mas `recursosCompativeisPorPrioridade.length` conta 1 (o
  //   compatível R0), igual a OP-0/1/2 - a regra não sabe que o
  //   "original" dela é uma alternativa morta.
  // - OP-4 (1h): original R0, SEM compatível - a única com 0 alternativas de verdade.
  //
  // A heurística antiga tratava OP-0/1/2/3 como empatados (1 alternativa
  // cada) e desempatava por chaveTrabalho - OP-0 consumia 1h de R0
  // (mesmo podendo ter ido para R1, que sobra), roubando de OP-3 (que
  // não tinha NENHUM outro lugar para ir) 1h de uma capacidade que ela
  // precisava - entregando em 2026-09-04. A rede de fluxo acha a menor
  // data (2026-09-03) primeiro, sem nenhuma preferência de negócio
  // envolvida, e só depois desvia OP-0/1/2 para R1 - nunca aceita a data
  // pior só para privilegiar o original.
  it("OP-3 (única alternativa real é o compatível, já que o original tem capacidade zero) recebe a capacidade escassa que precisa", () => {
    const capacidadesNormais: ReadonlyMap<string, CapacidadeNormalRecurso> = new Map([
      ["R0", { recursoId: "R0", produtividade: 0.5, capacidadeHorasMaquinaDia: 4 }],
      ["R1", { recursoId: "R1", produtividade: 0.5, capacidadeHorasMaquinaDia: 8 }],
      ["R2", { recursoId: "R2", produtividade: 0.5, capacidadeHorasMaquinaDia: 0 }],
    ]);

    function necessidade(overrides: Partial<NecessidadeCapacidadeFlexivel> & { chaveTrabalho: string }): NecessidadeCapacidadeFlexivel {
      return {
        empresaId: "empresa-1",
        projetoId: "projeto-novo",
        projetoItemId: `item-${overrides.chaveTrabalho}`,
        recursoOriginalId: "R0",
        recursosCompativeisPorPrioridade: [],
        horasNecessariasPadrao: 1,
        disponivelAPartirDe: GRADE[0],
        ...overrides,
      };
    }

    const necessidades: NecessidadeCapacidadeFlexivel[] = [
      necessidade({ chaveTrabalho: "OP-0", recursosCompativeisPorPrioridade: ["R1"] }),
      necessidade({ chaveTrabalho: "OP-1", recursosCompativeisPorPrioridade: ["R1"] }),
      necessidade({ chaveTrabalho: "OP-2", recursosCompativeisPorPrioridade: ["R1"] }),
      necessidade({ chaveTrabalho: "OP-3", recursoOriginalId: "R2", recursosCompativeisPorPrioridade: ["R0"], horasNecessariasPadrao: 5 }),
      necessidade({ chaveTrabalho: "OP-4", recursosCompativeisPorPrioridade: [] }),
    ];

    const resultado = avaliarPrevisaoComercialFlexivel({
      dataSolicitadaCliente: GRADE[GRADE.length - 1],
      compromissosConfirmados: [],
      necessidadesOrcamentoNovo: necessidades,
      capacidadesNormais,
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasGrade: GRADE,
    });

    expect(resultado.horizonteTecnico).toBe("suficiente");
    expect(resultado.primeiraEntregaPossivel).toBe("2026-09-03");
  });
});

describe("avaliarPrevisaoComercialFlexivel — confirmados nunca entram na rede de substituição", () => {
  // Caso adversarial: o confirmado ocupa EXATAMENTE o recurso/dia que
  // seria o alvo ideal de troca para 2 OPs do orçamento novo (mesmo
  // padrão OP-sem-alternativa/OP-com-alternativa que a rede resolve
  // corretamente ENTRE elas - aqui a pergunta é se a rede tentaria
  // "recuperar" a capacidade do confirmado do mesmo jeito, o que NUNCA
  // pode acontecer).
  //
  // Sem o confirmado: RA(dia1)=4h + RB(dia1)=4h = 8h, exatamente o que
  // OP-0(4h, só RA) + OP-1(4h, RA ou RB) precisam - ambas terminariam no
  // dia1 (OP-0 em RA, OP-1 desviada para RB). COM o confirmado
  // consumindo os 4h de RA no dia1: OP-0 (sem alternativa) não tem mais
  // NADA no dia1 - precisa esperar o dia2. A rede jamais pode "descobrir"
  // que desviar o confirmado resolveria isso - ele é FIXO.
  it("confirmado ocupando o recurso/dia que seria o alvo ideal de troca não é tocado pela rede - a OP sem alternativa espera, nunca desvia o confirmado", () => {
    const datasGrade = ["2026-10-01", "2026-10-02"];
    const capacidadesNormais = new Map<string, CapacidadeNormalRecurso>([
      ["RA", { recursoId: "RA", capacidadeHorasMaquinaDia: 4, produtividade: 1 }],
      ["RB", { recursoId: "RB", capacidadeHorasMaquinaDia: 4, produtividade: 1 }],
    ]);

    const confirmado: CompromissoCapacidade = {
      empresaId: "empresa-1",
      projetoId: "projeto-confirmado",
      recursoId: "RA",
      horasRestantesPadrao: 4,
      disponivelAPartirDe: datasGrade[0],
      dataEntradaFila: "2026-09-01",
      prioridade: 0,
      classeFila: "confirmado",
      chaveOrdenacao: "confirmado-1",
      origem: "snapshot_comercial",
      chavesTrabalhoOrigem: ["op-confirmado-1"],
    };

    const opSemAlternativa: NecessidadeCapacidadeFlexivel = {
      empresaId: "empresa-1",
      projetoId: "projeto-novo",
      projetoItemId: "item-0",
      chaveTrabalho: "OP-0",
      recursoOriginalId: "RA",
      recursosCompativeisPorPrioridade: [],
      horasNecessariasPadrao: 4,
      disponivelAPartirDe: datasGrade[0],
    };
    const opComAlternativa: NecessidadeCapacidadeFlexivel = {
      empresaId: "empresa-1",
      projetoId: "projeto-novo",
      projetoItemId: "item-1",
      chaveTrabalho: "OP-1",
      recursoOriginalId: "RA",
      recursosCompativeisPorPrioridade: ["RB"],
      horasNecessariasPadrao: 4,
      disponivelAPartirDe: datasGrade[0],
    };

    const resultado = avaliarPrevisaoComercialFlexivel({
      dataSolicitadaCliente: datasGrade[datasGrade.length - 1],
      compromissosConfirmados: [confirmado],
      necessidadesOrcamentoNovo: [opSemAlternativa, opComAlternativa],
      capacidadesNormais,
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasGrade,
    });

    // A referência independente: rodar SÓ o confirmado via alocarOperacaoDiaAdia
    // (o mesmo bloco que avaliarPrevisaoComercialFlexivel usa por dentro,
    // chamado aqui isoladamente) - confirma que o saldo que sobra pro
    // orçamento novo em RA/dia1 é exatamente 0, nunca renegociado pela rede.
    const candidatoConfirmadoIsolado = criarCandidatoNormalComExtra("RA", 4, 1, []);
    const resultadoConfirmadoIsolado = alocarOperacaoDiaAdia({
      necessarioHorasPadrao: confirmado.horasRestantesPadrao,
      candidatosPorPrioridade: [candidatoConfirmadoIsolado],
      datasOrdenadas: datasGrade,
      projetoId: confirmado.projetoId,
      ehOrcamentoNovo: false,
    });
    expect(resultadoConfirmadoIsolado.deficitResidualHorasPadrao).toBe(0);
    expect(resultadoConfirmadoIsolado.alocacoes).toEqual([{ recursoId: "RA", data: datasGrade[0], natureza: "normal", contratacaoId: null, horasMaquina: 4, horasPadrao: 4 }]);

    // A OP sem alternativa nunca usa dia1 de RA (é do confirmado) - só dia2.
    const opSemAlternativaResultado = resultado.resultadosPorOp.find((r) => r.chaveTrabalho === "OP-0")!;
    expect(opSemAlternativaResultado.resultado.status).toBe("concluida");
    expect(opSemAlternativaResultado.resultado.alocacoes).toEqual([
      { chaveTrabalho: "OP-0", recursoId: "RA", tipoCapacidade: "normal_original", data: datasGrade[1], horasPadrao: 4, horasMaquina: 4, contratacaoId: null },
    ]);

    // A OP com alternativa desvia inteiramente pra RB no dia1 - nunca "espera" a vez de RA.
    const opComAlternativaResultado = resultado.resultadosPorOp.find((r) => r.chaveTrabalho === "OP-1")!;
    expect(opComAlternativaResultado.resultado.status).toBe("concluida");
    expect(opComAlternativaResultado.resultado.alocacoes).toEqual([
      { chaveTrabalho: "OP-1", recursoId: "RB", tipoCapacidade: "normal_compativel", data: datasGrade[0], horasPadrao: 4, horasMaquina: 4, contratacaoId: null },
    ]);

    expect(resultado.horizonteTecnico).toBe("suficiente");
    expect(resultado.primeiraEntregaPossivel).toBe(datasGrade[1]); // determinado pela OP sem alternativa, empurrada pelo confirmado - nunca antecipável pela rede.
  });
});
