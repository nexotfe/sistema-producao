// Verificação exata do escalonador guloso (fila de prontos, DEC-007 §7) -
// NUNCA entra em produção, só teste. `escalonarConjuntoComFilaDeProntos`
// processa uma ocorrência pronta por vez, escolhida por um critério de
// desempate total (prioridade -> data mínima -> chave) - isso é
// determinístico, mas não é o mesmo que ÓTIMO: para conjuntos de
// ocorrências disputando os mesmos recursos escassos, a ORDEM de
// despacho pode alterar qual arranjo global é alcançado, e nada aqui
// prova que a ordem escolhida pelo desempate é sempre a que entrega o
// projeto mais cedo possível entre TODAS as ordens válidas.
//
// Este arquivo constrói um verificador por força bruta: para um conjunto
// pequeno de ocorrências, enumera TODAS as ordens topológicas válidas
// (toda sequência de despacho que respeita precedência) e, para cada
// uma, reaproveita a MESMA função pública `escalonarConjuntoComFilaDeProntos`
// - nunca uma reimplementação paralela do laço interno - forçando aquela
// ordem através de um `criterioPrioridadeDeNegocio` com índices
// estritamente crescentes (prioridade domina totalmente o desempate,
// então índices distintos reproduzem exatamente a ordem pedida). A
// heurística de produção (`PRIORIDADE_UNICA` - ver avaliarCenario.ts) é
// só mais uma dessas ordens; o verificador não faz suposição nenhuma
// sobre qual ordem é boa, só testa todas.
//
// Teto de N (MAX_OCORRENCIAS_BUSCA_EXAUSTIVA): busca exaustiva é O(N!) -
// crescer N sem rever o teto pode travar o CI. 5 ocorrências = no máximo
// 120 ordens por caso, rápido mesmo em centenas de casos gerados.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  escalonarConjuntoComFilaDeProntos,
  type OcorrenciaEscalonavel,
  type ResultadoOcorrenciaEscalonada,
} from "./escalonadorConjunto";
import { resolverOcorrenciasLiberadas, type DependenciaOcorrencia } from "./grafoPrecedencia";
import { diaCivilSeguinte } from "./datasPrecedencia";
import type { CandidatoComCapacidadeDiaria } from "./alocarOperacaoDiaAdia";
import { chaveOcorrenciaParaString, type ChaveOcorrencia } from "./chaveOcorrencia";

const MAX_OCORRENCIAS_BUSCA_EXAUSTIVA = 5;
const NUM_DIAS_GRADE = 10;

function gerarGradeDatas(base: string, quantidade: number): string[] {
  const datas = [base];
  for (let i = 1; i < quantidade; i++) datas.push(diaCivilSeguinte(datas[i - 1]));
  return datas;
}

const GRADE = gerarGradeDatas("2027-01-04", NUM_DIAS_GRADE);

function chave(bomOperacaoId: string): ChaveOcorrencia {
  return { projetoItemId: "PI-1", produtoRaizId: "PR-1", caminhoBomItemIds: [], bomOperacaoId };
}

function ocorrencia(overrides: Partial<OcorrenciaEscalonavel> & { chave: ChaveOcorrencia }): OcorrenciaEscalonavel {
  return {
    projetoId: "projeto-generico",
    necessarioHorasPadrao: 1,
    candidatoIdsPorPrioridade: [],
    ehOrcamentoNovo: false,
    dataInicioJanela: GRADE[0],
    ...overrides,
  };
}

/** Candidato só com faixa "normal" - mesmo padrão de escalonadorConjunto.test.ts. */
function criarCandidato(id: string, produtividade: number, capacidadePorData: Record<string, number>): CandidatoComCapacidadeDiaria {
  const restante = { ...capacidadePorData };
  return {
    id,
    produtividade,
    faixasDoDia: (data) =>
      data in restante ? [{ natureza: "normal", horasDisponiveis: restante[data], contratacaoId: null, elegibilidade: null }] : [],
    consumir: (data, _natureza, horasMaquina) => {
      restante[data] = (restante[data] ?? 0) - horasMaquina;
    },
  };
}

/**
 * Todas as ordens topológicas válidas do conjunto (toda sequência de
 * despacho onde cada ocorrência só aparece depois de TODAS as suas
 * predecessoras) - backtracking simples sobre `resolverOcorrenciasLiberadas`,
 * a MESMA função que o escalonador real usa para decidir quem está
 * pronto a cada rodada.
 */
