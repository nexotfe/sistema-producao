/* @vitest-environment jsdom */
// Cobertura mínima e focada da integração com cenário comercial aprovado
// (DEC-007 §6.2/Fase 8b) - useProposta.ts não tinha suíte própria antes
// desta mudança; este arquivo cobre só o que esta feature acrescentou
// (novo_custo_tecnico como valor-base, prazoProposto exposto, ausência
// de cenário preserva o comportamento anterior), não uma reescrita
// completa da cobertura do hook.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

import { supabase } from "@/lib/supabaseClient";
import { useProposta } from "./useProposta";

type Resultado = { data: unknown; error: unknown };

const supabaseMock = supabase as unknown as {
  from: ReturnType<typeof vi.fn>;
  auth: { getUser: ReturnType<typeof vi.fn> };
};

const VAZIO: Resultado = { data: null, error: null };

function projetoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "projeto-a",
    numero_projeto: "999999",
    tipo_projeto: "fabricacao",
    cliente_id: null,
    margem_lucro_percent: 20,
    carga_tributaria_percent: 10,
    desconto_percentual: null,
    contato_comercial_nome: null,
    created_at: "2026-01-01T00:00:00.000Z",
    proposta_revisao: "A",
    proposta_consideracoes: null,
    ...overrides,
  };
}

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

function configurarMock(respostaCenarioAprovado: Resultado = VAZIO) {
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });

  supabaseMock.from.mockImplementation((tabela: string) => {
    if (tabela === "projetos") return criarFakeQuery({ data: projetoRow(), error: null });
    if (tabela === "projeto_itens") return criarFakeQuery({ data: [], error: null });
    if (tabela === "cenarios_comerciais_aprovados") return criarFakeQuery(respostaCenarioAprovado);
    return criarFakeQuery(VAZIO);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("useProposta - integração com cenário comercial aprovado", () => {
  it("sem cenário aprovado: comportamento preservado - total vem da soma dos itens (0 neste fixture)", async () => {
    configurarMock();

    const { result } = renderHook(() => useProposta("projeto-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.cenarioComercialAprovado).toBeNull();
    // custoTotalSoma=0, margem=20%, carga=10% -> valorTecnico=0, valorTotalProposta=0.
    expect(result.current.valorTotalProposta).toBe(0);
    expect(result.current.ajusteComercial).toBeNull();
  });

  it("com cenário aprovado vigente: valorTotalProposta usa novo_custo_tecnico (fórmula existente, aplicada uma única vez) e prazoProposto fica disponível", async () => {
    configurarMock({
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
    // resumo(50000): lucro=10000, subtotal=60000, valorTecnico=60000/0.9=66666.6666...
    // ajuste = 73333.3333... - 66666.6666... = 6666.6666...
    expect(result.current.ajusteComercial?.descricao).toBe("Ajuste comercial — cenário aprovado");
    expect(result.current.ajusteComercial?.valorTotal).toBeCloseTo(6666.6666667, 4);
  });
});
