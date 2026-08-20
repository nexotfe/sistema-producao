// Auditoria da distribuição conjunta exata (redeFluxoCapacidadeComercial.ts)
// ANTES do carregador Supabase - complementa avaliarPrevisaoComercialFlexivel.exato.test.ts
// (que cobre o nível da função pública / verificador sequencial) com
// checagens no nível do NÚCLEO (`resolverDistribuicaoConjunta` chamado
// direto) que o verificador sequencial não consegue provar.
//
// POR QUE UM VERIFICADOR NOVO: avaliarPrevisaoComercialFlexivel.exato.test.ts
// só enumera ORDENS de despacho (cada OP processada por inteiro, uma de
// cada vez). Isso não representa "OP-A fica com 3h de R1 e OP-B fica com
// 3h de R1 NO MESMO DIA" quando nenhuma das duas esgota o dia sozinha
// primeiro - um caso real disso foi confirmado à mão numa rodada anterior
// (a rede achava uma data melhor que qualquer ordem sequencial, porque só
// ela representa essa divisão). O verificador abaixo enumera diretamente
// QUANTO cada OP recebe de cada (recurso, dia) - a variável de decisão
// real do problema - por força bruta com poda, só para casos pequenos e
// inteiros (nunca em produção).
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { resolverDistribuicaoConjunta } from "./redeFluxoCapacidadeComercial";
import { criarCandidatoNormalComExtra } from "./distribuirNecessidadeFlexivel";
import { criarCandidatoRecursoTemporario } from "./recursoTemporario";
import type { CandidatoComCapacidadeDiaria } from "./alocarOperacaoDiaAdia";
import type { DecisaoRecursoTemporario } from "./avaliarCenario";
import type { NecessidadeCapacidadeFlexivel } from "./necessidadeCapacidadeFlexivel";
import { EPSILON_HORAS } from "../constantesNumericas";

function gerarGradeDatas(base: string, quantidade: number): string[] {
  const [ano, mes, dia] = base.split("-").map(Number);
  return Array.from({ length: quantidade }, (_, i) => new Date(Date.UTC(ano, mes - 1, dia + i)).toISOString().slice(0, 10));
}

function candidatosNormais(capacidades: Record<string, number>, produtividade = 1): Map<string, CandidatoComCapacidadeDiaria> {
  return new Map(Object.entries(capacidades).map(([id, cap]) => [id, criarCandidatoNormalComExtra(id, cap, produtividade, [])]));
}

// ============================================================
// Verificador conjunto independente - enumera ATRIBUIÇÕES, não ordens.
// ============================================================

interface OpcaoVerificador {
  recursoId: string;
  data: string;
}

interface NecessidadeVerificador {
  chaveTrabalho: string;
  necessario: number;
  opcoes: readonly OpcaoVerificador[];
}

const MAX_PARTICOES_POR_NECESSIDADE = 2000;
const MAX_NOS_BUSCA = 200_000;

/** Todas as tuplas de `numOpcoes` inteiros >= 0 somando `total` - geradora simples, sem dependência externa. */
function gerarParticoes(total: number, numOpcoes: number): number[][] {
  if (numOpcoes === 1) return [[total]];
  const resultado: number[][] = [];
  for (let primeiro = 0; primeiro <= total; primeiro++) {
    for (const resto of gerarParticoes(total - primeiro, numOpcoes - 1)) {
      resultado.push([primeiro, ...resto]);
    }
  }
  if (resultado.length > MAX_PARTICOES_POR_NECESSIDADE) {
    throw new RangeError(`gerarParticoes: ${resultado.length} partições excede o teto de segurança (${MAX_PARTICOES_POR_NECESSIDADE}) - caso grande demais para força bruta.`);
  }
  return resultado;
}

/**
 * Menor data de entrega por ENUMERAÇÃO EXAUSTIVA de atribuições diretas
 * (quanto cada OP recebe de cada (recurso, dia)) - nunca uma ordem de
 * despacho. Busca com retrocesso, podando assim que o uso acumulado de
 * um (recurso, dia) excede a capacidade. `null` = nenhuma atribuição
 * satisfaz todas as necessidades por completo dentro das opções dadas.
 */
