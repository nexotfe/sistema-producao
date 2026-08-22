/* @vitest-environment jsdom */
// Cobertura de useProposta.ts. Revisão (2026-08-22, consolidação
// pedida pelo usuário): o hook passou a reutilizar buscarDadosOrcamento
// (MESMA fonte do Orçamento) para responsável/cliente/itens com
// custo/carga tributária sugerida - antes essa lógica (preferir
// custo_congelado, senão BOM ativo mais recente + calcular_custo_bom)
// estava DUPLICADA aqui e em buscarDadosOrcamento.ts. O mock abaixo
// segue o mesmo esqueleto já provado em useOrcamento.test.ts (mesma
// função por trás), adaptado para os 2 pontos que só a Proposta
// consulta por conta própria: contato_comercial_nome/proposta_revisao/
// proposta_consideracoes (projetos) e codigo_ncm (itens_industriais,
// por item).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
    rpc: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabaseClient";
import { useProposta } from "./useProposta";

type Resultado = { data: unknown; error: unknown };

const supabaseMock = supabase as unknown as {
  from: ReturnType<typeof vi.fn>;
  auth: { getUser: ReturnType<typeof vi.fn> };
  rpc: ReturnType<typeof vi.fn>;
};

const VAZIO: Resultado = { data: null, error: null };

function criarFakeQuery(resultado: Resultado) {
  const promessa = Promise.resolve(resultado);
  const builder: unknown = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    order: () => builder,
    maybeSingle: () => promessa,
    single: () => promessa,
    then: (onResolve: (r: Resultado) => void, onReject?: (e: unknown) => void) => promessa.then(onResolve, onReject),
  };
  return builder;
}

function projetoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "projeto-a",
    numero_projeto: "999999",
    nome: "Projeto Teste",
    tipo_projeto: "fabricacao",
    status: "rascunho",
    cliente_id: null,
    data_objetivo: null,
    margem_lucro_percent: 20,
    carga_tributaria_percent: 10,
    desconto_percentual: null,
    desconto_motivo: null,
    contato_comercial_nome: null,
    created_at: "2026-01-01T00:00:00.000Z",
    proposta_revisao: "A",
    proposta_consideracoes: null,
    ...overrides,
  };
}

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

