// Testes diretos de provisionamentoReconciliacao.ts (GA-4C2.3-E2-R1).
// Fecha as lacunas apontadas na revisão GA-4C2.3-E2-R: até aqui, só
// existiam testes do orquestrador com buscarAuthUserPorIdentidade/
// reconciliarEstado mockados por completo - a paginação real e a
// distinção "erro de leitura" vs. "dado realmente incoerente" nunca
// tinham sido exercitadas isoladamente.
//
// vi.mock("server-only") é necessário porque este arquivo importa
// "server-only" (guard real, nunca deve sair) e o vitest roda fora do
// pipeline de build do Next - mesma técnica já usada no teste E2E
// temporário de GA-4C2.3-E2 (nunca persistido no arquivo de produção).
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { buscarAuthUserPorIdentidadeTecnica, reconciliarEstadoProvisionamento } = await import("./provisionamentoReconciliacao");

const IDENTIDADE = "11111111-1111-1111-1111-111111111111@auth.nexotfe.internal";
const AUTH_USER_ID = "22222222-2222-2222-2222-222222222222";
const EMPRESA_ID = "33333333-3333-3333-3333-333333333333";

function usuarioFake(id: string, email: string) {
  return { id, email };
}

function paginaSemMatch(tamanho: number) {
  return Array.from({ length: tamanho }, (_, i) => usuarioFake(`sem-match-${i}`, `sem-match-${i}@outra.coisa`));
}

function clienteListUsers(implementacao: (args: { page: number; perPage: number }) => Promise<{ data: { users: unknown[] } | null; error: unknown }>) {
  return { auth: { admin: { listUsers: vi.fn(implementacao) } } } as never;
}

describe("buscarAuthUserPorIdentidadeTecnica", () => {
  it("1. encontrado na primeira página -> encontrado", async () => {
    const cliente = clienteListUsers(async () => ({
      data: { users: [usuarioFake(AUTH_USER_ID, IDENTIDADE), ...paginaSemMatch(199)] },
      error: null,
    }));

    const resultado = await buscarAuthUserPorIdentidadeTecnica(cliente, IDENTIDADE);

    expect(resultado).toEqual({ resultado: "encontrado", authUserId: AUTH_USER_ID });
  });

  it("2. encontrado em página subsequente (não na primeira) -> encontrado, para de paginar", async () => {
    const listUsers = vi.fn(async ({ page }: { page: number }) => {
      if (page === 1) return { data: { users: paginaSemMatch(200) }, error: null };
      if (page === 2) return { data: { users: [usuarioFake(AUTH_USER_ID, IDENTIDADE), ...paginaSemMatch(199)] }, error: null };
      throw new Error("não deveria pedir página 3 - já encontrou na página 2");
    });
    const cliente = { auth: { admin: { listUsers } } } as never;

    const resultado = await buscarAuthUserPorIdentidadeTecnica(cliente, IDENTIDADE);

    expect(resultado).toEqual({ resultado: "encontrado", authUserId: AUTH_USER_ID });
    expect(listUsers).toHaveBeenCalledTimes(2);
  });

  it("3. página curta confirma fim real da paginação, sem match -> nao_encontrado", async () => {
    const cliente = clienteListUsers(async () => ({ data: { users: paginaSemMatch(3) }, error: null }));

    const resultado = await buscarAuthUserPorIdentidadeTecnica(cliente, IDENTIDADE);

    expect(resultado).toEqual({ resultado: "nao_encontrado" });
  });

  it("4. teto de 50 páginas cheias sem decisão -> inconclusivo (nunca conclui ausência)", async () => {
    const listUsers = vi.fn(async () => ({ data: { users: paginaSemMatch(200) }, error: null }));
    const cliente = { auth: { admin: { listUsers } } } as never;

    const resultado = await buscarAuthUserPorIdentidadeTecnica(cliente, IDENTIDADE);

    expect(resultado).toEqual({ resultado: "inconclusivo" });
    expect(listUsers).toHaveBeenCalledTimes(50);
  });

  it("5. listUsers retorna erro -> inconclusivo", async () => {
    const cliente = clienteListUsers(async () => ({ data: null, error: { message: "falhou" } }));

    const resultado = await buscarAuthUserPorIdentidadeTecnica(cliente, IDENTIDADE);

    expect(resultado).toEqual({ resultado: "inconclusivo" });
  });

  it("6. exceção/transporte durante listUsers -> inconclusivo", async () => {
    const cliente = clienteListUsers(async () => {
      throw new Error("rede caiu");
    });

    const resultado = await buscarAuthUserPorIdentidadeTecnica(cliente, IDENTIDADE);

    expect(resultado).toEqual({ resultado: "inconclusivo" });
  });

  it("7. mais de um encontrado (ambiguidade) -> inconclusivo, nunca escolhe um dos dois", async () => {
    const cliente = clienteListUsers(async () => ({
      data: { users: [usuarioFake("id-a", IDENTIDADE), usuarioFake("id-b", IDENTIDADE), ...paginaSemMatch(198)] },
      error: null,
    }));

    const resultado = await buscarAuthUserPorIdentidadeTecnica(cliente, IDENTIDADE);

    expect(resultado).toEqual({ resultado: "inconclusivo" });
  });
});