function melhorEntregaPorEnumeracao(necessidades: readonly NecessidadeVerificador[], capacidadePorRecursoEData: ReadonlyMap<string, number>): string | null {
  const particoesPorNecessidade = necessidades.map((n) => gerarParticoes(n.necessario, n.opcoes.length));
  const produtoTotal = particoesPorNecessidade.reduce((p, particoes) => p * particoes.length, 1);
  if (produtoTotal > MAX_NOS_BUSCA) {
    throw new RangeError(`melhorEntregaPorEnumeracao: espaço de busca (${produtoTotal}) excede o teto de segurança (${MAX_NOS_BUSCA}) - caso grande demais para força bruta.`);
  }

  let melhor: string | null = null;
  const usoAcumulado = new Map<string, number>();
  const escolhas: number[][] = new Array(necessidades.length);

  function chave(recursoId: string, data: string): string {
    return `${recursoId}::${data}`;
  }

  function backtrack(indice: number): void {
    if (indice === necessidades.length) {
      let dataEntrega = "";
      necessidades.forEach((n, i) => {
        n.opcoes.forEach((opcao, j) => {
          if (escolhas[i][j] > 0 && opcao.data > dataEntrega) dataEntrega = opcao.data;
        });
      });
      if (melhor === null || dataEntrega < melhor) melhor = dataEntrega;
      return;
    }

    const necessidade = necessidades[indice];
    for (const particao of particoesPorNecessidade[indice]) {
      // (chave, quantidade) de cada incremento desta tentativa - guardado
      // para desfazer exatamente o que foi feito, nunca recalculado.
      const incrementos: { chave: string; quantidade: number }[] = [];
      let cabe = true;
      for (let j = 0; j < particao.length; j++) {
        if (particao[j] <= 0) continue;
        const c = chave(necessidade.opcoes[j].recursoId, necessidade.opcoes[j].data);
        const capacidadeMax = capacidadePorRecursoEData.get(c) ?? 0;
        const usoAtual = usoAcumulado.get(c) ?? 0;
        if (usoAtual + particao[j] > capacidadeMax) {
          cabe = false;
          break;
        }
      }
      if (!cabe) continue;

      for (let j = 0; j < particao.length; j++) {
        if (particao[j] <= 0) continue;
        const c = chave(necessidade.opcoes[j].recursoId, necessidade.opcoes[j].data);
        usoAcumulado.set(c, (usoAcumulado.get(c) ?? 0) + particao[j]);
        incrementos.push({ chave: c, quantidade: particao[j] });
      }
      escolhas[indice] = particao;
      backtrack(indice + 1);
      for (const { chave: c, quantidade } of incrementos) usoAcumulado.set(c, (usoAcumulado.get(c) ?? 0) - quantidade);
    }
  }

  backtrack(0);
  return melhor;
}

