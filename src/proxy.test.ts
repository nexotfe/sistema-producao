// Cobertura dinâmica dos 5 caminhos técnicos da checagem de vínculo
// operacional em proxy.ts (ETAPA U9-D) — pendência registrada em
// U9-B/V, nunca antes provada dinamicamente (só por inspeção estática).
//
// Mocka exclusivamente createServerClient (@supabase/ssr) — nunca o
// proxy.ts em si, que é importado e executado de verdade. auth.getUser()
// e supabase.rpc(...) são controlados por teste; o resto do arquivo
// (helper de redirect, coleções de rotas isentas, classificação dos
// resultados) roda com o código real, sem nenhuma edição de src/proxy.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUserMock = vi.fn();
const rpcMock = vi.fn();

// Guarda o objeto `cookies` (getAll/setAll REAIS, definidos dentro do
// próprio proxy.ts) que cada chamada de createServerClient recebe -
// permite, quando um teste precisar, invocar setAll() para simular um
// cookie renovado, exercitando o helper real de preservação de cookies
// sem precisar exportá-lo nem editar o arquivo.
let ultimoCookiesOptions: { getAll: () => unknown[]; setAll: (c: unknown[]) => void } | null = null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url: string, _key: string, options: { cookies: typeof ultimoCookiesOptions }) => {
    ultimoCookiesOptions = options.cookies;
    return {
      auth: { getUser: getUserMock },
      rpc: rpcMock,
    };
  }),
}));

const { proxy } = await import("./proxy");

function criarRequestAutenticado(pathname: string) {
  return new NextRequest(new URL(`http://localhost${pathname}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  ultimoCookiesOptions = null;
  getUserMock.mockResolvedValue({ data: { user: { id: "usuario-teste" } }, error: null });
});

describe("proxy — checagem de vínculo operacional (rota protegida, sessão autenticada)", () => {
  it("RPC retorna { error } → redireciona para rota técnica, nunca libera navegação", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "falha simulada" } });
    const res = await proxy(criarRequestAutenticado("/central"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/acesso/verificacao-indisponivel");
  });

  it("RPC lança exceção → a exceção NÃO escapa de proxy() e redireciona para rota técnica", async () => {
    rpcMock.mockRejectedValue(new Error("rede indisponível"));
    await expect(proxy(criarRequestAutenticado("/central"))).resolves.toBeDefined();

    rpcMock.mockRejectedValue(new Error("rede indisponível"));
    const res = await proxy(criarRequestAutenticado("/central"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/acesso/verificacao-indisponivel");
  });

  it("data=null (sem error) → redireciona para rota técnica", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const res = await proxy(criarRequestAutenticado("/central"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/acesso/verificacao-indisponivel");
  });

  it("data=undefined (sem error) → redireciona para rota técnica", async () => {
    rpcMock.mockResolvedValue({ data: undefined, error: null });
    const res = await proxy(criarRequestAutenticado("/central"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/acesso/verificacao-indisponivel");
  });

  it("valor desconhecido (nem 'coerente' nem 'inconsistente') → redireciona para rota técnica", async () => {
    rpcMock.mockResolvedValue({ data: "valor-nunca-definido-pela-rpc", error: null });
    const res = await proxy(criarRequestAutenticado("/central"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/acesso/verificacao-indisponivel");
  });

  it("'coerente' → segue normalmente (controle positivo, não é um dos 5 ramos técnicos)", async () => {
    // Duas RPCs reais no caminho feliz (C2.4-P1): vínculo 'coerente' e,
    // em seguida, usuario_atual_esta_ativo() === true - mock precisa
    // diferenciar pelo nome, senão a 2a chamada herda "coerente" (string)
    // como se fosse o retorno booleano da 1a, caindo no ramo "inesperado".
    rpcMock.mockImplementation(async (nome: string) => {
      if (nome === "usuario_atual_esta_ativo") {
        return { data: true, error: null };
      }
      return { data: "coerente", error: null };
    });
    const res = await proxy(criarRequestAutenticado("/central"));
    expect(res.status).not.toBe(307);
  });

  it("'inconsistente' → redireciona para rota estrutural, não para a técnica (controle negativo)", async () => {
    rpcMock.mockResolvedValue({ data: "inconsistente", error: null });
    const res = await proxy(criarRequestAutenticado("/central"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/acesso/vinculo-inconsistente");
  });

  it("as 2 RPCs (vínculo + ativo, C2.4-P1) são chamadas com o nome exato e SEM nenhum argumento (nunca user_id/empresa_id)", async () => {
    rpcMock.mockImplementation(async (nome: string) => {
      if (nome === "usuario_atual_esta_ativo") {
        return { data: true, error: null };
      }
      return { data: "coerente", error: null };
    });
    await proxy(criarRequestAutenticado("/central"));
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock).toHaveBeenNthCalledWith(1, "resolver_consistencia_vinculo_operacional_atual");
    expect(rpcMock).toHaveBeenNthCalledWith(2, "usuario_atual_esta_ativo");
    expect(rpcMock.mock.calls[0]).toHaveLength(1);
    expect(rpcMock.mock.calls[1]).toHaveLength(1);
  });

  it("rotas isentas nunca chamam a RPC, mesmo com sessão válida", async () => {
    await proxy(criarRequestAutenticado("/acesso/vinculo-inconsistente"));
    await proxy(criarRequestAutenticado("/acesso/verificacao-indisponivel"));
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("proxy — preservação de cookies renovados no redirect", () => {
  it("cookie definido via setAll (simulando renovação real) aparece no NextResponse.redirect devolvido", async () => {
    rpcMock.mockImplementation(async () => {
      // Simula o Supabase renovando um cookie NO MEIO da chamada,
      // invocando o setAll REAL definido dentro do proxy.ts (capturado
      // via createServerClient mockado) - exercita o helper real de
      // preservação de cookies, sem exportá-lo nem editar o arquivo.
      ultimoCookiesOptions?.setAll([
        { name: "sb-teste-renovado", value: "valor-renovado-123", options: {} },
      ]);
      return { data: "inconsistente", error: null };
    });

    const res = await proxy(criarRequestAutenticado("/central"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/acesso/vinculo-inconsistente");
    expect(res.cookies.get("sb-teste-renovado")?.value).toBe("valor-renovado-123");
  });
});