type ResultadoLeitura = { data: unknown; error: unknown };

function clienteReconciliacao(profiles: ResultadoLeitura, usuarios: ResultadoLeitura) {
  const resultados: Record<string, ResultadoLeitura> = { profiles, usuarios };
  return {
    from: (tabela: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => resultados[tabela],
        }),
      }),
    }),
  } as never;
}

describe("reconciliarEstadoProvisionamento", () => {
  it("A. profiles+usuarios coerentes (empresa/nível concordam, grupo_id preenchido) -> coerente", async () => {
    const cliente = clienteReconciliacao(
      { data: { id: AUTH_USER_ID, empresa_id: EMPRESA_ID, nivel_acesso: "comum", grupo_id: "grupo-x" }, error: null },
      { data: { id: AUTH_USER_ID, empresa_id: EMPRESA_ID, nivel_acesso: "comum" }, error: null },
    );

    const resultado = await reconciliarEstadoProvisionamento(cliente, AUTH_USER_ID);

    expect(resultado).toEqual({ estado: "coerente", empresaId: EMPRESA_ID });
  });

  it("B. nenhum dos dois existe -> nenhum", async () => {
    const cliente = clienteReconciliacao({ data: null, error: null }, { data: null, error: null });

    const resultado = await reconciliarEstadoProvisionamento(cliente, AUTH_USER_ID);

    expect(resultado).toEqual({ estado: "nenhum" });
  });

  it("C. só profiles existe -> parcial", async () => {
    const cliente = clienteReconciliacao(
      { data: { id: AUTH_USER_ID, empresa_id: EMPRESA_ID, nivel_acesso: "comum", grupo_id: "grupo-x" }, error: null },
      { data: null, error: null },
    );

    const resultado = await reconciliarEstadoProvisionamento(cliente, AUTH_USER_ID);

    expect(resultado).toEqual({ estado: "parcial", empresaId: EMPRESA_ID });
  });

  it("D. ambos existem mas nivel_acesso diverge -> parcial", async () => {
    const cliente = clienteReconciliacao(
      { data: { id: AUTH_USER_ID, empresa_id: EMPRESA_ID, nivel_acesso: "admin", grupo_id: "grupo-x" }, error: null },
      { data: { id: AUTH_USER_ID, empresa_id: EMPRESA_ID, nivel_acesso: "comum" }, error: null },
    );

    const resultado = await reconciliarEstadoProvisionamento(cliente, AUTH_USER_ID);

    expect(resultado).toEqual({ estado: "parcial", empresaId: EMPRESA_ID });
  });

  it("D2. ambos existem e concordam, mas grupo_id ainda não preenchido -> parcial", async () => {
    const cliente = clienteReconciliacao(
      { data: { id: AUTH_USER_ID, empresa_id: EMPRESA_ID, nivel_acesso: "comum", grupo_id: null }, error: null },
      { data: { id: AUTH_USER_ID, empresa_id: EMPRESA_ID, nivel_acesso: "comum" }, error: null },
    );

    const resultado = await reconciliarEstadoProvisionamento(cliente, AUTH_USER_ID);

    expect(resultado).toEqual({ estado: "parcial", empresaId: EMPRESA_ID });
  });

  it("E1. erro na leitura de profiles -> inconclusivo (nunca 'parcial', nunca 'nenhum')", async () => {
    const cliente = clienteReconciliacao({ data: null, error: { message: "falhou" } }, { data: null, error: null });

    const resultado = await reconciliarEstadoProvisionamento(cliente, AUTH_USER_ID);

    expect(resultado).toEqual({ estado: "inconclusivo", empresaId: null });
  });

  it("E2. erro na leitura de usuarios -> inconclusivo", async () => {
    const cliente = clienteReconciliacao({ data: null, error: null }, { data: null, error: { message: "falhou" } });

    const resultado = await reconciliarEstadoProvisionamento(cliente, AUTH_USER_ID);

    expect(resultado).toEqual({ estado: "inconclusivo", empresaId: null });
  });
});