describe("redeFluxoCapacidadeComercial — verificador conjunto (atribuições diretas, casos pequenos e inteiros)", () => {
  it("gerarParticoes: gera todas as tuplas não-negativas somando o total", () => {
    expect(gerarParticoes(2, 2).sort()).toEqual([
      [0, 2],
      [1, 1],
      [2, 0],
    ]);
    expect(gerarParticoes(0, 3)).toEqual([[0, 0, 0]]);
  });

  const GRADE_JUNTO = gerarGradeDatas("2027-02-01", 3);
  const RECURSOS_JUNTO = ["RA", "RB"] as const;

  interface CasoJuntoGerado {
    numNecessidades: number;
    capacidades: [number, number];
    necessarios: number[];
    offsets: number[];
    recursoOriginalIdx: number[];
    temCompativel: boolean[];
  }

  // Instâncias deliberadamente pequenas (produtoTotal de partições sempre
  // << MAX_NOS_BUSCA) - necessario <= 2, no máximo 2 recursos elegíveis
  // por OP (original + 1 compatível), grade de 3 dias => no máximo 6
  // opções por OP, no máximo 21 partições por OP, no máximo 21^3 ≈ 9260
  // nós de busca com 3 OPs.
  const arbitrarioCasoJunto: fc.Arbitrary<CasoJuntoGerado> = fc.integer({ min: 2, max: 3 }).chain((numNecessidades) =>
    fc.record({
      numNecessidades: fc.constant(numNecessidades),
      capacidades: fc.tuple(fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 3 })),
      necessarios: fc.array(fc.integer({ min: 1, max: 2 }), { minLength: numNecessidades, maxLength: numNecessidades }),
      offsets: fc.array(fc.integer({ min: 0, max: 1 }), { minLength: numNecessidades, maxLength: numNecessidades }),
      recursoOriginalIdx: fc.array(fc.integer({ min: 0, max: 1 }), { minLength: numNecessidades, maxLength: numNecessidades }),
      temCompativel: fc.array(fc.boolean(), { minLength: numNecessidades, maxLength: numNecessidades }),
    }),
  );

  function montarCenarioJunto(caso: CasoJuntoGerado) {
    const capacidadesNormaisRaw: Record<string, number> = { RA: caso.capacidades[0], RB: caso.capacidades[1] };

    const necessidades: NecessidadeCapacidadeFlexivel[] = Array.from({ length: caso.numNecessidades }, (_, i) => {
      const recursoOriginalId = RECURSOS_JUNTO[caso.recursoOriginalIdx[i]];
      const outroRecurso = RECURSOS_JUNTO[1 - caso.recursoOriginalIdx[i]];
      return {
        empresaId: "empresa-1",
        projetoId: "projeto-novo",
        projetoItemId: `item-${i}`,
        chaveTrabalho: `OP-${i}`,
        recursoOriginalId,
        recursosCompativeisPorPrioridade: caso.temCompativel[i] ? [outroRecurso] : [],
        horasNecessariasPadrao: caso.necessarios[i],
        disponivelAPartirDe: GRADE_JUNTO[caso.offsets[i]],
      };
    });

    const necessidadesVerificador: NecessidadeVerificador[] = necessidades.map((n) => {
      const recursoIds = [n.recursoOriginalId, ...n.recursosCompativeisPorPrioridade];
      const diasElegiveis = GRADE_JUNTO.filter((d) => d >= n.disponivelAPartirDe);
      const opcoes: OpcaoVerificador[] = recursoIds.flatMap((recursoId) => diasElegiveis.map((data) => ({ recursoId, data })));
      return { chaveTrabalho: n.chaveTrabalho, necessario: n.horasNecessariasPadrao, opcoes };
    });

    const capacidadeVerificador = new Map<string, number>();
    for (const recursoId of RECURSOS_JUNTO) {
      for (const data of GRADE_JUNTO) capacidadeVerificador.set(`${recursoId}::${data}`, capacidadesNormaisRaw[recursoId]);
    }

    return { necessidades, capacidadesNormaisRaw, necessidadesVerificador, capacidadeVerificador };
  }

  it("a rede de fluxo nunca diverge do ótimo achado por enumeração exaustiva de atribuições diretas (não só ordens sequenciais)", () => {
    fc.assert(
      fc.property(arbitrarioCasoJunto, (caso) => {
        const { necessidades, capacidadesNormaisRaw, necessidadesVerificador, capacidadeVerificador } = montarCenarioJunto(caso);

        const resultado = resolverDistribuicaoConjunta({
          necessidades,
          candidatosNormaisPorRecurso: candidatosNormais(capacidadesNormaisRaw),
          candidatosTemporariosPorPrioridade: [],
          recursoReferenciaPorTemporario: new Map(),
          contratacaoIdPorTemporario: new Map(),
          datasGrade: GRADE_JUNTO,
        });

        // Conservação + limite de capacidade - sempre verificados, independente do resultado do verificador.
        const consumidoPorRecursoEData = new Map<string, number>();
        for (const [, r] of resultado.resultadosPorChaveTrabalho) {
          expect(r.horasAlocadasPadrao + r.deficitResidualHorasPadrao).toBeCloseTo(r.horasNecessariasPadrao, 6);
          for (const a of r.alocacoes) {
            const c = `${a.recursoId}::${a.data}`;
            consumidoPorRecursoEData.set(c, (consumidoPorRecursoEData.get(c) ?? 0) + a.horasMaquina);
          }
        }
        for (const recursoId of RECURSOS_JUNTO) {
          for (const data of GRADE_JUNTO) {
            const consumido = consumidoPorRecursoEData.get(`${recursoId}::${data}`) ?? 0;
            expect(consumido).toBeLessThanOrEqual(capacidadesNormaisRaw[recursoId] + 1e-9);
          }
        }

        const melhorExato = melhorEntregaPorEnumeracao(necessidadesVerificador, capacidadeVerificador);
        const todasConcluidas = [...resultado.resultadosPorChaveTrabalho.values()].every((r) => r.status === "concluida");

        if (melhorExato === null) {
          expect(resultado.horizonteTecnico).toBe("insuficiente");
          return;
        }

        expect(resultado.horizonteTecnico).toBe("suficiente");
        expect(todasConcluidas).toBe(true);
        const dataEntregaRede = [...resultado.resultadosPorChaveTrabalho.values()]
          .flatMap((r) => r.alocacoes.map((a) => a.data))
          .reduce((max, d) => (d > max ? d : max), "0000-00-00");
        expect(dataEntregaRede).toBe(melhorExato);
      }),
      // Seed FIXA - 7 rodadas consecutivas com seeds aleatórias (3500
      // casos) não acharam nenhum contraexemplo antes de fixar esta;
      // mantida para reprodutibilidade em CI, não por falha conhecida.
      { numRuns: 1000, seed: 20260816 },
    );
  });
});

