// Etapa 65C — testes de buscarRecursosProdutivosPcp.
import { describe, expect, it, vi } from "vitest";
import { buscarRecursosProdutivosPcp } from "./buscarRecursosProdutivosPcp";

function clientFalso(resposta: { data: unknown; error: { message: string } | null }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve(resposta),
        }),
      }),
    }),
  } as never;
}

describe("buscarRecursosProdutivosPcp", () => {
  it("1. Monta o label como 'codigo — nome', ordenado pelo banco", async () => {
    const client = clientFalso({
      data: [
        { id: "rec-1", codigo: "TC01", nome: "Torno CNC 01" },
        { id: "rec-2", codigo: null, nome: "Furadeira 02" },
      ],
      error: null,
    });

    const resultado = await buscarRecursosProdutivosPcp(client);

    expect(resultado).toEqual({
      ok: true,
      recursos: [
        { id: "rec-1", label: "TC01 — Torno CNC 01" },
        { id: "rec-2", label: "Furadeira 02" },
      ],
    });
  });

  it("2. Nenhum recurso ativo: devolve lista vazia, não erro", async () => {
    const client = clientFalso({ data: [], error: null });

    const resultado = await buscarRecursosProdutivosPcp(client);

    expect(resultado).toEqual({ ok: true, recursos: [] });
  });

  it("3. Falha técnica: devolve ok:false, nunca lista vazia disfarçada de sucesso", async () => {
    const client = clientFalso({ data: null, error: { message: "falha" } });

    const resultado = await buscarRecursosProdutivosPcp(client);

    expect(resultado).toEqual({ ok: false, motivo: "erro_desconhecido" });
  });

  it("4. Filtra por ativo=true (isolamento multiempresa vem da RLS da própria tabela)", async () => {
    const eqMock = vi.fn(() => ({ order: () => Promise.resolve({ data: [], error: null }) }));
    const client = { from: () => ({ select: () => ({ eq: eqMock }) }) } as never;

    await buscarRecursosProdutivosPcp(client);

    expect(eqMock).toHaveBeenCalledWith("ativo", true);
  });
});