function todasOrdensTopologicas(chaves: ChaveOcorrencia[], dependencias: DependenciaOcorrencia[]): ChaveOcorrencia[][] {
  if (chaves.length > MAX_OCORRENCIAS_BUSCA_EXAUSTIVA) {
    throw new RangeError(
      `todasOrdensTopologicas: ${chaves.length} ocorrências excede o teto de busca exaustiva (${MAX_OCORRENCIAS_BUSCA_EXAUSTIVA}).`,
    );
  }

  const resultado: ChaveOcorrencia[][] = [];
  const concluidas = new Set<string>();
  const escolhidas: ChaveOcorrencia[] = [];

  function backtrack(): void {
    if (escolhidas.length === chaves.length) {
      resultado.push([...escolhidas]);
      return;
    }
    const liberadas = resolverOcorrenciasLiberadas(chaves, dependencias, concluidas);
    for (const candidata of liberadas) {
      const chaveStr = chaveOcorrenciaParaString(candidata);
      concluidas.add(chaveStr);
      escolhidas.push(candidata);
      backtrack();
      escolhidas.pop();
      concluidas.delete(chaveStr);
    }
  }
  backtrack();
  return resultado;
}

/**
 * Roda o escalonador REAL forçando uma ordem de despacho específica -
 * prioridade = índice na ordem desejada (estritamente crescente, então
 * domina totalmente o desempate por data mínima/chave, sem precisar de
 * nenhuma reimplementação do laço interno).
 */
function rodarComOrdemForcada(params: {
  ordem: ChaveOcorrencia[];
  ocorrencias: OcorrenciaEscalonavel[];
  dependencias: DependenciaOcorrencia[];
  criarRegistroCandidatos: () => Map<string, CandidatoComCapacidadeDiaria>;
}): Map<string, ResultadoOcorrenciaEscalonada> {
  const { ordem, ocorrencias, dependencias, criarRegistroCandidatos } = params;
  const indicePorChaveStr = new Map(ordem.map((c, i) => [chaveOcorrenciaParaString(c), i]));
  return escalonarConjuntoComFilaDeProntos({
    ocorrencias,
    dependencias,
    registroCandidatos: criarRegistroCandidatos(),
    datasGradeCompartilhada: GRADE,
    criterioPrioridadeDeNegocio: (oc) => indicePorChaveStr.get(chaveOcorrenciaParaString(oc.chave))!,
  });
}

type AvaliacaoEntrega = { viavel: true; dataEntrega: string } | { viavel: false };

/** Entrega do projeto = TODAS as ocorrências concluídas (sem déficit em nenhuma) - data = a mais tardia entre elas. */
function avaliarEntrega(resultados: Map<string, ResultadoOcorrenciaEscalonada>): AvaliacaoEntrega {
  const todasConcluidas = [...resultados.values()].every((r) => r.status === "concluida");
  if (!todasConcluidas) return { viavel: false };
  const dataEntrega = [...resultados.values()].reduce((max, r) => (r.dataFimReal! > max ? r.dataFimReal! : max), "0000-00-00");
  return { viavel: true, dataEntrega };
}

interface CasoGerado {
  numOcorrencias: number;
  numCandidatos: number;
  produtividades: number[];
  capacidades: number[][];
  necessarios: number[];
  offsets: number[];
  compatibilidades: number[][];
  arestasBits: boolean[];
}

const arbitrarioCaso: fc.Arbitrary<CasoGerado> = fc
  .tuple(fc.integer({ min: 2, max: MAX_OCORRENCIAS_BUSCA_EXAUSTIVA }), fc.integer({ min: 1, max: 3 }))
  .chain(([numOcorrencias, numCandidatos]) =>
    fc.record({
      numOcorrencias: fc.constant(numOcorrencias),
      numCandidatos: fc.constant(numCandidatos),
      // produtividade válida: (0, 1] (validarProdutividade) - 0.5 e 1 bastam para variar sem invalidar o caso.
      produtividades: fc.array(fc.constantFrom(0.5, 1), { minLength: numCandidatos, maxLength: numCandidatos }),
      capacidades: fc.array(fc.array(fc.constantFrom(0, 4, 8), { minLength: NUM_DIAS_GRADE, maxLength: NUM_DIAS_GRADE }), {
        minLength: numCandidatos,
        maxLength: numCandidatos,
      }),
      necessarios: fc.array(fc.integer({ min: 1, max: 10 }), { minLength: numOcorrencias, maxLength: numOcorrencias }),
      offsets: fc.array(fc.integer({ min: 0, max: 2 }), { minLength: numOcorrencias, maxLength: numOcorrencias }),
      compatibilidades: fc.array(
        fc.uniqueArray(fc.integer({ min: 0, max: numCandidatos - 1 }), { minLength: 1, maxLength: numCandidatos }),
        { minLength: numOcorrencias, maxLength: numOcorrencias },
      ),
      // par (j, i) com j<i - até C(5,2)=10 pares (teto de MAX_OCORRENCIAS_BUSCA_EXAUSTIVA); casos menores usam só o prefixo.
      arestasBits: fc.array(fc.boolean(), { minLength: 10, maxLength: 10 }),
    }),
  );

