import { describe, expect, it, vi } from "vitest";
import {
  orquestrarAprovacaoCenarioComercial,
  MENSAGEM_ERRO_GENERICA_APROVACAO_CENARIO,
  type DependenciasAprovacaoCenarioComercial,
  type ValoresOrcamentoAtual,
} from "./orquestrarAprovacaoCenarioComercial";
import type { PayloadAprovacaoCenario } from "./validarPayloadAprovacaoCenario";
import type { ResultadoJanelaComercial } from "../lib/prepararJanelaComercial";
import type { BasePrevisaoComercial } from "../lib/cenarios/carregarBasePrevisaoComercial";
import type { NecessidadeCapacidadeFlexivel, CapacidadeNormalRecurso } from "../lib/cenarios/necessidadeCapacidadeFlexivel";

function necessidade(overrides: Partial<NecessidadeCapacidadeFlexivel> = {}): NecessidadeCapacidadeFlexivel {
  return {
    empresaId: "empresa-1",
    projetoId: "projeto-1",
    projetoItemId: "item-1",
    chaveTrabalho: "op-1",
    recursoOriginalId: "recurso-A",
    recursosCompativeisPorPrioridade: [],
    horasNecessariasPadrao: 4,
    disponivelAPartirDe: "2026-09-01",
    ...overrides,
  };
}

function capacidade(recursoId: string, capacidadeHorasMaquinaDia: number): CapacidadeNormalRecurso {
  return { recursoId, capacidadeHorasMaquinaDia, produtividade: 1 };
}

function gerarDatas(inicio: string, quantidade: number): string[] {
  const [ano, mes, dia] = inicio.split("-").map(Number);
  const datas: string[] = [];
  for (let i = 0; i < quantidade; i++) {
    datas.push(new Date(Date.UTC(ano, mes - 1, dia + i)).toISOString().slice(0, 10));
  }
  return datas;
}

function baseMinima(overrides: Partial<BasePrevisaoComercial> = {}): BasePrevisaoComercial {
  const datasGrade = gerarDatas("2026-09-01", 30);
  return {
    empresaId: "empresa-1",
    projetoId: "projeto-1",
    dataSolicitadaCliente: "2026-09-01",
    compromissosConfirmados: [],
    necessidadesOrcamentoNovo: [necessidade()],
    capacidadesNormais: new Map([["recurso-A", capacidade("recurso-A", 8)]]),
    datasGrade,
    diasProdutivos: new Set(datasGrade),
    diagnosticos: [],
    ...overrides,
  };
}

function janelaValida(overrides: Partial<ResultadoJanelaComercial> = {}): ResultadoJanelaComercial {
  return {
    valida: true,
    dataDisponibilidadeProducao: "2026-09-01",
    prazoInterno: "2026-10-01",
    dataChegadaPrevista: "2026-09-01",
    ...overrides,
  } as ResultadoJanelaComercial;
}

function payload(overrides: Partial<PayloadAprovacaoCenario> = {}): PayloadAprovacaoCenario {
  return {
    projetoId: "projeto-1",
    tipoCenario: "atual",
    dataNecessidade: "2026-09-10",
    margemSegurancaDias: 0,
    dataPrevistaAprovacaoPedido: "2026-08-20",
    capacidadeExtraAutorizada: [],
    temporariosPorPrioridade: [],
    disponibilidadeMaterialNegociada: null,
    contratacoes: [],
    contratacaoNegociacaoMaterial: null,
    statusExibido: "calculado",
    primeiraEntregaPossivelExibida: "2026-09-01",
    diferencaEmDiasExibida: 0,
    custoAdicionalExibido: { negociacaoMaterial: 0, horaAdicional: 0, recursoTemporario: 0, total: 0 },
    custoTecnicoAtualExibido: 50000,
    valorComercialAtualReferenciaExibido: 62000,
    motivoSubstituicao: null,
    chaveIdempotencia: "11111111-1111-1111-1111-111111111111",
    ...overrides,
  };
}

function valoresOrcamento(overrides: Partial<ValoresOrcamentoAtual> = {}): ValoresOrcamentoAtual {
  return { custoTecnicoAtual: 50000, valorComercialAtualReferencia: 62000, tipoProjeto: "fabricacao", ...overrides };
}

