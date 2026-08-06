/* @vitest-environment jsdom */
// Cobre as 3 propriedades pedidas para a correcao do
// react-hooks/set-state-in-effect no Resumo Operacional de
// useProjeto.ts: nenhuma consulta duplicada do resumo para a mesma
// chave (projetoId|status|tipoProjeto - a segunda useEffect e' a
// unica proprietaria da busca, a primeira nao busca mais o resumo),
// resumo antigo oculto imediatamente na troca de projeto/status (sem
// esperar o efeito rodar), e resposta antiga descartada quando uma
// chave mais nova assume antes dela terminar.
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
import { useProjeto } from "./useProjeto";

type Resultado = { data: unknown; error: unknown; count?: number | null };

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

function criarFakeQuery(resultado: Resultado | Promise<Resultado>) {
  const promessa = Promise.resolve(resultado);
  const builder: unknown = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    order: () => builder,
    single: () => promessa,
    maybeSingle: () => promessa,
    then: (
      onResolve: (r: Resultado) => void,
      onReject?: (e: unknown) => void,
    ) => promessa.then(onResolve, onReject),
  };
  return builder;
}

function projetoRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    numero_projeto: "999999",
    nome: `Projeto ${id}`,
    tipo_projeto: "fabricacao",
    status: "aprovado",
    cliente_id: null,
    data_objetivo: null,
    observacoes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    pedido_compra_cliente: null,
    documento_cliente: null,
    contato_comercial_nome: null,
    contato_comercial_email: null,
    contato_comercial_telefone: null,
    contato_comercial_setor: null,
    contato_tecnico_nome: null,
    contato_tecnico_email: null,
    contato_tecnico_telefone: null,
    contato_tecnico_setor: null,
    contato_tecnico_2_nome: null,
    contato_tecnico_2_email: null,
    contato_tecnico_2_telefone: null,
    contato_tecnico_2_setor: null,
    ...overrides,
  };
}

// respostaProjeto decide, por id, o que a query em "projetos" devolve.
// onOrdensFabricacao e' chamado a cada consulta do Resumo Operacional
// (unica tabela exclusiva dessa busca em useProjeto.ts) - usado para
// contar quantas vezes o resumo foi realmente buscado.
function configurarMock(opts: {
  respostaProjeto: (id: string | undefined) => Resultado | Promise<Resultado>;
  onOrdensFabricacao?: () => Resultado | Promise<Resultado>;
}) {
  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
  });
  supabaseMock.rpc.mockResolvedValue({ data: [], error: null });

  supabaseMock.from.mockImplementation((tabela: string) => {
    if (tabela === "usuarios") {
      return criarFakeQuery({ data: { nome: "Fulano" }, error: null });
    }

    if (tabela === "projetos") {
      let idFiltrado: string | undefined;
      const builder: unknown = {
        select: () => builder,
        eq: (_coluna: string, valor: string) => {
          idFiltrado = valor;
          return builder;
        },
        is: () => builder,
        single: () => Promise.resolve(opts.respostaProjeto(idFiltrado)),
      };
      return builder;
    }

    if (tabela === "projeto_itens") {
      return criarFakeQuery({ data: [], error: null });
    }

    if (tabela === "ordens_fabricacao") {
      const resultado = opts.onOrdensFabricacao
        ? opts.onOrdensFabricacao()
        : { data: null, error: null, count: 0 };
      return criarFakeQuery(resultado);
    }

    return criarFakeQuery({ data: null, error: null });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("useProjeto - Resumo Operacional", () => {
  it("nao consulta o resumo duas vezes para a mesma chave (primeira useEffect nao busca mais)", async () => {
    const contarConsultas = vi.fn(() => ({
      data: null,
      error: null,
      count: 0,
    }));
    configurarMock({
      respostaProjeto: (id) => ({ data: projetoRow(id as string), error: null }),
      onOrdensFabricacao: contarConsultas,
    });

    const { result } = renderHook(() => useProjeto("projeto-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() =>
      expect(result.current.resumoOperacional).not.toBeNull(),
    );

    expect(contarConsultas).toHaveBeenCalledTimes(1);
  });

  it("resumo antigo fica oculto imediatamente quando o status deixa de ser aprovado", async () => {
    configurarMock({
      respostaProjeto: (id) => ({ data: projetoRow(id as string), error: null }),
    });

    const { result } = renderHook(() => useProjeto("projeto-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() =>
      expect(result.current.resumoOperacional).not.toBeNull(),
    );

    act(() => {
      result.current.setStatus("em_analise");
    });

    // Precisa ficar null no MESMO ciclo de render em que o status
    // muda - derivado, sem esperar o efeito.
    expect(result.current.resumoOperacional).toBeNull();
  });

  it("resposta antiga do resumo e' descartada quando uma chave mais nova assume antes dela terminar", async () => {
    const deferidos: ReturnType<typeof criarDeferido<Resultado>>[] = [];

    configurarMock({
      respostaProjeto: (id) => ({ data: projetoRow(id as string), error: null }),
      onOrdensFabricacao: () => {
        const deferido = criarDeferido<Resultado>();
        deferidos.push(deferido);
        return deferido.promise;
      },
    });

    const { result } = renderHook(() => useProjeto("projeto-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Primeira busca do resumo (chave A) ainda pendente - troca de
    // tipoProjeto muda a chave antes dela terminar.
    await waitFor(() => expect(deferidos.length).toBe(1));

    act(() => {
      result.current.setTipoProjeto("industrializacao");
    });

    await waitFor(() => expect(deferidos.length).toBe(2));

    // A chave nova (industrializacao) responde primeiro.
    deferidos[1].resolve({
      data: null,
      error: null,
      count: 3,
    });
    await waitFor(() =>
      expect(result.current.resumoOperacional?.numOfs).toBe(3),
    );

    // A resposta antiga (chave A, fabricacao) chega depois - nao pode
    // sobrescrever o resultado da chave atual.
    await act(async () => {
      deferidos[0].resolve({ data: null, error: null, count: 99 });
      await Promise.resolve();
    });

    expect(result.current.resumoOperacional?.numOfs).toBe(3);
  });
});
