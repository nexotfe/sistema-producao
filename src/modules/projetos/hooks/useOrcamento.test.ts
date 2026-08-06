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
