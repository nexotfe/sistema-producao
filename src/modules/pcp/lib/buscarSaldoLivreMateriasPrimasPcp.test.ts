// Etapa 61 — testes de buscarSaldoLivreMateriasPrimasPcp. Client de
// sessão mockado (nunca real), nenhuma escrita é exercitada aqui.
import { describe, expect, it, vi } from "vitest";
import { buscarSaldoLivreMateriasPrimasPcp } from "./buscarSaldoLivreMateriasPrimasPcp";

function clientMock(resposta: { data?: unknown; error?: unknown }) {
  const eq = vi.fn().mockReturnThis();
  const inFn = vi.fn().mockResolvedValue(resposta);
  const select = vi.fn().mockReturnValue({ eq, in: inFn });
  const from = vi.fn().mockReturnValue({ select });
  return { client: { from } as unknown as import("@supabase/supabase-js").SupabaseClient, from, select, eq, inFn };
}

describe("buscarSaldoLivreMateriasPrimasPcp", () => {
  it("1. Lista vazia de ids: não consulta o banco, devolve mapa vazio", async () => {
    const { client, from } = clientMock({ data: [] });

    const resultado = await buscarSaldoLivreMateriasPrimasPcp(client, []);

    expect(resultado).toEqual({ ok: true, saldoLivrePorMaterial: new Map() });
    expect(from).not.toHaveBeenCalled();
  });

  it("2. Ids reais: uma única consulta em lote (nunca uma por material), mapa correto", async () => {
    const { client, from, inFn } = clientMock({
      data: [
        { materia_prima_id: "mp-1", saldo_livre: 120 },
        { materia_prima_id: "mp-2", saldo_livre: 0 },
      ],
    });

    const resultado = await buscarSaldoLivreMateriasPrimasPcp(client, ["mp-1", "mp-2", "mp-1"]);

    expect(from).toHaveBeenCalledTimes(1);
    expect(inFn).toHaveBeenCalledWith("materia_prima_id", ["mp-1", "mp-2"]);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.saldoLivrePorMaterial.get("mp-1")).toBe(120);
      expect(resultado.saldoLivrePorMaterial.get("mp-2")).toBe(0);
    }
  });

  it("3. saldo_livre nulo (sem linha de estoque ainda): trata como 0, nunca undefined/omitido", async () => {
    const { client } = clientMock({ data: [{ materia_prima_id: "mp-3", saldo_livre: null }] });

    const resultado = await buscarSaldoLivreMateriasPrimasPcp(client, ["mp-3"]);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.saldoLivrePorMaterial.get("mp-3")).toBe(0);
  });

  it("4. Erro na consulta: propaga erro_desconhecido, nunca um mapa parcial", async () => {
    const { client } = clientMock({ data: null, error: { message: "falha", code: "500" } });

    const resultado = await buscarSaldoLivreMateriasPrimasPcp(client, ["mp-1"]);

    expect(resultado).toEqual({ ok: false, motivo: "erro_desconhecido" });
  });
});
