import { describe, expect, it, vi } from "vitest";
import { enviarLogoEmpresa } from "./enviarLogoEmpresa";

type RespostasMock = {
  empresaId?: string | null;
  erroRpc?: { message: string } | null;
  logoPathAtual?: string | null;
  erroLeituraAtual?: { message: string } | null;
  erroUpload?: { message: string } | null;
  erroAtualizacao?: { message: string } | null;
  erroRemocao?: { message: string } | null;
};

function criarClienteMock(respostas: RespostasMock = {}) {
  const uploadCalls: { caminho: string }[] = [];
  const removeCalls: string[][] = [];
  const updateCalls: Record<string, unknown>[] = [];

  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "usuario-teste" } }, error: null })),
    },
    rpc: vi.fn(async (nome: string) => {
      if (nome === "empresa_atual_id") {
        const empresaId = respostas.empresaId === undefined ? "empresa-teste" : respostas.empresaId;
        return { data: empresaId, error: respostas.erroRpc ?? null };
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
        upload: vi.fn(async (caminho: string) => {
          uploadCalls.push({ caminho });
          return { error: respostas.erroUpload ?? null };
        }),
        remove: vi.fn(async (caminhos: string[]) => {
          removeCalls.push(caminhos);
          return { error: respostas.erroRemocao ?? null };
        }),
      }),
    },
  };

  return { client, uploadCalls, removeCalls, updateCalls };
}

function arquivoFalso(opcoes: { tipo?: string; tamanho?: number } = {}) {
  const tipo = opcoes.tipo ?? "image/png";
  const tamanho = opcoes.tamanho ?? 1024;
  return new File([new Uint8Array(tamanho)], "logo.png", { type: tipo });
}

describe("enviarLogoEmpresa", () => {
  it("formato não suportado (SVG): rejeita antes de qualquer chamada de rede", async () => {
    const { client, uploadCalls } = criarClienteMock();
    const resultado = await enviarLogoEmpresa(client as any, arquivoFalso({ tipo: "image/svg+xml" }));

    expect(resultado.status).toBe("arquivo_invalido");
    expect(uploadCalls).toHaveLength(0);
  });

  it("arquivo maior que 2 MB: rejeita antes de qualquer chamada de rede", async () => {
    const { client, uploadCalls } = criarClienteMock();
    const arquivo = arquivoFalso({ tamanho: 2 * 1024 * 1024 + 1 });
    const resultado = await enviarLogoEmpresa(client as any, arquivo);

    expect(resultado.status).toBe("arquivo_invalido");
    expect(uploadCalls).toHaveLength(0);
  });

  it("usuário sem empresa: status sem_empresa, nenhum upload tentado", async () => {
    const { client, uploadCalls } = criarClienteMock({ empresaId: null });
    const resultado = await enviarLogoEmpresa(client as any, arquivoFalso());

    expect(resultado.status).toBe("sem_empresa");
    expect(uploadCalls).toHaveLength(0);
  });

  it("falha ao ler a logo atual: erro explícito, nenhum upload tentado", async () => {
    const { client, uploadCalls } = criarClienteMock({
      erroLeituraAtual: { message: "permission denied" },
    });
    const resultado = await enviarLogoEmpresa(client as any, arquivoFalso());

    expect(resultado.status).toBe("erro");
    expect(uploadCalls).toHaveLength(0);
  });

  it("falha no upload: erro explícito, nenhuma atualização de banco tentada", async () => {
    const { client, updateCalls } = criarClienteMock({
      erroUpload: { message: "network error" },
    });
    const resultado = await enviarLogoEmpresa(client as any, arquivoFalso());

    expect(resultado.status).toBe("erro");
    expect(updateCalls).toHaveLength(0);
  });

  it("upload ok mas UPDATE em empresas falha: rollback - apaga o arquivo novo, reporta erro", async () => {
    const { client, uploadCalls, removeCalls } = criarClienteMock({
      logoPathAtual: null,
      erroAtualizacao: { message: "constraint violation" },
    });
    const resultado = await enviarLogoEmpresa(client as any, arquivoFalso());

    expect(resultado.status).toBe("erro");
    expect(uploadCalls).toHaveLength(1);
    // O rollback apaga exatamente o arquivo que acabou de subir.
    expect(removeCalls).toEqual([[uploadCalls[0].caminho]]);
  });

  it("sucesso completo, sem logo anterior: não tenta remover nada, sem aviso", async () => {
    const { client, removeCalls } = criarClienteMock({ logoPathAtual: null });
    const resultado = await enviarLogoEmpresa(client as any, arquivoFalso());

    expect(resultado.status).toBe("ok");
    expect(removeCalls).toHaveLength(0);
    if (resultado.status === "ok") {
      expect(resultado.avisoArquivoOrfao).toBeUndefined();
    }
  });

  it("sucesso completo, com logo anterior removida com êxito: sem aviso", async () => {
    const { client, removeCalls } = criarClienteMock({
      logoPathAtual: "empresa-teste/logo-antigo.png",
    });
    const resultado = await enviarLogoEmpresa(client as any, arquivoFalso());

    expect(resultado.status).toBe("ok");
    expect(removeCalls).toEqual([["empresa-teste/logo-antigo.png"]]);
    if (resultado.status === "ok") {
      expect(resultado.avisoArquivoOrfao).toBeUndefined();
    }
  });

  it("troca segura tolera falha parcial: logo nova ativa mesmo se a remoção da antiga falhar (aviso, não erro)", async () => {
    const { client } = criarClienteMock({
      logoPathAtual: "empresa-teste/logo-antigo.png",
      erroRemocao: { message: "object not found" },
    });
    const resultado = await enviarLogoEmpresa(client as any, arquivoFalso());

    // A troca É bem-sucedida (status "ok") mesmo com a limpeza falhando -
    // Storage e Postgres não compartilham transação, e a logo nova já
    // está ativa e correta neste ponto.
    expect(resultado.status).toBe("ok");
    if (resultado.status === "ok") {
      expect(resultado.avisoArquivoOrfao).toMatch(/logo-antigo\.png/);
    }
  });

  it("caminho gerado: {empresaId}/logo-{uuid}.{ext}, isolado por pasta da empresa", async () => {
    const { client, uploadCalls } = criarClienteMock({ empresaId: "empresa-xyz" });
    const resultado = await enviarLogoEmpresa(client as any, arquivoFalso({ tipo: "image/webp" }));

    expect(resultado.status).toBe("ok");
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0].caminho).toMatch(
      /^empresa-xyz\/logo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/,
    );
  });
});
