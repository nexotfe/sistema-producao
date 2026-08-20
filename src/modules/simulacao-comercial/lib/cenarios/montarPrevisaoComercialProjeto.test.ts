import { describe, expect, it } from "vitest";
import { montarPrevisaoComercialProjeto, type CenarioParaPrevisaoComercial } from "./montarPrevisaoComercialProjeto";
import type { BasePrevisaoComercial, DiagnosticoPrevisaoComercial } from "./carregarBasePrevisaoComercial";
import type { CompromissoCapacidade } from "./compromissoCapacidade";
import type { CapacidadeNormalRecurso, NecessidadeCapacidadeFlexivel } from "./necessidadeCapacidadeFlexivel";
import type { CapacidadeExtraDia } from "./capacidadeDia";
import type { Contratacao } from "./contratacao";
import type { DecisaoRecursoTemporario } from "./avaliarCenario";

/** Sempre devolve um objeto CONGELADO (Object.freeze, incl. chavesTrabalhoOrigem) - fixture fiel à base real, que também é imutável em runtime. */
function confirmado(overrides: Partial<CompromissoCapacidade> = {}): CompromissoCapacidade {
  return Object.freeze({
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
    chavesTrabalhoOrigem: Object.freeze(["op-confirmado-1"]),
    ...overrides,
    ...(overrides.chavesTrabalhoOrigem ? { chavesTrabalhoOrigem: Object.freeze([...overrides.chavesTrabalhoOrigem]) } : {}),
  });
}

/** Sempre devolve um objeto CONGELADO (Object.freeze, incl. recursosCompativeisPorPrioridade) - mesmo motivo de confirmado() acima. */
function necessidade(overrides: Partial<NecessidadeCapacidadeFlexivel> = {}): NecessidadeCapacidadeFlexivel {
  return Object.freeze({
    empresaId: "empresa-1",
    projetoId: "projeto-novo",
    projetoItemId: "item-1",
    chaveTrabalho: "op-novo-1",
    recursoOriginalId: "recurso-A",
    recursosCompativeisPorPrioridade: Object.freeze([]),
    horasNecessariasPadrao: 8,
    disponivelAPartirDe: "2026-09-01",
    ...overrides,
    ...(overrides.recursosCompativeisPorPrioridade ? { recursosCompativeisPorPrioridade: Object.freeze([...overrides.recursosCompativeisPorPrioridade]) } : {}),
  });
}

function contratacaoFixture(overrides: Partial<Contratacao> = {}): Contratacao {
  return {
    id: "contratacao-1",
    tipo: "hora_extra",
    abrangencia: "por_hora_utilizada",
    valor: 10,
    moeda: "BRL",
    fornecedorOuContratado: "Interno",
    referenciaProposta: null,
    justificativa: "teste",
    datas: [],
    ...overrides,
  };
}

function temporarioFixture(overrides: {
  idTemporario?: string;
  recursoReferenciaId?: string;
  disponibilidade?: { data: string; horasDisponiveis: number }[];
  contratacaoId?: string;
} = {}): DecisaoRecursoTemporario {
  return {
    recursoTemporario: {
      idTemporario: overrides.idTemporario ?? "temp-1",
      tipo: "freelancer",
      recursoReferenciaId: overrides.recursoReferenciaId ?? "recurso-A",
      disponibilidade: overrides.disponibilidade ?? [{ data: "2026-09-01", horasDisponiveis: 8 }],
      contratacaoId: overrides.contratacaoId ?? "contratacao-temporario",
      justificativa: "teste",
      aplicavelAsOperacoes: [],
    },
    produtividadeReferencia: 1,
  };
}

/**
 * Mesma proteção real de carregarBasePrevisaoComercial.ts
 * (congelarMapaEmRuntime, não exportada de lá) - reconstruída aqui para
 * que o fixture deste arquivo represente fielmente uma base de
 * produção genuinamente imutável, não um Map comum "de mentirinha".
 */
function congelarMapaDeTeste<K, V>(origem: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const metodosBloqueados = new Set(["set", "delete", "clear"]);
  return new Proxy(origem as Map<K, V>, {
    get(alvo, propriedade) {
      if (typeof propriedade === "string" && metodosBloqueados.has(propriedade)) {
        return () => {
          throw new TypeError(`Tentativa de mutar capacidadesNormais via "${propriedade}" - fixture de teste imita a mesma proteção real da base de produção.`);
        };
      }
      const valor = Reflect.get(alvo, propriedade, alvo);
      return typeof valor === "function" ? valor.bind(alvo) : valor;
    },
  });
}