function depsBase(overrides: Partial<DependenciasAprovacaoCenarioComercial> = {}): DependenciasAprovacaoCenarioComercial {
  return {
    autenticar: vi.fn().mockResolvedValue("user-1"),
    autorizarAprovador: vi.fn().mockResolvedValue({ empresaId: "empresa-1" }),
    calcularAssinaturaTecnica: vi.fn().mockResolvedValue("a".repeat(64)),
    // Fiel ao contrato real de prepararJanelaComercial: modo
    // "industrializacao" devolve dataDisponibilidadeProducao/dataChegadaPrevista
    // = dataPrevistaAprovacaoPedido, sem os deslocamentos genéricos -
    // "padrao" (default) mantém a fixture fixa de sempre.
    prepararJanela: vi.fn().mockImplementation((_empresaId, premissas, modo) =>
      Promise.resolve(
        modo === "industrializacao"
          ? janelaValida({
              dataDisponibilidadeProducao: premissas.dataPrevistaAprovacaoPedido,
              dataChegadaPrevista: premissas.dataPrevistaAprovacaoPedido,
            })
          : janelaValida(),
      ),
    ),
    carregarBase: vi.fn().mockResolvedValue(baseMinima()),
    buscarValoresOrcamentoAtual: vi.fn().mockResolvedValue(valoresOrcamento()),
    persistir: vi.fn().mockResolvedValue({ cenarioComercialAprovadoId: "novo-id", erro: null }),
    ...overrides,
  };
}

