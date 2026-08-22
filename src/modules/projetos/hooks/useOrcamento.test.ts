/* @vitest-environment jsdom */
// Cobre as 5 propriedades de estado exigidas para o fetch-on-mount de
// useOrcamento (a unica das seis correcoes de lint desta entrega com
// chave real, idProjeto, que pode mudar durante a vida do componente):
// montagem comeca carregando, erro encerra o carregamento sem deixar
// dado de outro projeto visivel, troca de chave volta a carregar,
// recarga manual (apos mutacao) tambem passa por loading=true, e uma
// resposta atrasada de uma chave antiga nunca sobrescreve uma resposta
// mais nova. Usa jsdom + @testing-library/react so' neste arquivo (via
// diretiva por-arquivo) - o ambiente global do projeto continua "node"
// para nao afetar os demais testes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
    rpc: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabaseClient";
import { useOrcamento } from "./useOrcamento";

type Resultado = { data: unknown; error: unknown };

const supabaseMock = supabase as unknown as {
  from: ReturnType<typeof vi.fn>;
  auth: { getUser: ReturnType<typeof vi.fn> };
  rpc: ReturnType<typeof vi.fn>;
};

function criarDeferido<T>() {
  let resolve!: (valor: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// Builder generico e "thenable": qualquer metodo de encadeamento
// devolve o proprio builder; metodos terminais e o await direto da
// cadeia resolvem para o resultado configurado.
function criarFakeQuery(resultado: Resultado | Promise<Resultado>) {
  const promessa = Promise.resolve(resultado);
  const builder: unknown = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    order: () => builder,
    in: () => builder,
    not: () => builder,
    update: () => builder,
    insert: () => builder,
    maybeSingle: () => promessa,
    single: () => promessa,
    then: (onResolve: (r: Resultado) => void, onReject?: (e: unknown) => void) =>
      promessa.then(onResolve, onReject),
  };
  return builder;
}

const VAZIO: Resultado = { data: null, error: null };
const LISTA_VAZIA: Resultado = { data: [], error: null };

function projetoRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    numero_projeto: "999999",
    nome: `Projeto ${id}`,
    tipo_projeto: "fabricacao",
    status: "rascunho",
    cliente_id: null,
    data_objetivo: null,
    created_at: "2026-01-01T00:00:00.000Z",
    margem_lucro_percent: 20,
    carga_tributaria_percent: null,
    desconto_percentual: null,
    desconto_motivo: null,
    ...overrides,
  };
}

