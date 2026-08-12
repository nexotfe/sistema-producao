import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  trocarVinculoSubconjunto,
  type ParametrosTrocarVinculoSubconjunto,
} from "./trocarVinculoSubconjunto";

type ResultadoSupabase = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

function criarClienteFalso(
  opcoes: {
    userId?: string | null;
    resultadoMutacao?: ResultadoSupabase;
    resultadoUsuario?: ResultadoSupabase;
  } = {},
) {
  const {
    userId = "user-1",
    resultadoMutacao = { data: [{ id: "vinculo-1" }], error: null },
    resultadoUsuario = { data: { empresa_id: "empresa-1" }, error: null },
  } = opcoes;

  const chamadas: {
    tabelas: string[];
    update?: Record<string, unknown>;
    insert?: Record<string, unknown>;
    eq?: [string, unknown];
    selectColunas?: string;
  } = { tabelas: [] };

  // Imita o builder do supabase-js: cada método de filtro/projeção
  // devolve algo encadeável e "thenable" (await funciona direto),
  // igual ao PostgrestFilterBuilder real.
  function thenable(valor: unknown) {
    return {
      then(resolve: (v: unknown) => unknown) {
        return Promise.resolve(resolve(valor));
      },
    };
  }

  const builder = {
    update(payload: Record<string, unknown>) {
      chamadas.update = payload;
      return builder;
    },
    insert(payload: Record<string, unknown>) {
      chamadas.insert = payload;
      return thenable(resultadoMutacao);
    },
    eq(coluna: string, valor: unknown) {
      chamadas.eq = [coluna, valor];
      return {
        select(colunas: string) {
          chamadas.selectColunas = colunas;
          return thenable(resultadoMutacao);
        },
        single() {
          return thenable(resultadoUsuario);
        },
      };
    },
    select(colunas: string) {
      chamadas.selectColunas = colunas;
      return builder;
    },
  };

  const from = vi.fn((tabela: string) => {
    chamadas.tabelas.push(tabela);
    return builder;
  });

  const client = {
    from,
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: userId ? { id: userId } : null },
        }),
    },
  } as unknown as SupabaseClient;

  return { client, chamadas };
}

function params(
  overrides: Partial<ParametrosTrocarVinculoSubconjunto> = {},
): ParametrosTrocarVinculoSubconjunto {
  return {
    bomItemId: "bom-item-1",
    vinculoIdAtual: null,
    vinculoOperacaoIdAtual: null,
    novaOperacaoId: "op-x",
    ...overrides,
  };
}

