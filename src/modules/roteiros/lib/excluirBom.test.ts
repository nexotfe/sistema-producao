import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { excluirBom } from "./excluirBom";

function criarClienteFalso(resultado: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(resultado);
  const client = { rpc } as unknown as SupabaseClient;
  return { client, rpc };
}

describe("excluirBom", () => {
  it("chama a RPC certa com o bomId", async () => {
    const { client, rpc } = criarClienteFalso({ data: "produto-id", error: null });

    await excluirBom(client, "bom-123");

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("excluir_bom", { p_bom_id: "bom-123" });
  });

  it("sucesso: retorna o produto_id devolvido pela RPC", async () => {
    const { client } = criarClienteFalso({ data: "produto-abc", error: null });

    const resultado = await excluirBom(client, "bom-123");

    expect(resultado).toBe("produto-abc");
  });

  it.each([
    "Apenas administradores podem excluir roteiros.",
    "Roteiro não encontrado ou já foi excluído.",
    "Não é possível excluir: o roteiro já foi excluído.",
    "Não é possível excluir: produto usado no orçamento do projeto 260011.",
    "Não é possível excluir fisicamente um roteiro (id=bom-123). Use a função excluir_bom para exclusão lógica.",
  ])("repassa a mensagem de domínio da RPC sem alterar: %s", async (mensagem) => {
    const { client } = criarClienteFalso({ data: null, error: { message: mensagem } });

    await expect(excluirBom(client, "bom-123")).rejects.toThrow(mensagem);
  });

  it("erro sem mensagem da RPC cai no texto genérico", async () => {
    const { client } = criarClienteFalso({ data: null, error: { message: "" } });

    await expect(excluirBom(client, "bom-123")).rejects.toThrow(
      "Não foi possível excluir o roteiro.",
    );
  });

  it("sucesso sem erro mas sem produto_id válido lança erro claro (defesa contra resposta incoerente)", async () => {
    const { client } = criarClienteFalso({ data: null, error: null });

    await expect(excluirBom(client, "bom-123")).rejects.toThrow(
      "A exclusão não retornou o id do produto.",
    );
  });
});