describe("redeFluxoCapacidadeComercial — ordem secundária completa e contratacaoId/natureza associados", () => {
  // Calibrado para forçar TODOS os 6 grupos de preferência a serem
  // usados, NA ORDEM CERTA, num único cenário: cada tier tem
  // capacidade EXATA de 1h (original normal, compatível normal,
  // adicional do original, adicional do compatível, temporário
  // vinculado, temporário geral) - 6h no total - mas a necessidade pede
  // só 5h. Se a ordem estiver certa, os 5 primeiros tiers (nesta ordem)
  // são usados por inteiro e o 6º (temporário geral) fica TOTALMENTE
  // intocado - qualquer desvio de ordem aparece direto em QUAL tier
  // ficou de fora.
  it("usa original > compatível > adicional do original > adicional do compatível > temporário vinculado > temporário geral, cada um com o contratacaoId/natureza certos", () => {
    const data = "2027-03-01";
    const necessidade: NecessidadeCapacidadeFlexivel = {
      empresaId: "empresa-1",
      projetoId: "projeto-novo",
      projetoItemId: "item-0",
      chaveTrabalho: "OP-0",
      recursoOriginalId: "RO",
      recursosCompativeisPorPrioridade: ["RC"],
      horasNecessariasPadrao: 5,
      disponivelAPartirDe: data,
    };

    const candidatosNormaisPorRecurso = new Map<string, CandidatoComCapacidadeDiaria>([
      [
        "RO",
        criarCandidatoNormalComExtra("RO", 1, 1, [
          { recursoId: "RO", data, horasAdicionaisDisponiveis: 1, natureza: "hora_extra", elegibilidade: { escopo: "qualquer_projeto_do_cenario" }, contratacaoId: "extra-RO" },
        ]),
      ],
      [
        "RC",
        criarCandidatoNormalComExtra("RC", 1, 1, [
          { recursoId: "RC", data, horasAdicionaisDisponiveis: 1, natureza: "hora_extra", elegibilidade: { escopo: "qualquer_projeto_do_cenario" }, contratacaoId: "extra-RC" },
        ]),
      ],
    ]);

    const temporariosPorPrioridade: DecisaoRecursoTemporario[] = [
      {
        recursoTemporario: { idTemporario: "TV", tipo: "freelancer", recursoReferenciaId: "RO", disponibilidade: [{ data, horasDisponiveis: 1 }], contratacaoId: "temp-TV", justificativa: "vinculado ao original", aplicavelAsOperacoes: [] },
        produtividadeReferencia: 1,
      },
      {
        recursoTemporario: { idTemporario: "TG", tipo: "freelancer", recursoReferenciaId: "recurso-fora-do-conjunto", disponibilidade: [{ data, horasDisponiveis: 1 }], contratacaoId: "temp-TG", justificativa: "geral, não vinculado", aplicavelAsOperacoes: [] },
        produtividadeReferencia: 1,
      },
    ];
    const candidatosTemporariosPorPrioridade = temporariosPorPrioridade.map((d) => criarCandidatoRecursoTemporario(d.recursoTemporario, d.produtividadeReferencia));
    const recursoReferenciaPorTemporario = new Map(temporariosPorPrioridade.map((d) => [d.recursoTemporario.idTemporario, d.recursoTemporario.recursoReferenciaId]));
    const contratacaoIdPorTemporario = new Map(temporariosPorPrioridade.map((d) => [d.recursoTemporario.idTemporario, d.recursoTemporario.contratacaoId]));

    const resultado = resolverDistribuicaoConjunta({
      necessidades: [necessidade],
      candidatosNormaisPorRecurso,
      candidatosTemporariosPorPrioridade,
      recursoReferenciaPorTemporario,
      contratacaoIdPorTemporario,
      datasGrade: [data],
    });

    const r = resultado.resultadosPorChaveTrabalho.get("OP-0")!;
    expect(r.status).toBe("concluida");
    expect(r.deficitResidualHorasPadrao).toBe(0);
    expect(r.alocacoes).toHaveLength(5); // TG (temporário geral) fica de fora - a única forma de "sobrar" com a ordem certa.
    expect(r.recursosEfetivamenteUsados.includes("TG")).toBe(false);

    // RO e RC aparecem 2x cada (normal + adicional) - nunca indexar só por
    // recursoId (um Map assim perderia a 1ª ocorrência); filtra por
    // (recursoId, tipoCapacidade) para checar CADA alocação especificamente.
    const porRecursoETipo = new Map(r.alocacoes.map((a) => [`${a.recursoId}::${a.tipoCapacidade}`, a]));
    expect(porRecursoETipo.get("RO::normal_original")).toMatchObject({ horasPadrao: 1, contratacaoId: null });
    expect(porRecursoETipo.get("RC::normal_compativel")).toMatchObject({ horasPadrao: 1, contratacaoId: null });
    expect(porRecursoETipo.get("TV::temporario")).toMatchObject({ horasPadrao: 1, contratacaoId: "temp-TV" });

    const adicionais = r.alocacoes.filter((a) => a.tipoCapacidade === "adicional");
    expect(adicionais).toHaveLength(2);
    expect(adicionais.find((a) => a.recursoId === "RO")).toMatchObject({ horasPadrao: 1, contratacaoId: "extra-RO" });
    expect(adicionais.find((a) => a.recursoId === "RC")).toMatchObject({ horasPadrao: 1, contratacaoId: "extra-RC" });
  });
});