function montarCenarioDeCaso(caso: CasoGerado) {
  const candidatoIds = Array.from({ length: caso.numCandidatos }, (_, i) => `R${i}`);
  const criarRegistroCandidatos = () =>
    new Map(
      candidatoIds.map((id, i) => [
        id,
        criarCandidato(id, caso.produtividades[i], Object.fromEntries(GRADE.map((data, d) => [data, caso.capacidades[i][d]]))),
      ]),
    );

  const chaves = Array.from({ length: caso.numOcorrencias }, (_, i) => chave(`OP-${i}`));
  const dependencias: DependenciaOcorrencia[] = [];
  let bit = 0;
  for (let i = 0; i < caso.numOcorrencias; i++) {
    for (let j = 0; j < i; j++) {
      if (caso.arestasBits[bit++]) {
        dependencias.push({ predecessora: chaves[j], sucessora: chaves[i], tipo: "sequencia_roteiro" });
      }
    }
  }

  const ocorrencias: OcorrenciaEscalonavel[] = chaves.map((c, i) =>
    ocorrencia({
      chave: c,
      necessarioHorasPadrao: caso.necessarios[i],
      candidatoIdsPorPrioridade: caso.compatibilidades[i].map((idx) => candidatoIds[idx]),
      dataInicioJanela: GRADE[caso.offsets[i]],
    }),
  );

  return { ocorrencias, dependencias, criarRegistroCandidatos, chaves };
}

describe("escalonarConjuntoComFilaDeProntos — verificação exata contra todas as ordens topológicas válidas", () => {
  // CONTRAEXEMPLO CONFIRMADO (2026-08-16, seed abaixo) - a propriedade
  // abaixo é FALSA para o algoritmo atual: existe pelo menos 1 caso
  // pequeno onde a heurística de produção (PRIORIDADE_UNICA + desempate
  // por data mínima/chave) deixa uma ocorrência bloqueada por déficit
  // (falsa inviabilidade), enquanto uma ordem de despacho diferente
  // completa TODAS as ocorrências dentro do MESMO horizonte. Ver a
  // reprodução mínima, legível, em "contraexemplo confirmado" mais
  // abaixo - `it.fails` aqui documenta que este teste FALHA HOJE, de
  // forma determinística (seed fixa) - não é flakiness. Quando o
  // escalonador for redesenhado (decisão pendente, fora desta rodada),
  // este `it.fails` passa a passar sozinho, e o Vitest reporta isso como
  // falha (contrato do `.fails`) - sinal para remover o `.fails` e
  // promover a um teste normal.
  it.fails("a heurística de produção sempre entrega na MELHOR data possível entre todas as ordens válidas, em casos pequenos e variados", () => {
    fc.assert(
      fc.property(arbitrarioCaso, (caso) => {
        const { ocorrencias, dependencias, criarRegistroCandidatos, chaves } = montarCenarioDeCaso(caso);

        // Heurística de produção real (avaliarCenario.ts usa exatamente PRIORIDADE_UNICA hoje - single-projeto, fase 8b).
        const resultadoHeuristica = escalonarConjuntoComFilaDeProntos({
          ocorrencias,
          dependencias,
          registroCandidatos: criarRegistroCandidatos(),
          datasGradeCompartilhada: GRADE,
          criterioPrioridadeDeNegocio: () => 0,
        });

        // Conservação de horas: alocado + déficit == necessário, sempre, para toda ocorrência.
        for (const [chaveStr, resultado] of resultadoHeuristica) {
          const oc = ocorrencias.find((o) => chaveOcorrenciaParaString(o.chave) === chaveStr)!;
          const horasAlocadas = resultado.alocacoes.reduce((soma, a) => soma + a.horasPadrao, 0);
          expect(horasAlocadas + resultado.deficitResidualHorasPadrao).toBeCloseTo(oc.necessarioHorasPadrao, 6);
        }

        // Distribuição dos recursos: nenhum candidato ultrapassa a capacidade cadastrada em nenhum dia.
        const consumidoPorRecursoEData = new Map<string, number>();
        for (const resultado of resultadoHeuristica.values()) {
          for (const alocacao of resultado.alocacoes) {
            const chaveConsumo = `${alocacao.recursoId}::${alocacao.data}`;
            consumidoPorRecursoEData.set(chaveConsumo, (consumidoPorRecursoEData.get(chaveConsumo) ?? 0) + alocacao.horasMaquina);
          }
        }
        for (let i = 0; i < caso.numCandidatos; i++) {
          for (let d = 0; d < NUM_DIAS_GRADE; d++) {
            const consumido = consumidoPorRecursoEData.get(`R${i}::${GRADE[d]}`) ?? 0;
            expect(consumido).toBeLessThanOrEqual(caso.capacidades[i][d] + 1e-9);
          }
        }

        const avaliacaoHeuristica = avaliarEntrega(resultadoHeuristica);

        const ordens = todasOrdensTopologicas(chaves, dependencias);
        let melhorExato: string | null = null;
        for (const ordem of ordens) {
          const resultado = rodarComOrdemForcada({ ordem, ocorrencias, dependencias, criarRegistroCandidatos });
          const avaliacao = avaliarEntrega(resultado);
          if (avaliacao.viavel && (melhorExato === null || avaliacao.dataEntrega < melhorExato)) {
            melhorExato = avaliacao.dataEntrega;
          }
        }

        if (melhorExato === null) {
          // Nenhuma ordem entre TODAS as válidas consegue concluir o conjunto inteiro - a heurística também não pode.
          expect(avaliacaoHeuristica.viavel).toBe(false);
          return;
        }

        // Existe pelo menos 1 ordem viável - a heurística de produção precisa achar uma também, e a
        // data de entrega dela NUNCA pode ser pior que a melhor entre todas as ordens exatas.
        expect(avaliacaoHeuristica.viavel).toBe(true);
        if (avaliacaoHeuristica.viavel) {
          expect(avaliacaoHeuristica.dataEntrega).toBe(melhorExato);
        }
      }),
      // Seed FIXA (não omitida) - determinismo exigido: esta suíte nunca
      // deve depender de sorte de execução para achar (ou deixar de
      // achar) o contraexemplo já confirmado abaixo. Reproduzir
      // manualmente: `fc.assert(fc.property(arbitrarioCaso, ...), { seed: 2046335423 })`.
      { numRuns: 300, seed: 2046335423 },
    );
  });
});

