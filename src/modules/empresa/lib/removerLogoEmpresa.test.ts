import { describe, expect, it, vi } from "vitest";
import { removerLogoEmpresa } from "./removerLogoEmpresa";

type RespostasMock = {
  empresaId?: string | null;
  logoPathAtual?: string | null;
  erroLeituraAtual?: { message: string } | null;
  erroAtualizacao?: { message: string } | null;
  erroRemocao?: { message: string } | null;
};

function criarClienteMock(respostas: RespostasMock = {}) {
  const removeCalls: string[][] = [];
  const updateCalls: Record<string, unknown>[] = [];

  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "usuario-teste" } }, error: null })),
    },
    rpc: vi.fn(async (nome: string) => {
      if (nome === "empresa_atual_id") {
        const empresaId = respostas.empresaId === undefined ? "empresa-teste" : respostas.empresaId;
        return { data: empresaId, error: null };
      }
      return { data: null, error: null };
    }),
    from: vi.fn((tabela: string) => {
      if (tabela !== "empresas") {
        throw new Error(`tabela inesperada no mock: ${tabela}`);
      }
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { logo_path: respostas.logoPathAtual ?? null },
              error: respostas.erroLeituraAtual ?? null,
            }),
          }),
        }),
        update: (valores: Record<string, unknown>) => {
          updateCalls.push(valores);
          return {
            eq: async () => ({ error: respostas.erroAtualizacao ?? null }),
          };
        },
      };
    }),
    storage: {
      from: () => ({
        remove: vi.fn(async (caminhos: string[]) => {
          removeCalls.push(caminhos);
          return { error: respostas.erroRemocao ?? null };
        }),
      }),
    },
  };

  return { client, removeCalls, updateCalls };
}

describe("removerLogoEmpresa", () => {
  it("usuário sem empresa: status sem_empresa", async () => {
    const { client } = criarClienteMock({ empresaId: null });
    const resultado = await removerLogoEmpresa(client as any);

    expect(resultado.status).toBe("sem_empresa");
  });

  it("falha ao ler a logo atual: erro explícito, nenhum UPDATE tentado", async () => {
    const { client, updateCalls } = criarClienteMock({
      erroLeituraAtual: { message: "permission denied" },
    });
    const resultado = await removerLogoEmpresa(client as any);

    expect(resultado.status).toBe("erro");
    expect(updateCalls).toHaveLength(0);
  });

  it("empresa já sem logo: status sem_logo, nenhum UPDATE/remove tentado", async () => {
    const { client, updateCalls, removeCalls } = criarClienteMock({ logoPathAtual: null });
    const resultado = await removerLogoEmpresa(client as any);

    expect(resultado.status).toBe("sem_logo");
    expect(updateCalls).toHaveLength(0);
    expect(removeCalls).toHaveLength(0);
  });

  it("UPDATE falha: aborta, nunca tenta apagar o arquivo (banco continua apontando pra logo antiga)", async () => {
    const { client, removeCalls } = criarClienteMock({
      logoPathAtual: "empresa-teste/logo-atual.png",
      erroAtualizacao: { message: "constraint violation" },
    });
    const resultado = await removerLogoEmpresa(client as any);

    expect(resultado.status).toBe("erro");
    expect(removeCalls).toHaveLength(0);
  });

  it("sucesso completo: UPDATE zera logo_path, depois apaga o arquivo, sem aviso", async () => {
    const { client, removeCalls, updateCalls } = criarClienteMock({
      logoPathAtual: "empresa-teste/logo-atual.png",
    });
    const resultado = await removerLogoEmpresa(client as any);

    expect(resultado.status).toBe("ok");
    expect(updateCalls).toEqual([{ logo_path: null }]);
    expect(removeCalls).toEqual([["empresa-teste/logo-atual.png"]]);
    if (resultado.status === "ok") {
      expect(resultado.avisoArquivoOrfao).toBeUndefined();
    }
  });

  it("UPDATE ok mas remoção do arquivo falha: status ok mesmo assim (banco já não referencia mais), com aviso de órfão", async () => {
    const { client } = criarClienteMock({
      logoPathAtual: "empresa-teste/logo-atual.png",
      erroRemocao: { message: "object not found" },
    });
    const resultado = await removerLogoEmpresa(client as any);

    expect(resultado.status).toBe("ok");
    if (resultado.status === "ok") {
      expect(resultado.avisoArquivoOrfao).toMatch(/logo-atual\.png/);
    }
  });
});