describe("redeFluxoCapacidadeComercial — produtividade aplicada exatamente uma vez", () => {
  it("horasMaquina = horasPadrao / produtividade, calculado 1 única vez, mesmo com produtividade que não divide igualmente a escala de ticks", () => {
    const data = "2027-04-01";
    const necessidade: NecessidadeCapacidadeFlexivel = {
      empresaId: "empresa-1",
      projetoId: "projeto-novo",
      projetoItemId: "item-0",
      chaveTrabalho: "OP-0",
      recursoOriginalId: "RP",
      recursosCompativeisPorPrioridade: [],
      horasNecessariasPadrao: 3,
      disponivelAPartirDe: data,
    };

    const resultado = resolverDistribuicaoConjunta({
      necessidades: [necessidade],
      candidatosNormaisPorRecurso: candidatosNormais({ RP: 10 }, 0.3), // 10h-máquina/dia * 0.3 = 3h-padrão/dia - exatamente a necessidade, em 1 único dia.
      candidatosTemporariosPorPrioridade: [],
      recursoReferenciaPorTemporario: new Map(),
      contratacaoIdPorTemporario: new Map(),
      datasGrade: [data],
    });

    const r = resultado.resultadosPorChaveTrabalho.get("OP-0")!;
    expect(r.status).toBe("concluida");
    expect(r.deficitResidualHorasPadrao).toBeCloseTo(0, 6);
    expect(r.alocacoes).toHaveLength(1);
    expect(r.alocacoes[0].horasPadrao).toBeCloseTo(3, 6);
    expect(r.alocacoes[0].horasMaquina).toBeCloseTo(10, 6); // 3 / 0.3 - nunca 3*0.3 nem 3/0.3/0.3 (produtividade aplicada 2x por engano).
    expect(Math.abs(r.alocacoes[0].horasMaquina - 10)).toBeLessThanOrEqual(EPSILON_HORAS * 10); // dentro da MESMA tolerância usada no resto do motor, não uma nova.
  });
});