describe("escalonarConjuntoComFilaDeProntos — contraexemplo confirmado (Fase 1, 2026-08-16)", () => {
  // Reprodução mínima e legível do contraexemplo achado pela busca acima
  // (fast-check seed 2046335423, encolhido de 5 para... já chegou em 5
  // ocorrências / 1 candidato - não encolheu mais que isso).
  //
  // Cenário: 1 único recurso R0, capacidade só em 3 dias da grade de 10
  // (2027-01-10: 4h: 2027-01-11: 0h - "dia vazio" deliberado no meio;
  // 2027-01-12: 8h; 2027-01-13: 4h). 5 ocorrências disputam R0:
  // - OP-0 -> OP-2 -> OP-4: cadeia de precedência (1h cada), só pode
  //   começar a partir de 2027-01-06 (dataInicioJanela de OP-0).
  // - OP-1 (6h) e OP-3 (4h): sem predecessora, dataInicioJanela desde o
  //   primeiro dia da grade (2027-01-04).
  //
  // A heurística de produção (PRIORIDADE_UNICA + desempate por data
  // mínima) despacha OP-1 e OP-3 PRIMEIRO - dataInicioJanela mais cedo
  // vira dataMinima mais cedo, e isso vence o desempate mesmo elas não
  // tendo NENHUMA urgência estrutural (não travam nenhuma sucessora).
  // Isso consome toda a capacidade de 2027-01-10 e 2027-01-12 antes da
  // cadeia conseguir avançar, empurrando OP-4 para precisar começar em
  // 2027-01-14 - 1 dia ALÉM do fim da grade (2027-01-13) - déficit total
  // (1h), embora a cadeia precisasse de só 3h ao todo.
  //
  // Existe uma ordem exata (despachar OP-0 antes de OP-1/OP-3) que
  // completa as 5 ocorrências dentro do MESMO horizonte, terminando em
  // 2027-01-13 - ou seja, o cenário É comercialmente viável; a heurística
  // só não encontrou a viabilidade que existia. Isto não é "data pior",
  // é FALSA inviabilidade.
  it.fails("cadeia OP-0->OP-2->OP-4 não deveria ficar bloqueada por déficit quando existe ordem exata que completa tudo dentro do horizonte", () => {
    const capacidadePorDia = [0, 0, 0, 0, 0, 0, 4, 0, 8, 4]; // índice = posição na GRADE (10 dias a partir de 2027-01-04)
    const r0 = criarCandidato("R0", 1, Object.fromEntries(GRADE.map((data, i) => [data, capacidadePorDia[i]])));

    const op0 = ocorrencia({ chave: chave("OP-0"), necessarioHorasPadrao: 1, candidatoIdsPorPrioridade: ["R0"], dataInicioJanela: GRADE[2] });
    const op1 = ocorrencia({ chave: chave("OP-1"), necessarioHorasPadrao: 6, candidatoIdsPorPrioridade: ["R0"] });
    const op2 = ocorrencia({ chave: chave("OP-2"), necessarioHorasPadrao: 1, candidatoIdsPorPrioridade: ["R0"] });
    const op3 = ocorrencia({ chave: chave("OP-3"), necessarioHorasPadrao: 4, candidatoIdsPorPrioridade: ["R0"] });
    const op4 = ocorrencia({ chave: chave("OP-4"), necessarioHorasPadrao: 1, candidatoIdsPorPrioridade: ["R0"] });

    const resultados = escalonarConjuntoComFilaDeProntos({
      ocorrencias: [op0, op1, op2, op3, op4],
      dependencias: [
        { predecessora: op0.chave, sucessora: op2.chave, tipo: "sequencia_roteiro" },
        { predecessora: op2.chave, sucessora: op4.chave, tipo: "sequencia_roteiro" },
      ],
      registroCandidatos: new Map([["R0", r0]]),
      datasGradeCompartilhada: GRADE,
      criterioPrioridadeDeNegocio: () => 0,
    });

    // Comportamento DESEJADO (falha hoje): todas as 5 concluem, entrega em 2027-01-13.
    expect([...resultados.values()].every((r) => r.status === "concluida")).toBe(true);
    const dataEntrega = [...resultados.values()].reduce((max, r) => (r.dataFimReal! > max ? r.dataFimReal! : max), "0000-00-00");
    expect(dataEntrega).toBe("2027-01-13");
  });

  // Documenta o comportamento ATUAL (o inverso do teste acima) - este
  // teste passa hoje e existe só para tornar a regressão bilateral:
  // se alguém "corrigir" a heurística de forma incompleta (ela passa a
  // completar as 5, mas numa data pior que 2027-01-13, ou completa mas
  // por acidente), este teste falha e avisa que o comportamento mudou,
  // mesmo que o teste `it.fails` acima ainda não tenha virado verde.
  it("comportamento atual, documentado: OP-4 fica bloqueada por déficit de 1h nesta mesma entrada", () => {
    const capacidadePorDia = [0, 0, 0, 0, 0, 0, 4, 0, 8, 4];
    const r0 = criarCandidato("R0", 1, Object.fromEntries(GRADE.map((data, i) => [data, capacidadePorDia[i]])));

    const op0 = ocorrencia({ chave: chave("OP-0"), necessarioHorasPadrao: 1, candidatoIdsPorPrioridade: ["R0"], dataInicioJanela: GRADE[2] });
    const op1 = ocorrencia({ chave: chave("OP-1"), necessarioHorasPadrao: 6, candidatoIdsPorPrioridade: ["R0"] });
    const op2 = ocorrencia({ chave: chave("OP-2"), necessarioHorasPadrao: 1, candidatoIdsPorPrioridade: ["R0"] });
    const op3 = ocorrencia({ chave: chave("OP-3"), necessarioHorasPadrao: 4, candidatoIdsPorPrioridade: ["R0"] });
    const op4 = ocorrencia({ chave: chave("OP-4"), necessarioHorasPadrao: 1, candidatoIdsPorPrioridade: ["R0"] });

    const resultados = escalonarConjuntoComFilaDeProntos({
      ocorrencias: [op0, op1, op2, op3, op4],
      dependencias: [
        { predecessora: op0.chave, sucessora: op2.chave, tipo: "sequencia_roteiro" },
        { predecessora: op2.chave, sucessora: op4.chave, tipo: "sequencia_roteiro" },
      ],
      registroCandidatos: new Map([["R0", r0]]),
      datasGradeCompartilhada: GRADE,
      criterioPrioridadeDeNegocio: () => 0,
    });

    expect(resultados.get(chaveOcorrenciaParaString(op4.chave))!.status).toBe("bloqueada_por_deficit");
    expect(resultados.get(chaveOcorrenciaParaString(op4.chave))!.deficitResidualHorasPadrao).toBe(1);
  });
});
