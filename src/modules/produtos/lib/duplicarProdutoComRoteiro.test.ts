import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { duplicarProdutoComRoteiro } from "./duplicarProdutoComRoteiro";

function criarClienteFalso(resultado: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(resultado);
  const client = { rpc } as unknown as SupabaseClient;
  return { client, rpc };
}

describe("duplicarProdutoComRoteiro", () => {
  it("chama a RPC certa com o payload certo (produto de origem + código, já com trim)", async () => {
    const { client, rpc } = criarClienteFalso({ data: "produto-novo-id", error: null });

    await duplicarProdutoComRoteiro(client, "produto-origem-id", "  NOVO-CODIGO  ");

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("duplicar_produto_com_roteiro", {
      p_produto_origem_id: "produto-origem-id",
      p_novo_codigo: "NOVO-CODIGO",
    });
  });

  it("sucesso: retorna o id do produto novo devolvido pela RPC", async () => {
    const { client } = criarClienteFalso({ data: "id-do-produto-duplicado", error: null });

    const resultado = await duplicarProdutoComRoteiro(client, "origem", "CODIGO-X");

    expect(resultado).toBe("id-do-produto-duplicado");
  });

  it.each([
    'Este produto não possui roteiro para duplicação. Use "Novo produto" para criar somente o cadastro.',
    "Não é possível duplicar: as seguintes matérias-primas do roteiro foram excluídas: MP-01, MP-02.",
    "Não é possível duplicar: os seguintes produtos-subconjunto do roteiro foram excluídos: SUB-01.",
    'Já existe um produto com o código "COD-X". Escolha outro código.',
  ])("repassa a mensagem de domínio da RPC sem alterar: %s", async (mensagem) => {
    const { client } = criarClienteFalso({ data: null, error: { message: mensagem } });

    await expect(duplicarProdutoComRoteiro(client, "origem", "codigo")).rejects.toThrow(mensagem);
  });

  it("erro sem mensagem da RPC cai no texto genérico", async () => {
    const { client } = criarClienteFalso({ data: null, error: { message: "" } });

    await expect(duplicarProdutoComRoteiro(client, "origem", "codigo")).rejects.toThrow(
      "Não foi possível duplicar o produto.",
    );
  });

  it("sucesso sem erro mas sem id válido no retorno lança erro claro (defesa contra resposta incoerente)", async () => {
    const { client } = criarClienteFalso({ data: null, error: null });

    await expect(duplicarProdutoComRoteiro(client, "origem", "codigo")).rejects.toThrow(
      "A duplicação não retornou o id do produto novo.",
    );
  });
});