function capacidadesMap(entradas: CapacidadeNormalRecurso[]): ReadonlyMap<string, CapacidadeNormalRecurso> {
  return congelarMapaDeTeste(new Map(entradas.map((c) => [c.recursoId, Object.freeze({ ...c })])));
}

/** Mesma proteção real (congelarSetEmRuntime, não exportada de carregarBasePrevisaoComercial.ts), reconstruída para o fixture deste arquivo. */
function congelarSetDeTeste(origem: ReadonlySet<string>): ReadonlySet<string> {
  const metodosBloqueados = new Set(["add", "delete", "clear"]);
  return new Proxy(origem as Set<string>, {
    get(alvo, propriedade) {
      if (typeof propriedade === "string" && metodosBloqueados.has(propriedade)) {
        return () => {
          throw new TypeError(`Tentativa de mutar diasProdutivos via "${propriedade}" - fixture de teste imita a mesma proteção real da base de produção.`);
        };
      }
      const valor = Reflect.get(alvo, propriedade, alvo);
      return typeof valor === "function" ? valor.bind(alvo) : valor;
    },
  });
}

function gerarDatas(inicio: string, quantidade: number): string[] {
  const [ano, mes, dia] = inicio.split("-").map(Number);
  const datas: string[] = [];
  for (let i = 0; i < quantidade; i++) {
    datas.push(new Date(Date.UTC(ano, mes - 1, dia + i)).toISOString().slice(0, 10));
  }
  return datas;
}

/** Fixture SEMPRE profundamente congelada (arrays externos + cada elemento) - imita fielmente o que carregarBasePrevisaoComercial.ts devolve em produção. */
function baseFixture(overrides: Partial<BasePrevisaoComercial> = {}): BasePrevisaoComercial {
  const compromissosConfirmados = overrides.compromissosConfirmados ?? [];
  const necessidadesOrcamentoNovo = overrides.necessidadesOrcamentoNovo ?? [necessidade()];
  const diagnosticos = overrides.diagnosticos ?? [];
  const datasGrade = overrides.datasGrade ?? gerarDatas("2026-09-01", 40);
  // Default = toda data de datasGrade é produtiva - estes testes não são
  // sobre calendário (ver avaliarPrevisaoComercialFlexivel.test.ts/
  // carregarBasePrevisaoComercial.test.ts para os testes de calendário
  // em si), então o fixture preserva o comportamento anterior a essa
  // correção salvo quando um teste passa diasProdutivos explicitamente.
  const diasProdutivos = overrides.diasProdutivos ?? new Set(datasGrade);

  return Object.freeze({
    empresaId: "empresa-1",
    projetoId: "projeto-novo",
    dataSolicitadaCliente: "2026-09-10",
    capacidadesNormais: capacidadesMap([{ recursoId: "recurso-A", capacidadeHorasMaquinaDia: 8, produtividade: 1 }]),
    ...overrides,
    compromissosConfirmados: Object.freeze(compromissosConfirmados.map((c) => Object.freeze({ ...c }))),
    necessidadesOrcamentoNovo: Object.freeze(necessidadesOrcamentoNovo.map((n) => Object.freeze({ ...n }))),
    diagnosticos: Object.freeze(diagnosticos.map((d) => Object.freeze({ ...d }))),
    datasGrade: Object.freeze([...datasGrade]),
    diasProdutivos: congelarSetDeTeste(diasProdutivos),
  });
}

const DISPONIBILIDADE_MATERIAL_PADRAO = "2026-09-01";

/** Cenário "sem nenhuma alternativa", disponibilidade de material padrão (igual à disponivelAPartirDe default de necessidade()) - shape completo de CenarioParaPrevisaoComercial. */
const CENARIO_SEM_EXTRA: CenarioParaPrevisaoComercial = {
  capacidadeExtraAutorizada: [],
  temporariosPorPrioridade: [],
  disponibilidadeMaterialOrcamentoNovo: DISPONIBILIDADE_MATERIAL_PADRAO,
  contratacoes: [],
  contratacaoNegociacaoMaterial: null,
};

function cenario(overrides: Partial<CenarioParaPrevisaoComercial> = {}): CenarioParaPrevisaoComercial {
  return { ...CENARIO_SEM_EXTRA, ...overrides };
}