describe("redeFluxoCapacidadeComercial — determinismo com arrays embaralhados", () => {
  function normalizarParaComparacao(resultadosPorChaveTrabalho: ReadonlyMap<string, { alocacoes: readonly unknown[] }>) {
    return [...resultadosPorChaveTrabalho.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([chave, r]) => [
        chave,
        [...r.alocacoes].sort((x: any, y: any) => JSON.stringify(x).localeCompare(JSON.stringify(y))),
      ]);
  }

  it("embaralhar a ordem de necessidades/compatíveis/temporários (mesma prioridade lógica, referência de array diferente) não muda o resultado", () => {
    const datasGrade = gerarGradeDatas("2027-05-01", 5);
    const capacidadesNormaisPorRecurso = { R0: 4, R1: 4, R2: 4 };

    function construir(necessidades: NecessidadeCapacidadeFlexivel[], temporarios: DecisaoRecursoTemporario[]) {
      const candidatosTemporariosPorPrioridade = temporarios.map((d) => criarCandidatoRecursoTemporario(d.recursoTemporario, d.produtividadeReferencia));
      const recursoReferenciaPorTemporario = new Map(temporarios.map((d) => [d.recursoTemporario.idTemporario, d.recursoTemporario.recursoReferenciaId]));
      const contratacaoIdPorTemporario = new Map(temporarios.map((d) => [d.recursoTemporario.idTemporario, d.recursoTemporario.contratacaoId]));
      return resolverDistribuicaoConjunta({
        necessidades,
        candidatosNormaisPorRecurso: candidatosNormais(capacidadesNormaisPorRecurso),
        candidatosTemporariosPorPrioridade,
        recursoReferenciaPorTemporario,
        contratacaoIdPorTemporario,
        datasGrade,
      });
    }

    const opA = { empresaId: "e", projetoId: "p", projetoItemId: "iA", chaveTrabalho: "OP-A", recursoOriginalId: "R0", recursosCompativeisPorPrioridade: ["R1", "R2"], horasNecessariasPadrao: 6, disponivelAPartirDe: datasGrade[0] };
    const opB = { empresaId: "e", projetoId: "p", projetoItemId: "iB", chaveTrabalho: "OP-B", recursoOriginalId: "R1", recursosCompativeisPorPrioridade: ["R2", "R0"], horasNecessariasPadrao: 5, disponivelAPartirDe: datasGrade[0] };
    const opC = { empresaId: "e", projetoId: "p", projetoItemId: "iC", chaveTrabalho: "OP-C", recursoOriginalId: "R2", recursosCompativeisPorPrioridade: [], horasNecessariasPadrao: 4, disponivelAPartirDe: datasGrade[0] };
    const temp1: DecisaoRecursoTemporario = { recursoTemporario: { idTemporario: "T1", tipo: "freelancer", recursoReferenciaId: "R0", disponibilidade: datasGrade.map((d) => ({ data: d, horasDisponiveis: 2 })), contratacaoId: "temp-1", justificativa: "j", aplicavelAsOperacoes: [] }, produtividadeReferencia: 1 };

    const resultadoOriginal = construir([opA, opB, opC], [temp1]);
    // Mesma ordem LÓGICA, referências de array diferentes em tudo que importa.
    const resultadoEmbaralhado = construir(
      [opC, opA, opB].map((op) => ({ ...op, recursosCompativeisPorPrioridade: [...op.recursosCompativeisPorPrioridade] })),
      [{ ...temp1, recursoTemporario: { ...temp1.recursoTemporario, disponibilidade: [...temp1.recursoTemporario.disponibilidade] } }],
    );

    expect(normalizarParaComparacao(resultadoEmbaralhado.resultadosPorChaveTrabalho)).toEqual(normalizarParaComparacao(resultadoOriginal.resultadosPorChaveTrabalho));
    expect(resultadoEmbaralhado.horizonteTecnico).toBe(resultadoOriginal.horizonteTecnico);

    // Nenhuma mutação dos arrays originais - compara por igualdade estrutural com uma cópia congelada antes da chamada.
    expect(opA.recursosCompativeisPorPrioridade).toEqual(["R1", "R2"]);
    expect(temp1.recursoTemporario.disponibilidade).toEqual(datasGrade.map((d) => ({ data: d, horasDisponiveis: 2 })));
  });
});