describe("trocarVinculoSubconjunto", () => {
  it("sem vínculo + operação escolhida = INSERT com empresa_id/created_by resolvidos do servidor, nunca do chamador", async () => {
    const { client, chamadas } = criarClienteFalso({ userId: "user-servidor" });

    const resultado = await trocarVinculoSubconjunto(
      client,
      params({ vinculoIdAtual: null, vinculoOperacaoIdAtual: null, novaOperacaoId: "op-x" }),
    );

    expect(resultado).toEqual({ status: "ok" });
    expect(chamadas.tabelas).toEqual(["usuarios", "bom_operacao_dependencias_subconjunto"]);
    expect(chamadas.insert).toEqual({
      empresa_id: "empresa-1",
      bom_operacao_id: "op-x",
      bom_item_id: "bom-item-1",
      created_by: "user-servidor",
    });
  });

  it("o payload do INSERT não aceita deleted_by nem qualquer campo além dos quatro esperados", async () => {
    const { client, chamadas } = criarClienteFalso();

    await trocarVinculoSubconjunto(client, params());

    expect(Object.keys(chamadas.insert!).sort()).toEqual(
      ["bom_item_id", "bom_operacao_id", "created_by", "empresa_id"].sort(),
    );
    expect(chamadas.insert).not.toHaveProperty("deleted_by");
  });

  it("trocar X→Y com vínculo existente = um único UPDATE contendo somente bom_operacao_id", async () => {
    const { client, chamadas } = criarClienteFalso();

    const resultado = await trocarVinculoSubconjunto(
      client,
      params({ vinculoIdAtual: "vinculo-1", vinculoOperacaoIdAtual: "op-x", novaOperacaoId: "op-y" }),
    );

    expect(resultado).toEqual({ status: "ok" });
    expect(chamadas.tabelas).toEqual(["bom_operacao_dependencias_subconjunto"]);
    expect(chamadas.update).toEqual({ bom_operacao_id: "op-y" });
    expect(chamadas.eq).toEqual(["id", "vinculo-1"]);
  });

  it("voltar para a regra conservadora (novaOperacaoId=null) é UPDATE de deleted_at/deleted_by - nunca DELETE", async () => {
    const { client, chamadas } = criarClienteFalso({ userId: "user-que-remove" });

    const resultado = await trocarVinculoSubconjunto(
      client,
      params({ vinculoIdAtual: "vinculo-1", vinculoOperacaoIdAtual: "op-x", novaOperacaoId: null }),
    );

    expect(resultado).toEqual({ status: "ok" });
    expect(chamadas.tabelas).toEqual(["bom_operacao_dependencias_subconjunto"]);
    expect(chamadas.update).toBeDefined();
    expect(Object.keys(chamadas.update!).sort()).toEqual(["deleted_at", "deleted_by"]);
    expect(chamadas.update!.deleted_by).toBe("user-que-remove");
    expect(typeof chamadas.update!.deleted_at).toBe("string");
    expect(Number.isNaN(Date.parse(chamadas.update!.deleted_at as string))).toBe(false);
    // builder desta fake não expõe .delete - se o código tentasse
    // chamar DELETE físico, o teste quebraria com TypeError antes de
    // chegar aqui.
  });

  it("selecionar a mesma operação já vinculada é no-op: nenhuma chamada ao banco, status ok", async () => {
    const { client, chamadas } = criarClienteFalso();

    const resultado = await trocarVinculoSubconjunto(
      client,
      params({ vinculoIdAtual: "vinculo-1", vinculoOperacaoIdAtual: "op-x", novaOperacaoId: "op-x" }),
    );

    expect(resultado).toEqual({ status: "ok" });
    expect(chamadas.tabelas).toEqual([]);
  });

  it("zero linhas afetadas na troca (RLS bloqueou sem erro Postgres) vira erro de negócio, não sucesso silencioso", async () => {
    const { client } = criarClienteFalso({
      resultadoMutacao: { data: [], error: null },
    });

    const resultado = await trocarVinculoSubconjunto(
      client,
      params({ vinculoIdAtual: "vinculo-1", vinculoOperacaoIdAtual: "op-x", novaOperacaoId: "op-y" }),
    );

    expect(resultado).toEqual({
      status: "erro",
      mensagem:
        "Não foi possível trocar - verifique se você é quem criou este vínculo ou é administrador.",
    });
  });

  it("zero linhas afetadas na remoção (RLS bloqueou) também vira erro de negócio, não sucesso silencioso", async () => {
    const { client } = criarClienteFalso({
      resultadoMutacao: { data: [], error: null },
    });

    const resultado = await trocarVinculoSubconjunto(
      client,
      params({ vinculoIdAtual: "vinculo-1", vinculoOperacaoIdAtual: "op-x", novaOperacaoId: null }),
    );

    expect(resultado).toEqual({
      status: "erro",
      mensagem:
        "Não foi possível remover - verifique se você é quem criou este vínculo ou é administrador.",
    });
  });

  it("data null (sem erro) na troca também é tratado como falha, não sucesso", async () => {
    const { client } = criarClienteFalso({
      resultadoMutacao: { data: null, error: null },
    });

    const resultado = await trocarVinculoSubconjunto(
      client,
      params({ vinculoIdAtual: "vinculo-1", vinculoOperacaoIdAtual: "op-x", novaOperacaoId: "op-y" }),
    );

    expect(resultado.status).toBe("erro");
  });

  it("duplicidade (23505) ao inserir é mapeada para mensagem clara de outra aba/usuário", async () => {
    const { client } = criarClienteFalso({
      resultadoMutacao: {
        data: null,
        error: { code: "23505", message: "duplicate key value" },
      },
    });

    const resultado = await trocarVinculoSubconjunto(client, params());

    expect(resultado).toEqual({
      status: "erro",
      mensagem:
        "Este subconjunto já está vinculado a outra operação (provavelmente por outra aba/usuário) - recarregue a página.",
    });
  });

  it("violação de FK (23503) na troca é mapeada para mensagem de operação inválida", async () => {
    const { client } = criarClienteFalso({
      resultadoMutacao: {
        data: null,
        error: { code: "23503", message: "violates foreign key constraint" },
      },
    });

    const resultado = await trocarVinculoSubconjunto(
      client,
      params({ vinculoIdAtual: "vinculo-1", vinculoOperacaoIdAtual: "op-x", novaOperacaoId: "op-y" }),
    );

    expect(resultado).toEqual({
      status: "erro",
      mensagem: "A operação selecionada não existe mais ou está inválida.",
    });
  });

  it("erro do trigger de imutabilidade/auditoria é repassado com a mensagem original do Postgres", async () => {
    const { client } = criarClienteFalso({
      resultadoMutacao: {
        data: null,
        error: { message: "não é permitido restaurar um vínculo removido" },
      },
    });

    const resultado = await trocarVinculoSubconjunto(
      client,
      params({ vinculoIdAtual: "vinculo-1", vinculoOperacaoIdAtual: "op-x", novaOperacaoId: "op-y" }),
    );

    expect(resultado).toEqual({
      status: "erro",
      mensagem: "não é permitido restaurar um vínculo removido",
    });
  });

  it("usuário não autenticado é rejeitado antes de qualquer chamada ao banco", async () => {
    const { client, chamadas } = criarClienteFalso({ userId: null });

    const resultado = await trocarVinculoSubconjunto(client, params());

    expect(resultado).toEqual({ status: "erro", mensagem: "Usuário não autenticado." });
    expect(chamadas.tabelas).toEqual([]);
  });

  it("empresa do usuário não encontrada impede o INSERT", async () => {
    const { client, chamadas } = criarClienteFalso({
      resultadoUsuario: { data: null, error: null },
    });

    const resultado = await trocarVinculoSubconjunto(client, params());

    expect(resultado).toEqual({
      status: "erro",
      mensagem: "Empresa do usuário não encontrada.",
    });
    expect(chamadas.tabelas).toEqual(["usuarios"]);
  });
});