describe("montarPrevisaoComercialProjeto", () => {
  it("fila vazia (nenhum confirmado): calcula normalmente só com o orçamento novo", () => {
    const resultado = montarPrevisaoComercialProjeto(baseFixture({ compromissosConfirmados: [] }), CENARIO_SEM_EXTRA);
    expect(resultado.status).toBe("calculado");
    expect(resultado.horizonteTecnico).toBe("suficiente");
    expect(resultado.primeiraEntregaPossivel).toBe("2026-09-01");
  });

  it("dois confirmados concorrentes no mesmo recurso: FIFO por dataEntradaFila decide quem consome primeiro, independente da ordem no array", () => {
    const base = baseFixture({
      compromissosConfirmados: [
        confirmado({ chaveOrdenacao: "c-2", dataEntradaFila: "2026-08-10", horasRestantesPadrao: 4 }),
        confirmado({ chaveOrdenacao: "c-1", dataEntradaFila: "2026-08-01", horasRestantesPadrao: 4 }),
      ],
      necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 8 })],
    });

    const resultado = montarPrevisaoComercialProjeto(base, CENARIO_SEM_EXTRA);
    expect(resultado.status).toBe("calculado");
    // Os 2 confirmados (8h) esgotam o dia 1 - orçamento novo só começa no dia 2.
    expect(resultado.primeiraEntregaPossivel).toBe("2026-09-02");
  });

  it("necessidadesOrcamentoNovo vazio: status sem_necessidades, nunca lança RangeError, campos numéricos/booleanos/custo null (nunca false/0)", () => {
    const diagnosticos: DiagnosticoPrevisaoComercial[] = [
      { empresaId: "empresa-1", projetoId: "projeto-novo", motivo: "Projeto sem simulação comercial vigente - orçamento novo não pode ser avaliado, nunca fabricado." },
    ];
    const resultado = montarPrevisaoComercialProjeto(baseFixture({ necessidadesOrcamentoNovo: [], diagnosticos }), CENARIO_SEM_EXTRA);

    expect(resultado.status).toBe("sem_necessidades");
    expect(resultado.primeiraEntregaPossivel).toBeNull();
    expect(resultado.atendeDataSolicitada).toBeNull();
    expect(resultado.diferencaEmDias).toBeNull();
    expect(resultado.horizonteTecnico).toBeNull();
    expect(resultado.custoAdicional).toBeNull();
    expect(resultado.capacidadeUtilizada).toBeNull();
    expect(resultado.diagnosticos).toEqual(diagnosticos);
  });

  it("diagnóstico com bloqueiaCalculo=true (granularidade insuficiente, propagação sintética - não comprova geração por carregamento real): bloqueia o cálculo inteiro, chega intacto ao resultado final", () => {
    const diagnosticoBloqueante: DiagnosticoPrevisaoComercial = {
      empresaId: "empresa-1",
      projetoId: "projeto-outro-confirmado",
      recursoId: "recurso-A",
      motivo: "PCP cobre parte da carga deste recurso, mas o snapshot comercial está agregado (sem chave granular) e não há declaração de cobertura integral do adaptador PCP - impossível deduplicar com segurança.",
      bloqueiaCalculo: true,
    } as DiagnosticoPrevisaoComercial;
    const base = baseFixture({
      compromissosConfirmados: [confirmado()],
      necessidadesOrcamentoNovo: [necessidade()],
      diagnosticos: [diagnosticoBloqueante],
    });

    const resultado = montarPrevisaoComercialProjeto(base, CENARIO_SEM_EXTRA);

    expect(resultado.status).toBe("bloqueado_por_diagnostico");
    expect(resultado.primeiraEntregaPossivel).toBeNull();
    expect(resultado.atendeDataSolicitada).toBeNull();
    expect(resultado.diferencaEmDias).toBeNull();
    expect(resultado.horizonteTecnico).toBeNull();
    expect(resultado.custoAdicional).toBeNull();
    expect(resultado.capacidadeUtilizada).toBeNull();
    expect(resultado.diagnosticos).toEqual([diagnosticoBloqueante]);
    expect(resultado.diagnosticos[0].motivo).toMatch(/impossível deduplicar com segurança/);
  });

  it("diagnóstico informativo (bloqueiaCalculo ausente/false) nunca bloqueia o cálculo - só o diagnóstico literalmente marcado bloqueia", () => {
    const diagnosticoInformativo: DiagnosticoPrevisaoComercial = {
      empresaId: "empresa-1",
      projetoId: "projeto-excluido-da-fila",
      motivo: "Projeto em pedido_recebido sem simulação comercial vigente - excluído da fila de confirmados.",
    };
    const resultado = montarPrevisaoComercialProjeto(baseFixture({ diagnosticos: [diagnosticoInformativo] }), CENARIO_SEM_EXTRA);

    expect(resultado.status).toBe("calculado");
    expect(resultado.diagnosticos).toEqual([diagnosticoInformativo]);
  });

  describe("diferencaEmDias: positivo = atraso, negativo = folga, zero = na data exata", () => {
    it("positivo quando a previsão fica depois da data solicitada", () => {
      const base = baseFixture({
        dataSolicitadaCliente: "2026-09-01",
        compromissosConfirmados: [confirmado({ horasRestantesPadrao: 8 })], // ocupa o dia 1 inteiro
        necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 8 })],
      });
      const resultado = montarPrevisaoComercialProjeto(base, CENARIO_SEM_EXTRA);
      expect(resultado.primeiraEntregaPossivel).toBe("2026-09-02");
      expect(resultado.diferencaEmDias).toBe(1);
      expect(resultado.atendeDataSolicitada).toBe(false);
    });

    it("negativo quando a previsão fica antes da data solicitada", () => {
      const base = baseFixture({ dataSolicitadaCliente: "2026-09-05", necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 8 })] });
      const resultado = montarPrevisaoComercialProjeto(base, CENARIO_SEM_EXTRA);
      expect(resultado.primeiraEntregaPossivel).toBe("2026-09-01");
      expect(resultado.diferencaEmDias).toBe(-4);
      expect(resultado.atendeDataSolicitada).toBe(true);
    });

    it("zero quando a previsão cai exatamente na data solicitada", () => {
      const base = baseFixture({ dataSolicitadaCliente: "2026-09-01", necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 8 })] });
      const resultado = montarPrevisaoComercialProjeto(base, CENARIO_SEM_EXTRA);
      expect(resultado.primeiraEntregaPossivel).toBe("2026-09-01");
      expect(resultado.diferencaEmDias).toBe(0);
      expect(resultado.atendeDataSolicitada).toBe(true);
    });

    it("null quando horizonteTecnico=insuficiente - nunca finge uma diferença sem data de entrega", () => {
      const base = baseFixture({
        necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 100000 })],
        datasGrade: gerarDatas("2026-09-01", 5),
      });
      const resultado = montarPrevisaoComercialProjeto(base, CENARIO_SEM_EXTRA);
      expect(resultado.horizonteTecnico).toBe("insuficiente");
      expect(resultado.primeiraEntregaPossivel).toBeNull();
      expect(resultado.diferencaEmDias).toBeNull();
    });
  });

  it("tipoAnalise identifica sempre 'previsao_comercial_por_capacidade' - nunca confundido com programação de PCP", () => {
    const calculado = montarPrevisaoComercialProjeto(baseFixture(), CENARIO_SEM_EXTRA);
    const semNecessidades = montarPrevisaoComercialProjeto(baseFixture({ necessidadesOrcamentoNovo: [] }), CENARIO_SEM_EXTRA);
    expect(calculado.tipoAnalise).toBe("previsao_comercial_por_capacidade");
    expect(semNecessidades.tipoAnalise).toBe("previsao_comercial_por_capacidade");
  });

  it("base reutilizada sem nova rede: 2 chamadas com cenários diferentes (inclusive disponibilidade de material) sobre a MESMA base não mutam a base (Object.freeze real, não só de tipo)", () => {
    const base = baseFixture({
      compromissosConfirmados: [confirmado()],
      necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 4 })],
    });
    const snapshotAntes = JSON.parse(JSON.stringify({ ...base, capacidadesNormais: [...base.capacidadesNormais] }));

    // Prova por TENTATIVA REAL de mutação, não só por não ter mutado sozinho -
    // montarPrevisaoComercialProjeto nem precisaria tentar mutar para este
    // teste falhar caso a base não fosse de fato imutável; aqui a base é
    // atacada diretamente e precisa resistir em runtime.
    expect(Object.isFrozen(base)).toBe(true);
    expect(() => (base.compromissosConfirmados as unknown as unknown[]).push(confirmado())).toThrow(TypeError);
    expect(() => (base.necessidadesOrcamentoNovo as unknown as unknown[]).push(necessidade())).toThrow(TypeError);
    expect(() => (base.capacidadesNormais as unknown as Map<string, unknown>).set("forjado", {})).toThrow(TypeError);
    expect(() => (base.datasGrade as unknown as string[]).push("2099-01-01")).toThrow(TypeError);
    expect(() => {
      (base.compromissosConfirmados[0] as unknown as { horasRestantesPadrao: number }).horasRestantesPadrao = 999;
    }).toThrow(TypeError);

    // "Cenário atual" (material original) e "Cenário ajustado" (material
    // negociado, 4 dias antes) sobre a MESMA referência de base.
    montarPrevisaoComercialProjeto(base, cenario({ disponibilidadeMaterialOrcamentoNovo: "2026-09-05" }));
    montarPrevisaoComercialProjeto(base, cenario({ disponibilidadeMaterialOrcamentoNovo: "2026-09-01" }));

    const snapshotDepois = JSON.parse(JSON.stringify({ ...base, capacidadesNormais: [...base.capacidadesNormais] }));
    expect(snapshotDepois).toEqual(snapshotAntes);
  });

  it("cenários independentes: 2 chamadas sobre a mesma base nunca contaminam uma a outra", () => {
    const base = baseFixture({
      compromissosConfirmados: [confirmado({ horasRestantesPadrao: 4 })],
      necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 4 })],
    });

    const resultado1 = montarPrevisaoComercialProjeto(base, CENARIO_SEM_EXTRA);
    // "Cenário" bem diferente da mesma base, entre as duas chamadas de interesse.
    montarPrevisaoComercialProjeto(baseFixture({ necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 500 })] }), CENARIO_SEM_EXTRA);
    const resultado2 = montarPrevisaoComercialProjeto(base, CENARIO_SEM_EXTRA);

    expect(resultado1).toEqual(resultado2);
  });

  // --- Correção DEC-007 (achada em teste visual real, projeto 260011):
  // disponibilidade de material do orçamento novo é POR CENÁRIO. Nota:
  // "alterar alternativas não gera nova consulta ao Supabase" (teste
  // obrigatório 9) é uma propriedade do HOOK (usePrevisaoComercialCapacidade.ts),
  // não desta função pura - já coberta em usePrevisaoComercialCapacidade.test.ts.
  describe("disponibilidade de material por cenário", () => {
    it("1. Cenário atual usa a disponibilidade original de material - nunca a negociada", () => {
      const base = baseFixture({ necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 8 })] });
      const resultado = montarPrevisaoComercialProjeto(base, cenario({ disponibilidadeMaterialOrcamentoNovo: "2026-09-05" }));
      // A necessidade "pede" 09-01 (fixture), mas o CENÁRIO vence - prova que a base nunca decide isso sozinha.
      expect(resultado.primeiraEntregaPossivel).toBe("2026-09-05");
    });

    it("2. Cenário ajustado usa a disponibilidade negociada, anterior à original", () => {
      const base = baseFixture({ necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 8 })] });
      const resultado = montarPrevisaoComercialProjeto(base, cenario({ disponibilidadeMaterialOrcamentoNovo: "2026-09-01" }));
      expect(resultado.primeiraEntregaPossivel).toBe("2026-09-01");
    });

    it("3. antecipar material nunca altera QUANDO os compromissos confirmados consomem capacidade - o confirmado sempre vence o dia 01/09, em ambos os cenários", () => {
      const base = baseFixture({
        compromissosConfirmados: [confirmado({ recursoId: "recurso-A", horasRestantesPadrao: 8, disponivelAPartirDe: "2026-09-01", dataEntradaFila: "2026-08-01" })],
        necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 8 })],
      });

      const atual = montarPrevisaoComercialProjeto(base, cenario({ disponibilidadeMaterialOrcamentoNovo: "2026-09-05" }));
      const ajustado = montarPrevisaoComercialProjeto(base, cenario({ disponibilidadeMaterialOrcamentoNovo: "2026-09-01" }));

      // Cenário atual: material só em 05/09, dia sempre livre (confirmado só ocupou 01/09) -> entrega em 05/09.
      expect(atual.primeiraEntregaPossivel).toBe("2026-09-05");
      // Cenário ajustado: material liberado em 01/09, MAS o confirmado (FIFO, entrou antes) ainda consome o
      // dia inteiro - orçamento novo é empurrado pro dia seguinte, nunca "rouba" a capacidade do confirmado.
      // Se o confirmado tivesse sido alterado pela negociação, o resultado seria 01/09, não 02/09.
      expect(ajustado.primeiraEntregaPossivel).toBe("2026-09-02");
    });

    it("4. antecipar material pode antecipar a primeira entrega possível do cenário ajustado em relação ao atual", () => {
      const base = baseFixture({ necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 8 })] });
      const atual = montarPrevisaoComercialProjeto(base, cenario({ disponibilidadeMaterialOrcamentoNovo: "2026-09-05" }));
      const ajustado = montarPrevisaoComercialProjeto(base, cenario({ disponibilidadeMaterialOrcamentoNovo: "2026-09-01" }));
      expect(ajustado.primeiraEntregaPossivel! < atual.primeiraEntregaPossivel!).toBe(true);
      expect(ajustado.diferencaEmDias!).toBeLessThan(atual.diferencaEmDias!);
    });

    it("5. antecipação sem efeito real (o gargalo é capacidade, não material) produz a MESMA primeira entrega no atual e no ajustado - zero dias ganhos, honestamente", () => {
      // Confirmado ocupa recurso-A por 21 dias inteiros (168h/8h) a partir de 20/08 - capacidade só
      // fica livre em 10/09, bem DEPOIS das duas disponibilidades de material (originais/negociadas)
      // testadas abaixo. Negociar material não adianta nada aqui: o gargalo real é a capacidade.
      const base = baseFixture({
        compromissosConfirmados: [confirmado({ recursoId: "recurso-A", horasRestantesPadrao: 168, disponivelAPartirDe: "2026-08-20", dataEntradaFila: "2026-08-01" })],
        necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 8 })],
        datasGrade: gerarDatas("2026-08-20", 60),
      });

      const atual = montarPrevisaoComercialProjeto(base, cenario({ disponibilidadeMaterialOrcamentoNovo: "2026-09-05" }));
      const ajustado = montarPrevisaoComercialProjeto(base, cenario({ disponibilidadeMaterialOrcamentoNovo: "2026-09-01" }));

      expect(ajustado.primeiraEntregaPossivel).toBe(atual.primeiraEntregaPossivel);
      expect(ajustado.diferencaEmDias).toBe(atual.diferencaEmDias);
    });

    it("6. hora extra numa data entre a negociada e a original é aceita e USADA só no cenário ajustado - o cenário atual nem chega a considerar essa data", () => {
      const capExtra: CapacidadeExtraDia = {
        recursoId: "recurso-A",
        data: "2026-09-01",
        horasAdicionaisDisponiveis: 8,
        natureza: "hora_extra",
        elegibilidade: { escopo: "somente_orcamento_novo" },
        contratacaoId: "contratacao-extra",
      };
      const base = baseFixture({
        compromissosConfirmados: [confirmado({ recursoId: "recurso-A", horasRestantesPadrao: 8, disponivelAPartirDe: "2026-09-01", dataEntradaFila: "2026-08-01" })], // esgota a capacidade NORMAL do dia 01/09
        necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 4 })],
      });
      const cenarioComExtra = { capacidadeExtraAutorizada: [capExtra], temporariosPorPrioridade: [], contratacoes: [contratacaoFixture({ id: "contratacao-extra" })], contratacaoNegociacaoMaterial: null };

      const atual = montarPrevisaoComercialProjeto(base, { ...cenarioComExtra, disponibilidadeMaterialOrcamentoNovo: "2026-09-05" });
      const ajustado = montarPrevisaoComercialProjeto(base, { ...cenarioComExtra, disponibilidadeMaterialOrcamentoNovo: "2026-09-01" });

      // Cenário atual: a necessidade nunca considera 01/09 (piso em 05/09) - a hora extra de 01/09 é irrelevante.
      expect(atual.primeiraEntregaPossivel).toBe("2026-09-05");
      // Cenário ajustado: material liberado em 01/09; normal já ocupado pelo confirmado, mas a hora extra cobre as 4h.
      expect(ajustado.primeiraEntregaPossivel).toBe("2026-09-01");
    });

    it("7. material antecipado e hora extra se combinam no MESMO cálculo do cenário ajustado - nenhum dos dois sozinho bastaria", () => {
      const capExtra: CapacidadeExtraDia = {
        recursoId: "recurso-A",
        data: "2026-09-01",
        horasAdicionaisDisponiveis: 8,
        natureza: "hora_extra",
        elegibilidade: { escopo: "somente_orcamento_novo" },
        contratacaoId: "contratacao-extra",
      };
      const base = baseFixture({
        compromissosConfirmados: [confirmado({ recursoId: "recurso-A", horasRestantesPadrao: 8, disponivelAPartirDe: "2026-09-01", dataEntradaFila: "2026-08-01" })],
        necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 4 })],
      });

      const ajustado = montarPrevisaoComercialProjeto(
        base,
        cenario({
          capacidadeExtraAutorizada: [capExtra],
          contratacoes: [contratacaoFixture({ id: "contratacao-extra" })],
          disponibilidadeMaterialOrcamentoNovo: "2026-09-01",
        }),
      );

      // Só possível combinando: material liberado em 01/09 (sem isso, nem chegaria perto) E hora extra
      // em 01/09 (sem isso, a capacidade normal já estaria toda com o confirmado).
      expect(ajustado.primeiraEntregaPossivel).toBe("2026-09-01");
    });

    it("11. capacidadeExtraAutorizada numa data FORA da grade (fora da janela ajustada) nunca é usada - a grade continua sendo o limite real", () => {
      const base = baseFixture({ necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 4 })], datasGrade: gerarDatas("2026-09-01", 5) });
      const capExtraForaDaGrade: CapacidadeExtraDia = {
        recursoId: "recurso-A",
        data: "2026-10-01",
        horasAdicionaisDisponiveis: 100,
        natureza: "hora_extra",
        elegibilidade: { escopo: "somente_orcamento_novo" },
        contratacaoId: "contratacao-fora",
      };
      const resultado = montarPrevisaoComercialProjeto(
        base,
        cenario({ capacidadeExtraAutorizada: [capExtraForaDaGrade], contratacoes: [contratacaoFixture({ id: "contratacao-fora" })] }),
      );
      expect(resultado.status).toBe("calculado");
      expect(resultado.primeiraEntregaPossivel).toBe("2026-09-01"); // capacidade NORMAL do dia 1 já basta - a regra fora da grade nunca entra em jogo
    });
  });

  describe("10. custoAdicional - soma exata de 3 categorias, nenhuma fórmula nova (reaproveita calcularCustoContratacoes)", () => {
    it("Cenário atual (sem nenhuma alternativa) tem custo genuinamente ZERO - calculado, nunca 'não calculável'", () => {
      const resultado = montarPrevisaoComercialProjeto(baseFixture(), CENARIO_SEM_EXTRA);
      expect(resultado.custoAdicional).toEqual({ negociacaoMaterial: 0, horaAdicional: 0, recursoTemporario: 0, total: 0 });
    });

    it("soma negociação de material + hora adicional + recurso temporário efetivamente utilizados - cobrando só o que foi REALMENTE alocado, nunca o teto autorizado", () => {
      // Necessidade de 12h, capacidade normal de recurso-A = 4h/dia - força
      // 4h normal + 4h hora adicional + 4h recurso temporário, todas no
      // mesmo dia 01/09 (ordem de preferência: normal > adicional > temporário vinculado).
      const capacidadesNormais = capacidadesMap([{ recursoId: "recurso-A", capacidadeHorasMaquinaDia: 4, produtividade: 1 }]);
      const capExtra: CapacidadeExtraDia = {
        recursoId: "recurso-A",
        data: "2026-09-01",
        horasAdicionaisDisponiveis: 4, // teto EXATO ao uso real (4h) - a hora adicional tem prioridade sobre o temporário, então um teto maior aqui absorveria tudo antes do temporário entrar
        natureza: "hora_extra",
        elegibilidade: { escopo: "somente_orcamento_novo" },
        contratacaoId: "contratacao-extra",
      };
      const temporario = temporarioFixture({ disponibilidade: [{ data: "2026-09-01", horasDisponiveis: 8 }] }); // teto 8h, uso real só 4h (resto já coberto por normal+adicional) - prova que cobra só o uso real, não o teto

      const base = baseFixture({ capacidadesNormais, necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 12 })] });

      const resultado = montarPrevisaoComercialProjeto(base, {
        capacidadeExtraAutorizada: [capExtra],
        temporariosPorPrioridade: [temporario],
        disponibilidadeMaterialOrcamentoNovo: DISPONIBILIDADE_MATERIAL_PADRAO,
        contratacoes: [contratacaoFixture({ id: "contratacao-extra", valor: 10 }), contratacaoFixture({ id: "contratacao-temporario", valor: 15 })],
        contratacaoNegociacaoMaterial: contratacaoFixture({ id: "contratacao-material", abrangencia: "valor_fixo_unico", valor: 500 }),
      });

      expect(resultado.primeiraEntregaPossivel).toBe("2026-09-01"); // tudo cabe no mesmo dia, combinando os 3 tiers
      expect(resultado.custoAdicional).not.toBeNull();
      // 4h normal (sem custo) + 4h adicional × R$10 = 40 + 4h temporário × R$15 = 60 + material R$500 fixo.
      expect(resultado.custoAdicional!.horaAdicional).toBeCloseTo(40);
      expect(resultado.custoAdicional!.recursoTemporario).toBeCloseTo(60);
      expect(resultado.custoAdicional!.negociacaoMaterial).toBe(500);
      expect(resultado.custoAdicional!.total).toBeCloseTo(600);
      expect(resultado.custoAdicional!.total).toBeCloseTo(
        resultado.custoAdicional!.negociacaoMaterial + resultado.custoAdicional!.horaAdicional + resultado.custoAdicional!.recursoTemporario,
      );
      // capacidadeUtilizada (horas) usa a MESMA fonte do custo (AlocacaoNecessidadeFlexivel) - mesma prova, em horas.
      expect(resultado.capacidadeUtilizada).not.toBeNull();
      expect(resultado.capacidadeUtilizada!.horaAdicionalHoras).toBeCloseTo(4); // não 8 (teto) - só o uso real
      expect(resultado.capacidadeUtilizada!.recursoTemporarioHoras).toBeCloseTo(4); // não 8 (teto) - só o uso real
    });

    it("negociação de material entra UMA ÚNICA VEZ (abrangência fixa, não depende de uso/horas) - nunca cobrada por operação", () => {
      const base = baseFixture({ necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 4 }), necessidade({ chaveTrabalho: "op-novo-2", horasNecessariasPadrao: 4 })] });
      const resultado = montarPrevisaoComercialProjeto(base, cenario({ contratacaoNegociacaoMaterial: contratacaoFixture({ id: "contratacao-material", abrangencia: "valor_fixo_unico", valor: 300 }) }));
      expect(resultado.custoAdicional!.negociacaoMaterial).toBe(300); // não 600 - cobrado 1x, mesmo com 2 necessidades usando o material antecipado
    });

    it("custoAdicional é null (não calculável, nunca 0 fingido) quando status !== 'calculado'", () => {
      const semNecessidades = montarPrevisaoComercialProjeto(baseFixture({ necessidadesOrcamentoNovo: [] }), CENARIO_SEM_EXTRA);
      expect(semNecessidades.custoAdicional).toBeNull();
    });

    it("custoAdicional é null (nunca 0 fingido) quando uma alocação referencia uma contratação ausente de cenario.contratacoes - inconsistência real de dado", () => {
      const capExtra: CapacidadeExtraDia = {
        recursoId: "recurso-A",
        data: "2026-09-01",
        horasAdicionaisDisponiveis: 8,
        natureza: "hora_extra",
        elegibilidade: { escopo: "somente_orcamento_novo" },
        contratacaoId: "contratacao-orfa",
      };
      const base = baseFixture({
        compromissosConfirmados: [confirmado({ recursoId: "recurso-A", horasRestantesPadrao: 8, disponivelAPartirDe: "2026-09-01", dataEntradaFila: "2026-08-01" })],
        necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 4 })],
      });
      const resultado = montarPrevisaoComercialProjeto(
        base,
        cenario({ capacidadeExtraAutorizada: [capExtra], contratacoes: [] /* "contratacao-orfa" nunca declarada aqui - inconsistência proposital */ }),
      );
      // A DATA continua calculada normalmente - um erro de custo nunca derruba a previsão de prazo.
      expect(resultado.status).toBe("calculado");
      expect(resultado.primeiraEntregaPossivel).not.toBeNull();
      expect(resultado.custoAdicional).toBeNull();
    });
  });

  // CORREÇÃO (achada em teste visual real, projeto 260011): o total
  // agregado (capacidadeUtilizada.horaAdicionalHoras) e o detalhamento
  // por recurso (detalhamentoPorRecurso) divergiam sempre que
  // produtividade != 1 - detalhamentoCapacidadePorRecurso.ts somava
  // horasPadrao em vez de horasMaquina (ver
  // detalhamentoCapacidadePorRecurso.ts para a explicação completa da
  // unidade). Teste de INTEGRAÇÃO (via montarPrevisaoComercialProjeto,
  // a mesma função que a tela chama) - o teste unitário equivalente já
  // existe em detalhamentoCapacidadePorRecurso.test.ts.
  describe("detalhamentoPorRecurso reconcilia com o total agregado", () => {
    it("soma de detalhamentoPorRecurso[].horasExtrasUtilizadas bate com capacidadeUtilizada.horaAdicionalHoras quando produtividade != 1", () => {
      const base = baseFixture({
        capacidadesNormais: capacidadesMap([{ recursoId: "recurso-A", capacidadeHorasMaquinaDia: 8, produtividade: 0.85 }]),
        necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 30 })],
      });
      const capExtra: CapacidadeExtraDia = {
        recursoId: "recurso-A",
        data: "2026-09-01",
        horasAdicionaisDisponiveis: 10,
        natureza: "hora_extra",
        elegibilidade: { escopo: "somente_orcamento_novo" },
        contratacaoId: "contratacao-extra",
      };

      const resultado = montarPrevisaoComercialProjeto(base, cenario({ capacidadeExtraAutorizada: [capExtra] }));

      expect(resultado.status).toBe("calculado");
      expect(resultado.capacidadeUtilizada).not.toBeNull();
      expect(resultado.capacidadeUtilizada!.horaAdicionalHoras).toBeGreaterThan(0);

      const somaDetalhamento = resultado.detalhamentoPorRecurso.reduce((s, l) => s + l.horasExtrasUtilizadas, 0);
      expect(somaDetalhamento).toBeCloseTo(resultado.capacidadeUtilizada!.horaAdicionalHoras, 5);
    });
  });
});
