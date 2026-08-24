import { describe, expect, it, vi } from "vitest";
import { atualizarIdentidadeEmpresa } from "./atualizarIdentidadeEmpresa";

type RespostasMock = {
  empresaId?: string | null;
  erroEmpresa?: { message: string } | null;
  linhaSiteExistente?: { id: string } | null;
  erroLeituraSite?: { message: string } | null;
  erroDeleteSite?: { message: string } | null;
  erroUpdateSite?: { message: string } | null;
  erroInsertSite?: { message: string } | null;
  usuarioId?: string | null;
};

function criarClienteMock(respostas: RespostasMock = {}) {
  const updateEmpresaCalls: Record<string, unknown>[] = [];
  const deleteSiteCalls: string[] = [];
  const updateSiteCalls: Record<string, unknown>[] = [];
  const insertSiteCalls: Record<string, unknown>[] = [];

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: respostas.usuarioId === undefined ? "usuario-teste" : respostas.usuarioId } },
        error: null,
      })),
    },
    rpc: vi.fn(async (nome: string) => {
      if (nome === "empresa_atual_id") {
        const empresaId = respostas.empresaId === undefined ? "empresa-teste" : respostas.empresaId;
        return { data: empresaId, error: null };
      }
      return { data: null, error: null };
    }),
    from: vi.fn((tabela: string) => {
      if (tabela === "empresas") {
        return {
          update: (valores: Record<string, unknown>) => {
            updateEmpresaCalls.push(valores);
            return {
              eq: async () => ({ error: respostas.erroEmpresa ?? null }),
            };
          },
        };
      }

      if (tabela === "configuracoes_empresa") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: respostas.linhaSiteExistente ?? null,
                  error: respostas.erroLeituraSite ?? null,
                }),
              }),
            }),
          }),
          delete: () => ({
            eq: async (_coluna: string, id: string) => {
              deleteSiteCalls.push(id);
              return { error: respostas.erroDeleteSite ?? null };
            },
          }),
          update: (valores: Record<string, unknown>) => ({
            eq: async () => {
              updateSiteCalls.push(valores);
              return { error: respostas.erroUpdateSite ?? null };
            },
          }),
          insert: async (valores: Record<string, unknown>) => {
            insertSiteCalls.push(valores);
            return { error: respostas.erroInsertSite ?? null };
          },
        };
      }

      throw new Error(`tabela inesperada no mock: ${tabela}`);
    }),
  };

  return { client, updateEmpresaCalls, deleteSiteCalls, updateSiteCalls, insertSiteCalls };
}

function dadosPadrao(overrides: Partial<Parameters<typeof atualizarIdentidadeEmpresa>[1]> = {}) {
  return {
    nome: "Empresa Teste",
    cnpj: "12.345.678/0001-90",
    inscricaoEstadual: "123456",
    endereco: "Rua Teste, 100",
    telefone: "(11) 1111-1111",
    email: "contato@empresa.test",
    site: "www.empresa.test",
    ...overrides,
  };
}

describe("atualizarIdentidadeEmpresa", () => {
  it("nome vazio: status validacao, nenhuma escrita tentada", async () => {
    const { client, updateEmpresaCalls } = criarClienteMock();
    const resultado = await atualizarIdentidadeEmpresa(client as any, dadosPadrao({ nome: "   " }));

    expect(resultado.status).toBe("validacao");
    expect(updateEmpresaCalls).toHaveLength(0);
  });

  it("sem empresa: status sem_empresa", async () => {
    const { client } = criarClienteMock({ empresaId: null });
    const resultado = await atualizarIdentidadeEmpresa(client as any, dadosPadrao());

    expect(resultado.status).toBe("sem_empresa");
  });

  it("falha ao atualizar empresas: status erro, nenhuma escrita de site tentada", async () => {
    const { client, updateSiteCalls, insertSiteCalls } = criarClienteMock({
      erroEmpresa: { message: "constraint violation" },
    });
    const resultado = await atualizarIdentidadeEmpresa(client as any, dadosPadrao());

    expect(resultado.status).toBe("erro");
    expect(updateSiteCalls).toHaveLength(0);
    expect(insertSiteCalls).toHaveLength(0);
  });

  it("campos opcionais vazios viram null (nunca string vazia) em empresas", async () => {
    const { client, updateEmpresaCalls } = criarClienteMock({ linhaSiteExistente: { id: "site-1" } });
    await atualizarIdentidadeEmpresa(
      client as any,
      dadosPadrao({ cnpj: "  ", inscricaoEstadual: "", endereco: "   ", telefone: "", email: "  ", site: "" }),
    );

    expect(updateEmpresaCalls[0]).toEqual({
      nome: "Empresa Teste",
      cnpj: null,
      inscricao_estadual: null,
      endereco: null,
      telefone: null,
      email: null,
    });
  });

  it("site vazio, sem linha existente: nao tenta deletar nem inserir - status ok", async () => {
    const { client, deleteSiteCalls, insertSiteCalls } = criarClienteMock({ linhaSiteExistente: null });
    const resultado = await atualizarIdentidadeEmpresa(client as any, dadosPadrao({ site: "" }));

    expect(resultado.status).toBe("ok");
    expect(deleteSiteCalls).toHaveLength(0);
    expect(insertSiteCalls).toHaveLength(0);
  });

  it("site vazio, com linha existente: DELETE a linha (nunca grava string vazia/NULL no jsonb)", async () => {
    const { client, deleteSiteCalls } = criarClienteMock({ linhaSiteExistente: { id: "site-1" } });
    const resultado = await atualizarIdentidadeEmpresa(client as any, dadosPadrao({ site: "   " }));

    expect(resultado.status).toBe("ok");
    expect(deleteSiteCalls).toEqual(["site-1"]);
  });

  it("site preenchido, com linha existente: UPDATE do valor jsonb", async () => {
    const { client, updateSiteCalls } = criarClienteMock({ linhaSiteExistente: { id: "site-1" } });
    const resultado = await atualizarIdentidadeEmpresa(client as any, dadosPadrao({ site: "novo-site.test" }));

    expect(resultado.status).toBe("ok");
    expect(updateSiteCalls).toEqual([{ valor: { url: "novo-site.test" } }]);
  });

  it("site preenchido, sem linha existente: INSERT com created_by do usuario logado", async () => {
    const { client, insertSiteCalls } = criarClienteMock({ linhaSiteExistente: null, usuarioId: "usuario-abc" });
    const resultado = await atualizarIdentidadeEmpresa(client as any, dadosPadrao({ site: "site-novo.test" }));

    expect(resultado.status).toBe("ok");
    expect(insertSiteCalls).toEqual([
      { empresa_id: "empresa-teste", chave: "site", valor: { url: "site-novo.test" }, created_by: "usuario-abc" },
    ]);
  });

  it("falha ao gravar site: status ok com aviso - dados da empresa ja foram salvos, nao vira erro", async () => {
    const { client } = criarClienteMock({
      linhaSiteExistente: { id: "site-1" },
      erroUpdateSite: { message: "network error" },
    });
    const resultado = await atualizarIdentidadeEmpresa(client as any, dadosPadrao({ site: "site.test" }));

    expect(resultado.status).toBe("ok");
    if (resultado.status === "ok") {
      expect(resultado.avisoSite).toMatch(/network error/);
    }
  });
});