describe("redeFluxoCapacidadeComercial — desempenho em volume comercial realista", () => {
  // Mede, não pré-supõe. 200 OPs, 15 recursos, horizonte de ~90 dias
  // (3 meses) - ordem de grandeza de um orçamento novo real disputando
  // capacidade com um portfólio ativo. Timeout do próprio `it` bem acima
  // do teto assertado, para o teste falhar por ASSERÇÃO (tempo real
  // medido, reportado no console) e não por timeout do runner mascarando
  // o número.
  it(
    "resolve ~200 OPs / 15 recursos / ~90 dias dentro de um teto de tempo generoso, preservando conservação e limite de capacidade",
    () => {
      const NUM_OPS = 200;
      const NUM_RECURSOS = 15;
      const datasGrade = gerarGradeDatas("2027-06-01", 90);
      const TETO_MS = 30_000;

      const recursoIds = Array.from({ length: NUM_RECURSOS }, (_, i) => `R${i}`);
      const capacidadesNormaisPorRecurso = Object.fromEntries(recursoIds.map((id, i) => [id, 4 + (i % 5)]));

      const capacidadeExtraAutorizada = recursoIds.slice(0, 3).flatMap((recursoId, i) => [
        { recursoId, data: datasGrade[10 + i], horasAdicionaisDisponiveis: 4, natureza: "hora_extra" as const, elegibilidade: { escopo: "qualquer_projeto_do_cenario" as const }, contratacaoId: `extra-${recursoId}` },
      ]);
      const temporariosPorPrioridade: DecisaoRecursoTemporario[] = Array.from({ length: 3 }, (_, i) => ({
        recursoTemporario: {
          idTemporario: `T${i}`,
          tipo: "maquina_alugada" as const,
          recursoReferenciaId: recursoIds[i],
          disponibilidade: datasGrade.map((d) => ({ data: d, horasDisponiveis: 6 })),
          contratacaoId: `temp-${i}`,
          justificativa: "carga de desempenho",
          aplicavelAsOperacoes: [],
        },
        produtividadeReferencia: 1,
      }));

      const necessidades: NecessidadeCapacidadeFlexivel[] = Array.from({ length: NUM_OPS }, (_, i) => {
        const original = recursoIds[i % NUM_RECURSOS];
        const compat1 = recursoIds[(i + 1) % NUM_RECURSOS];
        const compat2 = recursoIds[(i + 2) % NUM_RECURSOS];
        return {
          empresaId: "empresa-1",
          projetoId: "projeto-novo",
          projetoItemId: `item-${i}`,
          chaveTrabalho: `OP-${i}`,
          recursoOriginalId: original,
          recursosCompativeisPorPrioridade: i % 3 === 0 ? [] : i % 3 === 1 ? [compat1] : [compat1, compat2],
          horasNecessariasPadrao: 4 + (i % 10) * 4,
          disponivelAPartirDe: datasGrade[i % 20],
        };
      });

      const candidatosNormaisPorRecurso = candidatosNormais(capacidadesNormaisPorRecurso);
      for (const extra of capacidadeExtraAutorizada) {
        candidatosNormaisPorRecurso.set(extra.recursoId, criarCandidatoNormalComExtra(extra.recursoId, capacidadesNormaisPorRecurso[extra.recursoId], 1, capacidadeExtraAutorizada.filter((e) => e.recursoId === extra.recursoId)));
      }
      const candidatosTemporariosPorPrioridade = temporariosPorPrioridade.map((d) => criarCandidatoRecursoTemporario(d.recursoTemporario, d.produtividadeReferencia));
      const recursoReferenciaPorTemporario = new Map(temporariosPorPrioridade.map((d) => [d.recursoTemporario.idTemporario, d.recursoTemporario.recursoReferenciaId]));
      const contratacaoIdPorTemporario = new Map(temporariosPorPrioridade.map((d) => [d.recursoTemporario.idTemporario, d.recursoTemporario.contratacaoId]));

      const inicio = Date.now();
      const resultado = resolverDistribuicaoConjunta({
        necessidades,
        candidatosNormaisPorRecurso,
        candidatosTemporariosPorPrioridade,
        recursoReferenciaPorTemporario,
        contratacaoIdPorTemporario,
        datasGrade,
      });
      const duracaoMs = Date.now() - inicio;
      console.log(`[desempenho] ${NUM_OPS} OPs / ${NUM_RECURSOS} recursos / ${datasGrade.length} dias: ${duracaoMs}ms (horizonteTecnico=${resultado.horizonteTecnico})`);

      expect(resultado.resultadosPorChaveTrabalho.size).toBe(NUM_OPS);
      for (const [, r] of resultado.resultadosPorChaveTrabalho) {
        expect(r.horasAlocadasPadrao + r.deficitResidualHorasPadrao).toBeCloseTo(r.horasNecessariasPadrao, 6);
      }
      const consumidoPorRecursoEData = new Map<string, number>();
      for (const [, r] of resultado.resultadosPorChaveTrabalho) {
        for (const a of r.alocacoes) {
          const c = `${a.recursoId}::${a.data}`;
          consumidoPorRecursoEData.set(c, (consumidoPorRecursoEData.get(c) ?? 0) + a.horasMaquina);
        }
      }
      // Capacidade máxima real por (recurso, data) - normal + adicional (só
      // os 3 primeiros recursos têm) para recursos reais, disponibilidade
      // cadastrada para temporários - nunca inferida do prefixo do id.
      const temporarioPorId = new Map(temporariosPorPrioridade.map((d) => [d.recursoTemporario.idTemporario, d.recursoTemporario]));
      const extraPorRecursoEData = new Map(capacidadeExtraAutorizada.map((e) => [`${e.recursoId}::${e.data}`, e.horasAdicionaisDisponiveis]));
      for (const [chave, consumido] of consumidoPorRecursoEData) {
        const [recursoId, data] = chave.split("::");
        const temporario = temporarioPorId.get(recursoId);
        const capacidadeMaxima = temporario
          ? (temporario.disponibilidade.find((d) => d.data === data)?.horasDisponiveis ?? 0)
          : capacidadesNormaisPorRecurso[recursoId] + (extraPorRecursoEData.get(chave) ?? 0);
        expect(consumido).toBeLessThanOrEqual(capacidadeMaxima + 1e-6);
      }

      expect(duracaoMs).toBeLessThan(TETO_MS);
    },
    60_000,
  );
});