// respostaProjeto decide, por id, o que a query em "projetos" devolve
// (pode ser sincrona ou uma Promise controlada externamente - usado
// para simular respostas atrasadas nos testes de corrida).
function configurarMock(
  respostaProjeto: (id: string | undefined) => Resultado | Promise<Resultado>,
  respostaCenarioAprovado: Resultado = VAZIO,
) {
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
  supabaseMock.rpc.mockResolvedValue({
    data: { estado: "calculado", mensagem: null, recursos: [], itens: [] },
    error: null,
  });

  supabaseMock.from.mockImplementation((tabela: string) => {
    if (tabela === "projetos") {
      let idFiltrado: string | undefined;
      const builder: unknown = {
        select: () => builder,
        eq: (_coluna: string, valor: string) => {
          idFiltrado = valor;
          return builder;
        },
        is: () => builder,
        maybeSingle: () => Promise.resolve(respostaProjeto(idFiltrado)),
      };
      return builder;
    }

    if (tabela === "projeto_itens") {
      return criarFakeQuery(LISTA_VAZIA);
    }

    if (tabela === "cenarios_comerciais_aprovados") {
      return criarFakeQuery(respostaCenarioAprovado);
    }

    return criarFakeQuery(VAZIO);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("useOrcamento", () => {
  it("comeca carregando ao montar com um projeto valido e conclui sem erro", async () => {
    configurarMock((id) => ({ data: projetoRow(id as string), error: null }));

    const { result } = renderHook(() => useOrcamento("projeto-a"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.numeroProjeto).toBe("999999");
    expect(result.current.erro).toBeNull();
  });

  it("projeto nao encontrado: erro fica visivel, loading encerra e nenhum dado falso aparece", async () => {
    configurarMock(() => ({ data: null, error: null }));

    const { result } = renderHook(() => useOrcamento("projeto-inexistente"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.erro).toBe("Projeto não encontrado.");
    expect(result.current.numeroProjeto).toBeNull();
    expect(result.current.nomeProjeto).toBe("");
  });

  it("idProjeto=null representa 'sem projeto': nunca erro, nunca preso em loading", () => {
    configurarMock((id) => ({ data: projetoRow(id as string), error: null }));

    const { result } = renderHook(() => useOrcamento(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.erro).toBeNull();
    expect(result.current.numeroProjeto).toBeNull();
  });

  it("dados de um projeto anterior nao reaparecem quando o novo projeto falha ao carregar", async () => {
    let falhaAtiva = false;
    configurarMock((id) => {
      if (falhaAtiva) return { data: null, error: null };
      return { data: projetoRow(id as string), error: null };
    });

    const { result, rerender } = renderHook(({ id }) => useOrcamento(id), {
      initialProps: { id: "projeto-a" as string | null },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.numeroProjeto).toBe("999999");

    falhaAtiva = true;
    rerender({ id: "projeto-b" });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.erro).toBe("Projeto não encontrado.");
    expect(result.current.numeroProjeto).toBeNull();
    expect(result.current.nomeProjeto).toBe("");
  });

  it("troca de chave: ao mudar idProjeto volta para loading=true e depois reflete o novo projeto", async () => {
    configurarMock((id) => ({
      data: projetoRow(id as string, {
        numero_projeto: id === "projeto-a" ? "111111" : "222222",
      }),
      error: null,
    }));

    const { result, rerender } = renderHook(({ id }) => useOrcamento(id), {
      initialProps: { id: "projeto-a" },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.numeroProjeto).toBe("111111");

    rerender({ id: "projeto-b" });
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.numeroProjeto).toBe("222222");
  });

  it("resposta obsoleta: uma resposta atrasada do projeto anterior nunca sobrescreve o projeto atual", async () => {
    const deferidoA = criarDeferido<Resultado>();

    configurarMock((id) => {
      if (id === "projeto-a") return deferidoA.promise;
      return { data: projetoRow(id as string, { numero_projeto: "222222" }), error: null };
    });

    const { result, rerender } = renderHook(({ id }) => useOrcamento(id), {
      initialProps: { id: "projeto-a" },
    });

    expect(result.current.loading).toBe(true);

    rerender({ id: "projeto-b" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.numeroProjeto).toBe("222222");

    deferidoA.resolve({
      data: projetoRow("projeto-a", { numero_projeto: "111111" }),
      error: null,
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(result.current.numeroProjeto).toBe("222222");
    expect(result.current.loading).toBe(false);
  });

  it("recarga manual (apos editarQuantidadeItem) tambem passa por loading=true ate concluir", async () => {
    const deferidoUpdate = criarDeferido<Resultado>();
    const deferidoRecarga = criarDeferido<Resultado>();
    let chamadasItens = 0;
    let chamadasProjetos = 0;

    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    supabaseMock.rpc.mockResolvedValue({
      data: { estado: "calculado", mensagem: null, recursos: [], itens: [] },
      error: null,
    });

    supabaseMock.from.mockImplementation((tabela: string) => {
      if (tabela === "projetos") {
        chamadasProjetos += 1;
        // 1a chamada: carga inicial (resolve na hora). 2a chamada: a
        // recarga apos a mutacao - atrasada de proposito para
        // observar loading=true ate ela terminar.
        if (chamadasProjetos === 2) {
          return criarFakeQuery(deferidoRecarga.promise);
        }
        return criarFakeQuery({ data: projetoRow("projeto-a"), error: null });
      }

      if (tabela === "projeto_itens") {
        chamadasItens += 1;
        // 1a chamada: select() da lista de itens na carga inicial.
        // 2a chamada: update() disparado por editarQuantidadeItem -
        // tambem atrasada, para separar claramente "mutacao em curso"
        // de "recarga em curso" nas asserções abaixo.
        if (chamadasItens === 2) {
          return criarFakeQuery(deferidoUpdate.promise);
        }
        return criarFakeQuery(LISTA_VAZIA);
      }

      return criarFakeQuery(VAZIO);
    });

    const { result } = renderHook(() => useOrcamento("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      void result.current.editarQuantidadeItem("item-1", 5);
    });

    // O update ainda nao respondeu - a recarga (e o loading=true dela)
    // so' comeca depois que ele terminar.
    expect(result.current.loading).toBe(false);

    await act(async () => {
      deferidoUpdate.resolve({ data: null, error: null });
      // Drena a cadeia ate o await da recarga (buscarDadosOrcamento)
      // ficar pendente no deferidoRecarga.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      deferidoRecarga.resolve({ data: projetoRow("projeto-a"), error: null });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.erro).toBeNull();
  });

  it("recargas manuais concorrentes: a mais antiga nunca sobrescreve a mais recente", async () => {
    const respostas: Resultado[] = [
      { data: projetoRow("projeto-a", { numero_projeto: "111111" }), error: null },
      { data: projetoRow("projeto-a", { numero_projeto: "222222" }), error: null },
      { data: projetoRow("projeto-a", { numero_projeto: "333333" }), error: null },
    ];
    let chamada = 0;
    const deferidos: ReturnType<typeof criarDeferido<Resultado>>[] = [];

    configurarMock(() => {
      const deferido = criarDeferido<Resultado>();
      deferidos.push(deferido);
      chamada += 1;
      return deferido.promise;
    });

    const { result } = renderHook(() => useOrcamento("projeto-a"));

    // Resolve a carga inicial (chamada 1).
    deferidos[0].resolve(respostas[0]);
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Duas recargas manuais disparadas em sequencia, sem aguardar a
    // primeira: chamadas 2 (antiga) e 3 (recente).
    act(() => {
      void result.current.editarQuantidadeItem("item-1", 1);
    });
    await waitFor(() => expect(chamada).toBe(2));

    act(() => {
      void result.current.editarQuantidadeItem("item-1", 2);
    });
    await waitFor(() => expect(chamada).toBe(3));

    // A recarga recente (3) responde primeiro; a antiga (2) responde
    // depois - seu resultado deve ser descartado.
    deferidos[2].resolve(respostas[2]);
    await waitFor(() => expect(result.current.numeroProjeto).toBe("333333"));

    deferidos[1].resolve(respostas[1]);
    await new Promise((r) => setTimeout(r, 0));

    expect(result.current.numeroProjeto).toBe("333333");
  });

  it("nenhuma mutacao e' possivel enquanto os dados pertencem a outra chave, e volta a funcionar apos o sucesso da nova chave", async () => {
    const deferidoB = criarDeferido<Resultado>();
    const updateChamado = vi.fn();

    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    supabaseMock.rpc.mockResolvedValue({
      data: { estado: "calculado", mensagem: null, recursos: [], itens: [] },
      error: null,
    });

    supabaseMock.from.mockImplementation((tabela: string) => {
      if (tabela === "projetos") {
        let idFiltrado: string | undefined;
        const builder: unknown = {
          select: () => builder,
          eq: (_coluna: string, valor: string) => {
            idFiltrado = valor;
            return builder;
          },
          is: () => builder,
          maybeSingle: () =>
            idFiltrado === "projeto-a"
              ? Promise.resolve({ data: projetoRow("projeto-a"), error: null })
              : deferidoB.promise,
        };
        return builder;
      }

      if (tabela === "projeto_itens") {
        const builder: unknown = {
          select: () => builder,
          eq: () => builder,
          is: () => builder,
          order: () => builder,
          update: (payload: unknown) => {
            updateChamado(payload);
            return builder;
          },
          then: (onResolve: (r: Resultado) => void) =>
            Promise.resolve(LISTA_VAZIA).then(onResolve),
        };
        return builder;
      }

      return criarFakeQuery(VAZIO);
    });

    const { result, rerender } = renderHook(({ id }) => useOrcamento(id), {
      initialProps: { id: "projeto-a" },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.numeroProjeto).toBe("999999");

    // Troca para projeto-b, cuja busca fica pendente (deferidoB) - os
    // dados brutos ainda pertencem ao projeto-a nesse intervalo.
    rerender({ id: "projeto-b" });
    await waitFor(() => expect(result.current.loading).toBe(true));

    const resultadoBloqueado = await act(() =>
      result.current.editarQuantidadeItem("item-1", 5),
    );

    expect(resultadoBloqueado).toEqual({
      status: "erro",
      mensagem: "Projeto não encontrado.",
    });
    expect(updateChamado).not.toHaveBeenCalled();

    // projeto-b termina de carregar - a partir daqui, a mutacao usa a
    // chave atual (projeto-b) e deve funcionar normalmente.
    await act(async () => {
      deferidoB.resolve({ data: projetoRow("projeto-b"), error: null });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.numeroProjeto).toBe("999999");

    const resultadoOk = await act(() =>
      result.current.editarQuantidadeItem("item-1", 5),
    );

    expect(resultadoOk).toEqual({ status: "ok" });
    expect(updateChamado).toHaveBeenCalledWith({ quantidade: 5 });
  });
});

// =====================================================================
// Caracterização do CÁLCULO (buscarDadosOrcamento + resumoOrcamento) -
// referência escrita ANTES da extração de buscarDadosOrcamento/
// calcularValorComercialProjeto para um lib compartilhado (consumido
// também pela tela de Cenários, DEC-007 §6.2). Cobre exatamente o que o
// usuário pediu para preservar: consultas, filtros, fallback tributário,
// arredondamento (nenhum arredondamento manual - números crus), mensagens
// de erro e quantidade de acessos ao banco. Estes testes precisam
// continuar passando SEM NENHUMA MUDANÇA depois da extração - qualquer
// alteração de resultado aqui é uma regressão de comportamento.
// =====================================================================
describe("useOrcamento - caracterização do cálculo (referência para a extração compartilhada)", () => {
  type ItemRow = {
    id: string;
    produto_id: string;
    pn: string;
    descricao: string;
    revisao: string | null;
    quantidade: number;
    custo_congelado: number | null;
  };
  type BomRow = { id: string; status: string; created_at: string; produto_id: string };

  function configurarMockCompleto(params: {
    projeto?: Record<string, unknown>;
    itens: ItemRow[];
    boms: BomRow[];
    configuracaoCargaTributaria?: Record<string, number> | null;
    custoBomPorId?: Record<string, { categoria: string; valor: number }[]>;
  }) {
    const chamadasRpc: { nome: string; args: unknown }[] = [];
    const chamadasBoms: string[] = []; // produto_id consultado, em ordem

    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });

    supabaseMock.rpc.mockImplementation((nome: string, args: unknown) => {
      chamadasRpc.push({ nome, args });
      if (nome === "calcular_resumo_produtivo_projeto") {
        return Promise.resolve({
          data: { estado: "calculado", mensagem: null, recursos: [], itens: [] },
          error: null,
        });
      }
      if (nome === "calcular_custo_bom") {
        const bomId = (args as { p_bom_id: string }).p_bom_id;
        return Promise.resolve({ data: params.custoBomPorId?.[bomId] ?? [], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    supabaseMock.from.mockImplementation((tabela: string) => {
      if (tabela === "projetos") {
        return criarFakeQuery({ data: projetoRow("projeto-a", params.projeto ?? {}), error: null });
      }
      if (tabela === "projeto_itens") {
        return criarFakeQuery({ data: params.itens, error: null });
      }
      if (tabela === "boms") {
        const builder: unknown = {
          select: () => builder,
          eq: (_coluna: string, produtoId: string) => {
            chamadasBoms.push(produtoId);
            return builder;
          },
          is: () => builder,
          order: () =>
            Promise.resolve({
              data: params.boms.filter((b) => b.produto_id === chamadasBoms[chamadasBoms.length - 1]),
              error: null,
            }),
        };
        return builder;
      }
      if (tabela === "configuracoes_empresa") {
        return criarFakeQuery({
          data:
            params.configuracaoCargaTributaria === null || params.configuracaoCargaTributaria === undefined
              ? null
              : { valor: params.configuracaoCargaTributaria },
          error: null,
        });
      }
      return criarFakeQuery(VAZIO);
    });

    return { chamadasRpc, chamadasBoms };
  }

  it("item com custo_congelado usa o valor congelado diretamente - nunca chama calcular_custo_bom para ele", async () => {
    const { chamadasRpc } = configurarMockCompleto({
      itens: [
        { id: "item-1", produto_id: "produto-1", pn: "PN-1", descricao: "Item 1", revisao: null, quantidade: 2, custo_congelado: 100 },
      ],
      boms: [],
    });

    const { result } = renderHook(() => useOrcamento("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.itens).toHaveLength(1);
    expect(result.current.itens[0].custo).toBe(200); // 100 (congelado) * 2
    expect(result.current.itens[0].custoCongelado).toBe(true);
    expect(chamadasRpc.some((c) => c.nome === "calcular_custo_bom")).toBe(false);
  });

  it("item sem custo_congelado busca o BOM ativo mais recente e chama calcular_custo_bom com p_bom_id/p_excluir_materia_prima corretos", async () => {
    const { chamadasRpc } = configurarMockCompleto({
      projeto: { tipo_projeto: "fabricacao" },
      itens: [
        { id: "item-2", produto_id: "produto-2", pn: "PN-2", descricao: "Item 2", revisao: null, quantidade: 3, custo_congelado: null },
      ],
      boms: [
        { id: "bom-antigo", status: "obsoleto", created_at: "2025-01-01T00:00:00.000Z", produto_id: "produto-2" },
        { id: "bom-ativo", status: "ativo", created_at: "2025-06-01T00:00:00.000Z", produto_id: "produto-2" },
      ],
      custoBomPorId: { "bom-ativo": [{ categoria: "total", valor: 50 }] },
    });

    const { result } = renderHook(() => useOrcamento("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.itens[0].custo).toBe(150); // 50 (RPC) * 3
    expect(result.current.itens[0].custoCongelado).toBe(false);
    const chamada = chamadasRpc.find((c) => c.nome === "calcular_custo_bom");
    expect(chamada?.args).toEqual({ p_bom_id: "bom-ativo", p_excluir_materia_prima: false }); // fabricacao -> nunca exclui matéria-prima
  });

  it("tipo_projeto='industrializacao' chama calcular_custo_bom com p_excluir_materia_prima=true", async () => {
    const { chamadasRpc } = configurarMockCompleto({
      projeto: { tipo_projeto: "industrializacao" },
      itens: [
        { id: "item-3", produto_id: "produto-3", pn: "PN-3", descricao: "Item 3", revisao: null, quantidade: 1, custo_congelado: null },
      ],
      boms: [{ id: "bom-3", status: "ativo", created_at: "2025-01-01T00:00:00.000Z", produto_id: "produto-3" }],
      custoBomPorId: { "bom-3": [{ categoria: "total", valor: 10 }] },
    });

    const { result } = renderHook(() => useOrcamento("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const chamada = chamadasRpc.find((c) => c.nome === "calcular_custo_bom");
    expect(chamada?.args).toEqual({ p_bom_id: "bom-3", p_excluir_materia_prima: true });
  });

  it("nenhum BOM para o produto -> custo 0, nenhuma chamada a calcular_custo_bom", async () => {
    const { chamadasRpc } = configurarMockCompleto({
      itens: [
        { id: "item-4", produto_id: "produto-4", pn: "PN-4", descricao: "Item 4", revisao: null, quantidade: 5, custo_congelado: null },
      ],
      boms: [],
    });

    const { result } = renderHook(() => useOrcamento("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.itens[0].custo).toBe(0);
    expect(chamadasRpc.some((c) => c.nome === "calcular_custo_bom")).toBe(false);
  });

  it("carga tributária: usa carga_tributaria_percent do projeto quando presente, ignora a sugerida", async () => {
    configurarMockCompleto({
      projeto: { margem_lucro_percent: 20, carga_tributaria_percent: 15, tipo_projeto: "fabricacao" },
      itens: [
        { id: "item-5", produto_id: "p5", pn: "PN-5", descricao: "d", revisao: null, quantidade: 1, custo_congelado: 100 },
      ],
      boms: [],
      configuracaoCargaTributaria: { fabricacao: 999 }, // nunca deveria ser usado
    });

    const { result } = renderHook(() => useOrcamento("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.cargaTributariaEfetiva).toBe(15);
  });

  it("carga tributária: usa a sugerida (configuracoes_empresa, por tipo_projeto) quando o projeto não tem carga definida", async () => {
    configurarMockCompleto({
      projeto: { margem_lucro_percent: 20, carga_tributaria_percent: null, tipo_projeto: "fabricacao" },
      itens: [],
      boms: [],
      configuracaoCargaTributaria: { fabricacao: 10, industrializacao: 5 },
    });

    const { result } = renderHook(() => useOrcamento("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.cargaTributariaSugerida).toBe(10);
    expect(result.current.cargaTributariaEfetiva).toBe(10);
  });

  it("resumoOrcamento.custoTotal = soma exata dos custos de todos os itens (custo unitário × quantidade)", async () => {
    configurarMockCompleto({
      itens: [
        { id: "item-6", produto_id: "p6", pn: "PN-6", descricao: "d", revisao: null, quantidade: 2, custo_congelado: 100 },
        { id: "item-7", produto_id: "p7", pn: "PN-7", descricao: "d", revisao: null, quantidade: 3, custo_congelado: 50 },
      ],
      boms: [],
    });

    const { result } = renderHook(() => useOrcamento("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.resumoOrcamento.custoTotal).toBe(350); // 200 + 150
  });

  it("resumoOrcamento.valorComercial aplica a fórmula do DEC-001 (margem por fora, carga por dentro, desconto por cima) - valor exato conferido", async () => {
    configurarMockCompleto({
      projeto: { margem_lucro_percent: 20, carga_tributaria_percent: null, tipo_projeto: "fabricacao", desconto_percentual: 5 },
      itens: [
        { id: "item-8", produto_id: "p8", pn: "PN-8", descricao: "d", revisao: null, quantidade: 2, custo_congelado: 100 },
        { id: "item-9", produto_id: "p9", pn: "PN-9", descricao: "d", revisao: null, quantidade: 3, custo_congelado: 50 },
      ],
      boms: [],
      configuracaoCargaTributaria: { fabricacao: 10 },
    });

    const { result } = renderHook(() => useOrcamento("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // custoTotal=350; lucro=350*0.20=70; subtotal=420; carga=0.10;
    // valorTecnico=420/0.90=466.666...; desconto=466.666...*0.05=23.333...;
    // valorComercial=466.666...-23.333...=443.333...
    expect(result.current.resumoOrcamento.custoTotal).toBe(350);
    expect(result.current.resumoOrcamento.valorTecnico).toBeCloseTo(466.6666667, 5);
    expect(result.current.resumoOrcamento.valorComercial).toBeCloseTo(443.3333333, 5);
  });

  it("quantidade de acessos ao banco: 1 select em boms + 1 rpc calcular_custo_bom por item SEM custo_congelado; 0 chamadas extras para item COM custo_congelado", async () => {
    const { chamadasRpc, chamadasBoms } = configurarMockCompleto({
      itens: [
        { id: "item-10", produto_id: "p10", pn: "PN-10", descricao: "d", revisao: null, quantidade: 1, custo_congelado: 100 }, // congelado
        { id: "item-11", produto_id: "p11", pn: "PN-11", descricao: "d", revisao: null, quantidade: 1, custo_congelado: null }, // não congelado
      ],
      boms: [{ id: "bom-11", status: "ativo", created_at: "2025-01-01T00:00:00.000Z", produto_id: "p11" }],
      custoBomPorId: { "bom-11": [{ categoria: "total", valor: 20 }] },
    });

    const { result } = renderHook(() => useOrcamento("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // boms é consultado para OS DOIS itens (para saber se temEstrutura),
    // mas calcular_custo_bom só é chamado para o item sem custo_congelado.
    expect(chamadasBoms).toEqual(["p10", "p11"]);
    expect(chamadasRpc.filter((c) => c.nome === "calcular_custo_bom")).toHaveLength(1);
  });

  it("projeto não encontrado: mesma mensagem de erro exata de antes da extração", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
    supabaseMock.from.mockImplementation((tabela: string) => {
      if (tabela === "projetos") return criarFakeQuery({ data: null, error: null });
      return criarFakeQuery(VAZIO);
    });

    const { result } = renderHook(() => useOrcamento("projeto-inexistente"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.erro).toBe("Projeto não encontrado.");
  });

  it("sem cenário comercial aprovado: comportamento idêntico ao anterior (custoTotal vem da soma de itens)", async () => {
    configurarMock((id) => ({ data: projetoRow(id as string), error: null }));

    const { result } = renderHook(() => useOrcamento("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.cenarioComercialAprovado).toBeNull();
    expect(result.current.resumoOrcamento.custoTotal).toBe(0); // projeto_itens mockado vazio neste helper
    expect(result.current.resumoOrcamento.custoTotalItens).toBe(0);
    expect(result.current.resumoOrcamento.ajusteComercial).toBe(0);
  });

  it("com cenário comercial aprovado vigente: resumoOrcamento usa novoCustoTecnico como valor-base, nunca a soma bruta de itens", async () => {
    configurarMock(
      (id) => ({ data: projetoRow(id as string), error: null }),
      {
        data: {
          id: "cenario-1",
          tipo_cenario: "ajustado",
          data_solicitada_cliente: "2026-09-01",
          prazo_proposto: "2026-09-15",
          diferenca_em_dias: 14,
          custo_tecnico_atual: 50000,
          custo_adicional_total: 5000,
          novo_custo_tecnico: 55000,
          aprovado_em: "2026-08-18T10:00:00Z",
        },
        error: null,
      },
    );

    const { result } = renderHook(() => useOrcamento("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.cenarioComercialAprovado).toEqual({
      id: "cenario-1",
      tipoCenario: "ajustado",
      dataSolicitadaCliente: "2026-09-01",
      prazoProposto: "2026-09-15",
      diferencaEmDias: 14,
      custoTecnicoAtual: 50000,
      custoAdicionalTotal: 5000,
      novoCustoTecnico: 55000,
      aprovadoEm: "2026-08-18T10:00:00Z",
    });
    // custoTotal (soma de itens) é 0 neste helper - se o resumo ainda
    // usasse a soma bruta, custoTotal seria 0, não 55000.
    expect(result.current.resumoOrcamento.custoTotal).toBe(55000);
    // Correção (2026-08-22): a composição fica visível na tela interna -
    // custoTotalItens é a soma ao vivo (0 aqui), ajusteComercial é a
    // diferença derivada (custoTotal - custoTotalItens), nunca
    // custoAdicionalTotal do snapshot direto (evita os três números não
    // baterem entre si se o custo ao vivo tiver mudado desde a
    // aprovação do cenário).
    expect(result.current.resumoOrcamento.custoTotalItens).toBe(0);
    expect(result.current.resumoOrcamento.ajusteComercial).toBe(55000);
  });

  it("com cenário aprovado E itens reais: Custo dos itens + Ajuste comercial somam exatamente o Custo/valor técnico após o cenário", async () => {
    configurarMockCompleto({
      itens: [
        { id: "item-1", produto_id: "produto-1", pn: "PN-1", descricao: "Item 1", revisao: null, quantidade: 1, custo_congelado: 3975 },
      ],
      boms: [],
    });
    // configurarMockCompleto não cobre cenarios_comerciais_aprovados -
    // sobrepõe só essa tabela, preservando o resto do mock já montado.
    const fromOriginal = supabaseMock.from.getMockImplementation() as (tabela: string) => unknown;
    supabaseMock.from.mockImplementation((tabela: string) => {
      if (tabela === "cenarios_comerciais_aprovados") {
        return criarFakeQuery({
          data: {
            id: "cenario-1",
            tipo_cenario: "ajustado",
            data_solicitada_cliente: "2026-09-01",
            prazo_proposto: "2026-09-15",
            diferenca_em_dias: 14,
            custo_tecnico_atual: 3975,
            custo_adicional_total: 945,
            novo_custo_tecnico: 4920,
            aprovado_em: "2026-08-18T10:00:00Z",
          },
          error: null,
        });
      }
      return fromOriginal(tabela);
    });

    const { result } = renderHook(() => useOrcamento("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.resumoOrcamento.custoTotalItens).toBe(3975);
    expect(result.current.resumoOrcamento.ajusteComercial).toBe(945);
    expect(result.current.resumoOrcamento.custoTotal).toBe(4920);
    expect(
      result.current.resumoOrcamento.custoTotalItens + result.current.resumoOrcamento.ajusteComercial,
    ).toBe(result.current.resumoOrcamento.custoTotal);
  });
});