// Mesmo esqueleto de useOrcamento.test.ts (buscarDadosOrcamento é a
// MESMA função por trás dos dois hooks agora) - cobre a sequência real
// de chamadas: projetos -> auth.getUser -> usuarios -> clientes ->
// projeto_itens -> [por item: boms + rpc calcular_custo_bom] -> rpc
// calcular_resumo_produtivo_projeto -> (Proposta) projetos de novo
// (campos próprios) -> cenarios_comerciais_aprovados -> itens_industriais
// por item (NCM).
function configurarMock(params: {
  projeto?: Record<string, unknown>;
  itens: ItemRow[];
  boms?: BomRow[];
  custoBomPorId?: Record<string, { categoria: string; valor: number }[]>;
  ncmPorProduto?: Record<string, string | null>;
  respostaCenarioAprovado?: Resultado;
}) {
  const chamadasBoms: string[] = [];

  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });

  supabaseMock.rpc.mockImplementation((nome: string, args: unknown) => {
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
      return criarFakeQuery({ data: projetoRow(params.projeto ?? {}), error: null });
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
            data: (params.boms ?? []).filter((b) => b.produto_id === chamadasBoms[chamadasBoms.length - 1]),
            error: null,
          }),
      };
      return builder;
    }
    if (tabela === "itens_industriais") {
      const builder: unknown = {
        select: () => builder,
        eq: (_coluna: string, produtoId: string) =>
          criarFakeQuery({ data: { codigo_ncm: params.ncmPorProduto?.[produtoId] ?? null }, error: null }),
      };
      return builder;
    }
    if (tabela === "cenarios_comerciais_aprovados") {
      return criarFakeQuery(params.respostaCenarioAprovado ?? VAZIO);
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

describe("useProposta - fonte de custo consolidada com o Orçamento", () => {
  it("sem cenário aprovado, sem itens: comportamento preservado - total 0", async () => {
    configurarMock({ itens: [] });

    const { result } = renderHook(() => useProposta("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.cenarioComercialAprovado).toBeNull();
    expect(result.current.valorTotalProposta).toBe(0);
    expect(result.current.ajusteComercial).toBeNull();
  });

  it("item com custo_congelado: usa o valor congelado (mesma fonte de buscarDadosOrcamento), valorUnitario e valorTotal batem com a fórmula de calcularResumoOrcamento", async () => {
    configurarMock({
      itens: [
        { id: "item-1", produto_id: "produto-1", pn: "PN-1", descricao: "Item 1", revisao: null, quantidade: 2, custo_congelado: 100 },
      ],
      ncmPorProduto: { "produto-1": "8479.90.90" },
    });

    const { result } = renderHook(() => useProposta("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // custo = 100 (congelado) * 2 = 200; margem=20%, carga=10%:
    // lucro=40; subtotal=240; valorTecnico=240/0.9=266.6666667 (sem desconto no item).
    expect(result.current.itens).toHaveLength(1);
    expect(result.current.itens[0].codigo).toBe("PN-1");
    expect(result.current.itens[0].ncm).toBe("8479.90.90");
    expect(result.current.itens[0].valorTotal).toBeCloseTo(266.6666667, 4);
    expect(result.current.itens[0].valorUnitario).toBeCloseTo(133.3333333, 4); // 266.6666667 / 2

    // Agregado (custoTotalSoma=200, sem desconto): mesma fórmula, uma única vez.
    expect(result.current.valorTecnicoProposta).toBeCloseTo(266.6666667, 4);
    expect(result.current.valorTotalProposta).toBeCloseTo(266.6666667, 4);
  });

  it("item sem custo_congelado: busca o BOM ativo mais recente e usa calcular_custo_bom - mesmo caminho de useOrcamento.ts", async () => {
    configurarMock({
      itens: [
        { id: "item-2", produto_id: "produto-2", pn: "PN-2", descricao: "Item 2", revisao: null, quantidade: 3, custo_congelado: null },
      ],
      boms: [
        { id: "bom-antigo", status: "obsoleto", created_at: "2025-01-01T00:00:00.000Z", produto_id: "produto-2" },
        { id: "bom-ativo", status: "ativo", created_at: "2025-06-01T00:00:00.000Z", produto_id: "produto-2" },
      ],
      custoBomPorId: { "bom-ativo": [{ categoria: "total", valor: 50 }] },
    });

    const { result } = renderHook(() => useProposta("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // custo = 50 (RPC, bom ativo) * 3 = 150; margem=20%, carga=10%:
    // lucro=30; subtotal=180; valorTecnico=180/0.9=200.
    expect(result.current.itens[0].valorTotal).toBeCloseTo(200, 4);
    expect(result.current.itens[0].valorUnitario).toBeCloseTo(66.6666667, 4); // 200 / 3
  });

  it("dois itens (um congelado, um via BOM+RPC): valorUnitario/valorTotal por item e o agregado batem com a mesma fórmula aplicada uma única vez sobre a soma - nada mudou ao consolidar a fonte", async () => {
    configurarMock({
      itens: [
        { id: "item-1", produto_id: "produto-1", pn: "PN-1", descricao: "Item 1", revisao: null, quantidade: 2, custo_congelado: 100 },
        { id: "item-2", produto_id: "produto-2", pn: "PN-2", descricao: "Item 2", revisao: null, quantidade: 3, custo_congelado: null },
      ],
      boms: [{ id: "bom-2", status: "ativo", created_at: "2025-01-01T00:00:00.000Z", produto_id: "produto-2" }],
      custoBomPorId: { "bom-2": [{ categoria: "total", valor: 50 }] },
    });

    const { result } = renderHook(() => useProposta("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.itens[0].valorTotal).toBeCloseTo(266.6666667, 4);
    expect(result.current.itens[1].valorTotal).toBeCloseTo(200, 4);

    // custoTotalSoma = 200 + 150 = 350; lucro=70; subtotal=420;
    // valorTecnico=420/0.9=466.6666667 - aplicado UMA VEZ sobre a soma,
    // nunca somando os valorTotal de cada item (arredondamento
    // diferente se fosse feito item a item).
    expect(result.current.valorTecnicoProposta).toBeCloseTo(466.6666667, 4);
    expect(result.current.valorTotalProposta).toBeCloseTo(466.6666667, 4);
  });

  it("carga_tributaria_percent nulo no projeto: usa a carga sugerida por tipo_projeto (mesmo fallback de buscarDadosOrcamento)", async () => {
    configurarMock({
      projeto: { carga_tributaria_percent: null, tipo_projeto: "fabricacao" },
      itens: [
        { id: "item-1", produto_id: "produto-1", pn: "PN-1", descricao: "Item 1", revisao: null, quantidade: 1, custo_congelado: 90 },
      ],
    });

    supabaseMock.from.mockImplementation((tabela: string) => {
      if (tabela === "projetos") {
        return criarFakeQuery({ data: projetoRow({ carga_tributaria_percent: null, tipo_projeto: "fabricacao" }), error: null });
      }
      if (tabela === "projeto_itens") {
        return criarFakeQuery({
          data: [{ id: "item-1", produto_id: "produto-1", pn: "PN-1", descricao: "Item 1", quantidade: 1, custo_congelado: 90 }],
          error: null,
        });
      }
      if (tabela === "configuracoes_empresa") {
        return criarFakeQuery({ data: { valor: { fabricacao: 15 } }, error: null });
      }
      return criarFakeQuery(VAZIO);
    });

    const { result } = renderHook(() => useProposta("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // custo=90; margem=20%, carga sugerida=15%: lucro=18; subtotal=108;
    // valorTecnico=108/0.85=127.0588235.
    expect(result.current.valorTotalProposta).toBeCloseTo(127.0588235, 4);
  });

  it("projeto não encontrado: mensagem de erro preservada", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
    supabaseMock.from.mockImplementation((tabela: string) => {
      if (tabela === "projetos") return criarFakeQuery({ data: null, error: null });
      return criarFakeQuery(VAZIO);
    });

    const { result } = renderHook(() => useProposta("projeto-inexistente"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.erro).toBe("Projeto não encontrado.");
  });

  it("com cenário aprovado vigente: valorTotalProposta usa novo_custo_tecnico (fórmula existente, aplicada uma única vez) e prazoProposto fica disponível", async () => {
    configurarMock({
      itens: [],
      respostaCenarioAprovado: {
        data: {
          id: "cenario-1",
          tipo_cenario: "ajustado",
          data_solicitada_cliente: "2026-09-01",
          prazo_proposto: "2026-09-20",
          diferenca_em_dias: 19,
          custo_tecnico_atual: 50000,
          custo_adicional_total: 5000,
          novo_custo_tecnico: 55000,
          aprovado_em: "2026-08-18T10:00:00Z",
        },
        error: null,
      },
    });

    const { result } = renderHook(() => useProposta("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.cenarioComercialAprovado?.prazoProposto).toBe("2026-09-20");

    // calcularResumoOrcamento({custoTotal:55000, margemLucroPercent:20, cargaTributariaPercent:10}):
    // lucro=11000; subtotal=66000; valorTecnico=66000/0.90=73333.33...
    expect(result.current.valorTecnicoProposta).toBeCloseTo(73333.3333333, 4);
    expect(result.current.valorTotalProposta).toBeCloseTo(73333.3333333, 4);

    // Ajuste comercial (correção 2/6): diferença entre resumo(55000) e
    // resumo(50000), nunca recalculado isoladamente sobre os 5000.
    expect(result.current.ajusteComercial?.descricao).toBe("Ajuste comercial — cenário aprovado");
    expect(result.current.ajusteComercial?.valorTotal).toBeCloseTo(6666.6666667, 4);
  });
});