describe("orquestrarAprovacaoCenarioComercial", () => {
  it("aprova o cenário atual sem custo adicional (feliz, custoAdicional=0)", async () => {
    const deps = depsBase();
    const resultado = await orquestrarAprovacaoCenarioComercial(payload(), deps);

    expect(resultado).toEqual({ ok: true, cenarioComercialAprovadoId: "novo-id" });
    expect(deps.persistir).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: "empresa-1",
        aprovadoPor: "user-1",
        tipoCenario: "atual",
        custoTecnicoAtual: 50000,
        custoAdicionalPorCategoria: { negociacaoMaterial: 0, horaAdicional: 0, recursoTemporario: 0, terceirizacao: 0 },
        assinaturaTecnica: "a".repeat(64),
      }),
    );
  });

  it("nao_autenticado quando autenticar() devolve null", async () => {
    const deps = depsBase({ autenticar: vi.fn().mockResolvedValue(null) });
    const resultado = await orquestrarAprovacaoCenarioComercial(payload(), deps);
    expect(resultado).toEqual({ ok: false, motivo: "nao_autenticado" });
    expect(deps.autorizarAprovador).not.toHaveBeenCalled();
    expect(deps.persistir).not.toHaveBeenCalled();
  });

  it("autenticar() lança um erro que não é timeout (ex.: mesmo lock do GoTrueClient já documentado em AuthGate.tsx): motivo='falha_etapa', etapa='autenticar'", async () => {
    const deps = depsBase({ autenticar: vi.fn().mockRejectedValue(new Error("lock nunca liberado")) });
    const resultado = await orquestrarAprovacaoCenarioComercial(payload(), deps);
    expect(resultado).toEqual({ ok: false, motivo: "falha_etapa", etapa: "autenticar", duracaoMs: expect.any(Number) });
    expect(deps.persistir).not.toHaveBeenCalled();
  });

  // persistir é DELIBERADAMENTE não rastreado (nunca tem timeout, nunca
  // é atribuído a uma "etapa") - se lançar de forma inesperada (fora do
  // próprio contrato de gravacaoIncerta/erro), cai no "erro" genérico de
  // sempre, nunca é confundido com a ÚLTIMA etapa rastreada (que já
  // tinha terminado com sucesso antes de persistir ser chamado).
  it("persistir lança de forma inesperada (fora do contrato normal): cai no 'erro' genérico, nunca atribuído à última etapa rastreada", async () => {
    const deps = depsBase({ persistir: vi.fn().mockRejectedValue(new Error("erro totalmente inesperado")) });
    const resultado = await orquestrarAprovacaoCenarioComercial(payload(), deps);
    expect(resultado).toEqual({ ok: false, motivo: "erro", mensagem: MENSAGEM_ERRO_GENERICA_APROVACAO_CENARIO });
  });

  it("nao_autorizado quando autorizarAprovador() devolve null (sem perfil admin ativo) - MESMA regra de usuario_e_admin(), nunca aprova sem checar", async () => {
    const deps = depsBase({ autorizarAprovador: vi.fn().mockResolvedValue(null) });
    const resultado = await orquestrarAprovacaoCenarioComercial(payload(), deps);
    expect(resultado).toEqual({ ok: false, motivo: "nao_autorizado" });
    expect(deps.persistir).not.toHaveBeenCalled();
  });

  it("calcula a assinatura técnica com a MESMA janela produtiva do snapshot (disponibilidadeOriginal/primeiraEntregaPossivel), nunca [dataSolicitadaCliente, prazoProposto]", async () => {
    const deps = depsBase();
    await orquestrarAprovacaoCenarioComercial(payload(), deps);
    // depsBase() usa modo "padrao" (tipoProjeto=fabricacao) -
    // disponibilidadeOriginal = janelaValida().dataDisponibilidadeProducao
    // ("2026-09-01", ver janelaValida() acima) - NUNCA
    // dataPrevistaAprovacaoPedido ("2026-08-20", só usada para
    // Industrialização, ver teste dedicado mais abaixo). primeiraEntregaPossivel
    // = "2026-09-01" porque a necessidade (4h, base mínima, capacidade
    // 8h/dia) cabe no mesmo dia da grade - MESMO valor que
    // payload().primeiraEntregaPossivelExibida, exigido para o
    // cenário feliz não divergir.
    expect(deps.calcularAssinaturaTecnica).toHaveBeenCalledWith("empresa-1", "projeto-1", "2026-09-01", "2026-09-01");
  });

  // Correção (achado real: mensagem genérica não dizia qual etapa falhou):
  // um erro NÃO-timeout dentro de uma etapa rastreada agora é atribuído
  // a ela (motivo="falha_etapa"), nunca mais cai no "erro" genérico sem
  // contexto - nada foi gravado (persistir nunca é alcançado).
  it("calcularAssinaturaTecnica lança um erro que NÃO é timeout: motivo='falha_etapa', etapa identificada, nunca persiste", async () => {
    const deps = depsBase({ calcularAssinaturaTecnica: vi.fn().mockRejectedValue(new Error("falha ao coletar base técnica")) });
    const resultado = await orquestrarAprovacaoCenarioComercial(payload(), deps);
    expect(resultado).toEqual({ ok: false, motivo: "falha_etapa", etapa: "calcular-assinatura-tecnica", duracaoMs: expect.any(Number) });
    expect(deps.persistir).not.toHaveBeenCalled();
  });

  it("sem_janela_produtiva quando a janela recalculada é inválida", async () => {
    const janelaInvalida = { valida: false, motivo: "prazo_insuficiente" } as unknown as ResultadoJanelaComercial;
    const deps = depsBase({ prepararJanela: vi.fn().mockResolvedValue(janelaInvalida) });
    const resultado = await orquestrarAprovacaoCenarioComercial(payload(), deps);
    expect(resultado).toEqual({ ok: false, motivo: "sem_janela_produtiva", detalhe: janelaInvalida });
    expect(deps.persistir).not.toHaveBeenCalled();
  });

  it("sem_orcamento_resolvivel quando buscarValoresOrcamentoAtual devolve null", async () => {
    const deps = depsBase({ buscarValoresOrcamentoAtual: vi.fn().mockResolvedValue(null) });
    const resultado = await orquestrarAprovacaoCenarioComercial(payload(), deps);
    expect(resultado).toEqual({ ok: false, motivo: "sem_orcamento_resolvivel" });
    expect(deps.persistir).not.toHaveBeenCalled();
  });

  it("divergente quando o prazo exibido não bate com o recalculado - nunca aprova no escuro", async () => {
    const deps = depsBase();
    const resultado = await orquestrarAprovacaoCenarioComercial(
      payload({ primeiraEntregaPossivelExibida: "2026-12-25" }),
      deps,
    );
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe("divergente");
    }
    expect(deps.persistir).not.toHaveBeenCalled();
  });

  it("divergente quando o custoTecnicoAtual exibido não bate com o recalculado", async () => {
    const deps = depsBase();
    const resultado = await orquestrarAprovacaoCenarioComercial(payload({ custoTecnicoAtualExibido: 999 }), deps);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe("divergente");
    }
  });

  it("sem_prazo_calculavel quando o horizonte técnico é insuficiente", async () => {
    const baseImpossivel = baseMinima({
      necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 1000 })],
      datasGrade: gerarDatas("2026-09-01", 3),
      diasProdutivos: new Set(gerarDatas("2026-09-01", 3)),
    });
    const deps = depsBase({
      carregarBase: vi.fn().mockResolvedValue(baseImpossivel),
    });
    const resultado = await orquestrarAprovacaoCenarioComercial(
      payload({
        statusExibido: "calculado",
        primeiraEntregaPossivelExibida: null,
        diferencaEmDiasExibida: null,
        custoAdicionalExibido: { negociacaoMaterial: 0, horaAdicional: 0, recursoTemporario: 0, total: 0 },
      }),
      deps,
    );
    expect(resultado).toEqual({ ok: false, motivo: "sem_prazo_calculavel" });
    expect(deps.persistir).not.toHaveBeenCalled();
  });

  it("erro genérico (nunca a mensagem técnica) quando a RPC falha", async () => {
    const deps = depsBase({
      persistir: vi.fn().mockResolvedValue({ cenarioComercialAprovadoId: null, erro: "Só administradores podem aprovar um cenário comercial." }),
    });
    const resultado = await orquestrarAprovacaoCenarioComercial(payload(), deps);
    expect(resultado).toEqual({ ok: false, motivo: "erro", mensagem: MENSAGEM_ERRO_GENERICA_APROVACAO_CENARIO });
  });

  it("cenário ajustado com hora adicional autorizada carrega o custo correto até o persistir", async () => {
    const baseComNecessidadeMaior = baseMinima({
      necessidadesOrcamentoNovo: [necessidade({ horasNecessariasPadrao: 12 })],
    });
    const deps = depsBase({ carregarBase: vi.fn().mockResolvedValue(baseComNecessidadeMaior) });

    const resultado = await orquestrarAprovacaoCenarioComercial(
      payload({
        tipoCenario: "ajustado",
        capacidadeExtraAutorizada: [
          {
            recursoId: "recurso-A",
            data: "2026-09-01",
            horasAdicionaisDisponiveis: 4,
            natureza: "hora_extra",
            elegibilidade: { escopo: "somente_orcamento_novo" },
            contratacaoId: "contratacao-1",
          },
        ],
        contratacoes: [
          {
            id: "contratacao-1",
            tipo: "hora_extra",
            abrangencia: "por_hora_utilizada",
            valor: 50,
            moeda: "BRL",
            fornecedorOuContratado: "Interno",
            referenciaProposta: null,
            justificativa: "Teste",
            datas: ["2026-09-01"],
          },
        ],
        statusExibido: "calculado",
        primeiraEntregaPossivelExibida: "2026-09-01",
        diferencaEmDiasExibida: 0,
        custoAdicionalExibido: { negociacaoMaterial: 0, horaAdicional: 200, recursoTemporario: 0, total: 200 },
      }),
      deps,
    );

    expect(resultado).toEqual({ ok: true, cenarioComercialAprovadoId: "novo-id" });
    expect(deps.persistir).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoCenario: "ajustado",
        custoAdicionalPorCategoria: { negociacaoMaterial: 0, horaAdicional: 200, recursoTemporario: 0, terceirizacao: 0 },
      }),
    );
  });

  // CORREÇÃO (causa raiz real do travamento, orçamento 260007, DEC-007):
  // prepararJanela precisa receber o modo certo por natureza - "padrao"
  // NUNCA recebe "industrializacao" (regressão para as outras 3
  // naturezas: fabricacao/desenvolvimento/servico, todas tratadas como
  // "padrao" - só "industrializacao" é especial).
  it("chama deps.prepararJanela com modoDisponibilidadeMaterial='industrializacao' só para essa natureza - 'padrao' para as demais (fabricacao/desenvolvimento/servico)", async () => {
    for (const tipoProjeto of ["fabricacao", "desenvolvimento", "servico"] as const) {
      const deps = depsBase({ buscarValoresOrcamentoAtual: vi.fn().mockResolvedValue(valoresOrcamento({ tipoProjeto })) });
      await orquestrarAprovacaoCenarioComercial(payload(), deps);
      expect(deps.prepararJanela).toHaveBeenCalledWith(expect.anything(), expect.anything(), "padrao");
    }

    const depsIndustrializacao = depsBase({
      buscarValoresOrcamentoAtual: vi.fn().mockResolvedValue(valoresOrcamento({ tipoProjeto: "industrializacao" })),
    });
    await orquestrarAprovacaoCenarioComercial(payload(), depsIndustrializacao);
    expect(depsIndustrializacao.prepararJanela).toHaveBeenCalledWith(expect.anything(), expect.anything(), "industrializacao");
  });

  // disponibilidadeMaterial.original do snapshot precisa ser a Data
  // Prevista de Aprovação do Pedido (params.dataPrevistaAprovacaoPedido
  // = "2026-08-20"), NUNCA a disponibilidade genérica que o modo
  // "padrao" produziria (janelaValida().dataDisponibilidadeProducao =
  // "2026-09-01", deliberadamente diferente para o teste ser conclusivo) -
  // prova que o mock fiel de prepararJanela (ver depsBase) resolve
  // corretamente por modo, e que orquestrarAprovacaoCenarioComercial usa
  // esse resultado sem reintroduzir um branch próprio.
  it("projeto de Industrialização: snapshot preserva a Data Prevista de Aprovação do Pedido como disponibilidadeMaterial.original", async () => {
    const deps = depsBase({
      buscarValoresOrcamentoAtual: vi.fn().mockResolvedValue(valoresOrcamento({ tipoProjeto: "industrializacao" })),
    });

    const resultado = await orquestrarAprovacaoCenarioComercial(payload(), deps);

    expect(resultado).toEqual({ ok: true, cenarioComercialAprovadoId: "novo-id" });
    expect(deps.persistir).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          disponibilidadeMaterial: { original: "2026-08-20", negociada: null },
        }),
      }),
    );
  });

  // Prova a defesa em profundidade: mesmo que o payload chegue com uma
  // negociação de material preenchida (cliente desatualizado/adulterado),
  // o servidor IGNORA para Industrialização - nunca confia no navegador
  // para decidir se a negociação é permitida.
  it("projeto de Industrialização: ignora disponibilidadeMaterialNegociada/contratacaoNegociacaoMaterial enviados pelo cliente, mesmo em tipoCenario=ajustado", async () => {
    const deps = depsBase({
      buscarValoresOrcamentoAtual: vi.fn().mockResolvedValue(valoresOrcamento({ tipoProjeto: "industrializacao" })),
    });

    const resultado = await orquestrarAprovacaoCenarioComercial(
      payload({
        tipoCenario: "ajustado",
        disponibilidadeMaterialNegociada: "2026-08-10",
        contratacaoNegociacaoMaterial: {
          id: "contratacao-material-1",
          tipo: "antecipacao_material",
          abrangencia: "valor_fixo_unico",
          valor: 5000,
          moeda: "BRL",
          fornecedorOuContratado: "Fornecedor X",
          referenciaProposta: null,
          justificativa: "Teste - deveria ser ignorado",
          datas: ["2026-08-10"],
        },
        statusExibido: "calculado",
        primeiraEntregaPossivelExibida: "2026-09-01",
        diferencaEmDiasExibida: 0,
        custoAdicionalExibido: { negociacaoMaterial: 0, horaAdicional: 0, recursoTemporario: 0, total: 0 },
      }),
      deps,
    );

    expect(resultado).toEqual({ ok: true, cenarioComercialAprovadoId: "novo-id" });
    expect(deps.persistir).toHaveBeenCalledWith(
      expect.objectContaining({
        custoAdicionalPorCategoria: expect.objectContaining({ negociacaoMaterial: 0 }),
        snapshot: expect.objectContaining({
          disponibilidadeMaterial: { original: "2026-08-20", negociada: null },
          decisoesCapacidade: expect.objectContaining({ contratacaoNegociacaoMaterial: null }),
        }),
      }),
    );
  });

  // Migração 20260822195805 (correção do usuário após o achado de
  // travamento em "Aprovando..." no orçamento 260007): cada etapa
  // anterior à gravação tem timeout próprio - uma promise que nunca
  // resolve (mesma classe de bug do lock do client Supabase já
  // documentada em AuthGate.tsx) precisa virar um erro recuperável e
  // identificável, nunca travar a Server Action para sempre.
  describe("timeout por etapa (nenhuma trava a gravação indevidamente, mas nenhuma promise pendente trava a Server Action para sempre)", () => {
    it("autorizarAprovador nunca resolve: tempo_esgotado com etapa='autorizar-aprovador', nunca chama persistir", async () => {
      vi.useFakeTimers();
      const deps = depsBase({ autorizarAprovador: vi.fn(() => new Promise<never>(() => {})) });

      const promessa = orquestrarAprovacaoCenarioComercial(payload(), deps);
      await vi.advanceTimersByTimeAsync(8_000);
      const resultado = await promessa;

      expect(resultado).toEqual({ ok: false, motivo: "tempo_esgotado", etapa: "autorizar-aprovador" });
      expect(deps.persistir).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("carregarBase nunca resolve: tempo_esgotado com etapa='carregar-base', nunca chama persistir", async () => {
      vi.useFakeTimers();
      const deps = depsBase({ carregarBase: vi.fn(() => new Promise<never>(() => {})) });

      const promessa = orquestrarAprovacaoCenarioComercial(payload(), deps);
      await vi.advanceTimersByTimeAsync(8_000);
      const resultado = await promessa;

      expect(resultado).toEqual({ ok: false, motivo: "tempo_esgotado", etapa: "carregar-base" });
      expect(deps.persistir).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("calcularAssinaturaTecnica nunca resolve: tempo_esgotado com etapa='calcular-assinatura-tecnica' (orçamento de 15s, o maior), nunca chama persistir", async () => {
      vi.useFakeTimers();
      const deps = depsBase({ calcularAssinaturaTecnica: vi.fn(() => new Promise<never>(() => {})) });

      const promessa = orquestrarAprovacaoCenarioComercial(payload(), deps);
      await vi.advanceTimersByTimeAsync(15_000);
      const resultado = await promessa;

      expect(resultado).toEqual({ ok: false, motivo: "tempo_esgotado", etapa: "calcular-assinatura-tecnica" });
      expect(deps.persistir).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("persistir NUNCA tem timeout - mesmo demorando mais que qualquer orçamento das etapas anteriores, aguarda a resposta real", async () => {
      vi.useFakeTimers();
      let resolverPersistir!: (valor: { cenarioComercialAprovadoId: string; erro: null }) => void;
      const deps = depsBase({
        persistir: vi.fn(
          () =>
            new Promise<{ cenarioComercialAprovadoId: string; erro: null }>((resolve) => {
              resolverPersistir = resolve;
            }),
        ),
      });

      const promessa = orquestrarAprovacaoCenarioComercial(payload(), deps);
      // Avança bem além de qualquer timeout de etapa anterior (15s) -
      // persistir continua pendente, sem timeout algum.
      await vi.advanceTimersByTimeAsync(60_000);
      resolverPersistir({ cenarioComercialAprovadoId: "novo-id", erro: null });
      const resultado = await promessa;

      expect(resultado).toEqual({ ok: true, cenarioComercialAprovadoId: "novo-id" });
      vi.useRealTimers();
    });
  });

  // Migração 20260822195805 (idempotência) - chaveIdempotencia/
  // hashSolicitacao propagados até persistir; falha AMBÍGUA da RPC vira
  // motivo="gravacao_incerta" (nunca "erro" genérico), para o cliente
  // saber que precisa verificar antes de decidir.
  describe("idempotência (chave/hash propagados; gravação incerta tratada à parte de erro definitivo)", () => {
    it("propaga chaveIdempotencia do payload e o hashSolicitacao calculado para persistir", async () => {
      const deps = depsBase();
      await orquestrarAprovacaoCenarioComercial(payload({ chaveIdempotencia: "22222222-2222-2222-2222-222222222222" }), deps);

      expect(deps.persistir).toHaveBeenCalledWith(
        expect.objectContaining({
          chaveIdempotencia: "22222222-2222-2222-2222-222222222222",
          hashSolicitacao: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      );
    });

    it("persistir devolve gravacaoIncerta=true: motivo='gravacao_incerta', nunca 'erro' genérico", async () => {
      const deps = depsBase({
        persistir: vi.fn().mockResolvedValue({ cenarioComercialAprovadoId: null, erro: "fetch failed", gravacaoIncerta: true }),
      });

      const resultado = await orquestrarAprovacaoCenarioComercial(payload(), deps);

      expect(resultado).toEqual({ ok: false, motivo: "gravacao_incerta" });
    });
  });
});
