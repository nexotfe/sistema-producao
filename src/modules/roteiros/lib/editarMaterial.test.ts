import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { editarMaterial } from "./editarMaterial";
import type { NovoBomItemInput } from "../types";

function criarClienteFalso(resultado: {
  data: unknown;
  error: { message: string; code?: string } | null;
}) {
  const chamadas: {
    tabela?: string;
    update?: Record<string, unknown>;
    eq?: [string, unknown];
    select?: string;
  } = {};

  const builder = {
    update(payload: Record<string, unknown>) {
      chamadas.update = payload;
      return builder;
    },
    eq(coluna: string, valor: unknown) {
      chamadas.eq = [coluna, valor];
      return builder;
    },
    select(colunas: string) {
      chamadas.select = colunas;
      return Promise.resolve(resultado);
    },
  };

  const from = vi.fn((tabela: string) => {
    chamadas.tabela = tabela;
    return builder;
  });

  const client = { from } as unknown as SupabaseClient;
  return { client, from, chamadas };
}

function input(overrides: Partial<NovoBomItemInput> = {}): NovoBomItemInput {
  return {
    materiaPrimaId: "materia-prima-original",
    quantidade: 12.5,
    unidade: "kg",
    dimensoes: "1000x1000mm",
    observacoes: "corte a laser",
    ...overrides,
  };
}

describe("editarMaterial", () => {
  it("atualiza a tabela bom_itens, filtrando pelo id exato da linha", async () => {
    const { client, chamadas } = criarClienteFalso({
      data: [{ id: "item-123" }],
      error: null,
    });

    await editarMaterial(client, "item-123", input());

    expect(chamadas.tabela).toBe("bom_itens");
    expect(chamadas.eq).toEqual(["id", "item-123"]);
  });

  it("o payload do UPDATE contém somente quantidade, unidade, dimensoes e observacoes", async () => {
    const { client, chamadas } = criarClienteFalso({
      data: [{ id: "item-123" }],
      error: null,
    });

    await editarMaterial(client, "item-123", input());

    expect(Object.keys(chamadas.update!).sort()).toEqual(
      ["dimensoes", "observacoes", "quantidade", "unidade"].sort(),
    );
  });

  it("materia_prima_id nunca é enviado no payload, mesmo se presente no input", async () => {
    const { client, chamadas } = criarClienteFalso({
      data: [{ id: "item-123" }],
      error: null,
    });

    await editarMaterial(
      client,
      "item-123",
      input({ materiaPrimaId: "outra-materia-prima-qualquer" }),
    );

    expect(chamadas.update).not.toHaveProperty("materia_prima_id");
  });

  it("envia quantidade, unidade, dimensoes e observacoes exatamente como recebidos (dimensoes/observacoes sem trim vazio viram null)", async () => {
    const { client, chamadas } = criarClienteFalso({
      data: [{ id: "item-123" }],
      error: null,
    });

    await editarMaterial(
      client,
      "item-123",
      input({ quantidade: 3, unidade: "metro", dimensoes: "  ", observacoes: "" }),
    );

    expect(chamadas.update).toEqual({
      quantidade: 3,
      unidade: "metro",
      dimensoes: null,
      observacoes: null,
    });
  });

  it("observação não vazia é enviada com trim, nunca descartada para null", async () => {
    const { client, chamadas } = criarClienteFalso({
      data: [{ id: "item-123" }],
      error: null,
    });

    await editarMaterial(
      client,
      "item-123",
      input({ observacoes: "  teste de edição — restaurar  " }),
    );

    expect(chamadas.update!.observacoes).toBe("teste de edição — restaurar");
  });

  it("retorno vazio (RLS bloqueou sem erro Postgres) vira erro de negócio, não sucesso silencioso", async () => {
    const { client } = criarClienteFalso({ data: [], error: null });

    const resultado = await editarMaterial(client, "item-123", input());

    expect(resultado).toEqual({
      status: "erro",
      mensagem:
        "Não foi possível atualizar - você não tem permissão para editar este registro.",
    });
  });

  it("data null (sem erro) também é tratado como falha de permissão, não sucesso", async () => {
    const { client } = criarClienteFalso({ data: null, error: null });

    const resultado = await editarMaterial(client, "item-123", input());

    expect(resultado.status).toBe("erro");
  });

  it("erro real do Postgres é propagado com a mensagem original", async () => {
    const { client } = criarClienteFalso({
      data: null,
      error: { message: "conexão perdida com o banco" },
    });

    const resultado = await editarMaterial(client, "item-123", input());

    expect(resultado).toEqual({
      status: "erro",
      mensagem: "conexão perdida com o banco",
    });
  });

  it("quantidade inválida (viola bom_itens_quantidade_chk) é rejeitada e repassada como erro, não sucesso", async () => {
    const { client } = criarClienteFalso({
      data: null,
      error: {
        code: "23514",
        message:
          'new row for relation "bom_itens" violates check constraint "bom_itens_quantidade_chk"',
      },
    });

    const resultado = await editarMaterial(
      client,
      "item-123",
      input({ quantidade: -5 }),
    );

    expect(resultado.status).toBe("erro");
    expect(resultado.status === "erro" && resultado.mensagem).toMatch(
      /bom_itens_quantidade_chk/,
    );
  });

  it("unidade inválida (viola bom_itens_unidade_chk) é rejeitada e repassada como erro, não sucesso", async () => {
    const { client } = criarClienteFalso({
      data: null,
      error: {
        code: "23514",
        message:
          'new row for relation "bom_itens" violates check constraint "bom_itens_unidade_chk"',
      },
    });

    const resultado = await editarMaterial(
      client,
      "item-123",
      input({ unidade: "unidade-que-nao-existe" }),
    );

    expect(resultado.status).toBe("erro");
    expect(resultado.status === "erro" && resultado.mensagem).toMatch(
      /bom_itens_unidade_chk/,
    );
  });

  it("sucesso: retorna status ok quando a linha volta no select", async () => {
    const { client } = criarClienteFalso({
      data: [{ id: "item-123" }],
      error: null,
    });

    const resultado = await editarMaterial(client, "item-123", input());

    expect(resultado).toEqual({ status: "ok" });
  });
});
