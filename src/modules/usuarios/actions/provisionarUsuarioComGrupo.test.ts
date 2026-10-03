// Testes do orquestrador de provisionamento (GA-4C2.3-E2).
//
// NÍVEL DESTE TESTE: orquestração com dependências injetadas (mocks em
// memória, sem rede, sem Supabase real). NÃO é um teste end-to-end nem
// de integração - não prova que o Auth/RPC reais se comportam assim;
// prova que a FUNÇÃO orquestradora, dado um conjunto de dependências
// que respeitam os contratos declarados, toma as decisões corretas na
// ordem certa. A fidelidade do adaptador real
// (provisionamentoAdaptadoresSupabase.ts) a este contrato é verificada
// separadamente pelo teste de integração contra stack local real.
import { describe, expect, it, vi } from "vitest";
import {
  provisionarUsuarioComGrupo,
  type DependenciasProvisionamento,
  type PayloadProvisionamentoBruto,
} from "./provisionarUsuarioComGrupo";
import { CODIGOS_ERRO_PROVISIONAMENTO } from "../lib/provisionamentoErros";

const SESSION_USER_ID = "11111111-1111-1111-1111-111111111111";
const EMPRESA_CRIADOR_ID = "22222222-2222-2222-2222-222222222222";
const AUTH_USER_ID = "33333333-3333-3333-3333-333333333333";
const GRUPO_ID = "44444444-4444-4444-4444-444444444444";

const PAYLOAD_VALIDO: PayloadProvisionamentoBruto = {
  nome: "  Maria Teste  ",
  emailComercial: "  Maria.Teste@Empresa.com  ",
  grupoId: GRUPO_ID,
};

function criarDependenciasFelizes(overrides: Partial<DependenciasProvisionamento> = {}): DependenciasProvisionamento {
  return {
    obterUsuarioSessao: vi.fn(async () => ({ id: SESSION_USER_ID })),
    obterEmpresaIdCriador: vi.fn(async () => EMPRESA_CRIADOR_ID),
    criarAuthUser: vi.fn(async () => ({ conclusivo: true as const, ok: true as const, authUserId: AUTH_USER_ID })),
    buscarAuthUserPorIdentidade: vi.fn(async () => ({ resultado: "nao_encontrado" as const })),
    chamarRpcProvisionamento: vi.fn(async () => ({ conclusivo: true as const, ok: true as const })),
    deletarAuthUser: vi.fn(async () => ({ conclusivo: true as const, ok: true })),
    reconciliarEstado: vi.fn(async () => ({ estado: "nenhum" as const })),
    registrarIncidente: vi.fn(async () => true),
    ...overrides,
  };
}

describe("provisionarUsuarioComGrupo", () => {
  it("1. sem sessão -> 401 SESSAO_INVALIDA, nenhuma escrita", async () => {
    const deps = criarDependenciasFelizes({ obterUsuarioSessao: vi.fn(async () => null) });

    const resultado = await provisionarUsuarioComGrupo(deps, PAYLOAD_VALIDO);

    expect(resultado).toEqual({
      ok: false,
      status: 401,
      error: { code: CODIGOS_ERRO_PROVISIONAMENTO.SESSAO_INVALIDA, message: "Sessão inválida." },
    });
    expect(deps.criarAuthUser).not.toHaveBeenCalled();
    expect(deps.chamarRpcProvisionamento).not.toHaveBeenCalled();
  });

  it("2. payload inválido (nome vazio, e-mail inválido, grupo não-UUID) -> 400, nenhuma escrita", async () => {
    const deps = criarDependenciasFelizes();

    const semNome = await provisionarUsuarioComGrupo(deps, { ...PAYLOAD_VALIDO, nome: "   " });
    expect(semNome).toMatchObject({ ok: false, status: 400, error: { code: CODIGOS_ERRO_PROVISIONAMENTO.ENTRADA_INVALIDA } });

    const emailInvalido = await provisionarUsuarioComGrupo(deps, { ...PAYLOAD_VALIDO, emailComercial: "sem-arroba" });
    expect(emailInvalido).toMatchObject({ ok: false, status: 400, error: { code: CODIGOS_ERRO_PROVISIONAMENTO.ENTRADA_INVALIDA } });

    const grupoInvalido = await provisionarUsuarioComGrupo(deps, { ...PAYLOAD_VALIDO, grupoId: "nao-e-uuid" });
    expect(grupoInvalido).toMatchObject({ ok: false, status: 400, error: { code: CODIGOS_ERRO_PROVISIONAMENTO.ENTRADA_INVALIDA } });

    expect(deps.criarAuthUser).not.toHaveBeenCalled();
  });

  it("3. createUser sucesso + RPC sucesso -> 201", async () => {
    const deps = criarDependenciasFelizes();

    const resultado = await provisionarUsuarioComGrupo(deps, PAYLOAD_VALIDO);

    expect(resultado).toEqual({ ok: true, status: 201, usuarioId: AUTH_USER_ID });
    expect(deps.deletarAuthUser).not.toHaveBeenCalled();
    expect(deps.registrarIncidente).not.toHaveBeenCalled();
  });

  it("4. createUser erro conclusivo -> 502 FALHA_AUTH, RPC nunca chamada", async () => {
    const deps = criarDependenciasFelizes({ criarAuthUser: vi.fn(async () => ({ conclusivo: true as const, ok: false as const })) });

    const resultado = await provisionarUsuarioComGrupo(deps, PAYLOAD_VALIDO);

    expect(resultado).toEqual({
      ok: false,
      status: 502,
      error: { code: CODIGOS_ERRO_PROVISIONAMENTO.FALHA_AUTH, message: "Falha ao criar identidade de autenticação." },
    });
    expect(deps.chamarRpcProvisionamento).not.toHaveBeenCalled();
    expect(deps.deletarAuthUser).not.toHaveBeenCalled();
  });

  it("5. RPC criador não autorizado + delete sucesso -> 403", async () => {
    const deps = criarDependenciasFelizes({
      chamarRpcProvisionamento: vi.fn(async () => ({
        conclusivo: true as const,
        ok: false as const,
        mensagem: "Criador não autorizado para provisionar usuários.",
      })),
    });

    const resultado = await provisionarUsuarioComGrupo(deps, PAYLOAD_VALIDO);

    expect(resultado).toEqual({
      ok: false,
      status: 403,
      error: { code: CODIGOS_ERRO_PROVISIONAMENTO.RPC_CRIADOR_NAO_AUTORIZADO, message: "Criador não autorizado para provisionar usuários." },
    });
    expect(deps.deletarAuthUser).toHaveBeenCalledWith(AUTH_USER_ID);
    expect(deps.registrarIncidente).not.toHaveBeenCalled();
  });

  it("6. grupo inválido + delete sucesso -> 404", async () => {
    const deps = criarDependenciasFelizes({
      chamarRpcProvisionamento: vi.fn(async () => ({
        conclusivo: true as const,
        ok: false as const,
        mensagem: "Grupo de acesso não encontrado para a empresa atual.",
      })),
    });

    const resultado = await provisionarUsuarioComGrupo(deps, PAYLOAD_VALIDO);

    expect(resultado).toEqual({
      ok: false,
      status: 404,
      error: { code: CODIGOS_ERRO_PROVISIONAMENTO.RPC_GRUPO_INVALIDO, message: "Grupo de acesso não encontrado para a empresa atual." },
    });
    expect(deps.registrarIncidente).not.toHaveBeenCalled();
  });

  it("7. e-mail duplicado + delete sucesso -> 409", async () => {
    const deps = criarDependenciasFelizes({
      chamarRpcProvisionamento: vi.fn(async () => ({
        conclusivo: true as const,
        ok: false as const,
        mensagem: "Já existe um usuário com este e-mail nesta empresa.",
      })),
    });

    const resultado = await provisionarUsuarioComGrupo(deps, PAYLOAD_VALIDO);

    expect(resultado).toEqual({
      ok: false,
      status: 409,
      error: { code: CODIGOS_ERRO_PROVISIONAMENTO.RPC_EMAIL_DUPLICADO, message: "Já existe um usuário com este e-mail nesta empresa." },
    });
    expect(deps.registrarIncidente).not.toHaveBeenCalled();
  });

  it("8. erro RPC desconhecido + delete sucesso -> 500, mensagem genérica (nunca SQL bruto)", async () => {
    const deps = criarDependenciasFelizes({
      chamarRpcProvisionamento: vi.fn(async () => ({
        conclusivo: true as const,
        ok: false as const,
        mensagem: "ERROR: coluna xyz não existe (detalhe interno do banco)",
      })),
    });

    const resultado = await provisionarUsuarioComGrupo(deps, PAYLOAD_VALIDO);

    expect(resultado).toMatchObject({ ok: false, status: 500, error: { code: CODIGOS_ERRO_PROVISIONAMENTO.RPC_ERRO_INESPERADO } });
    if (!resultado.ok) {
      expect(resultado.error.message).not.toContain("xyz");
      expect(resultado.error.message).not.toContain("coluna");
    }
    expect(deps.registrarIncidente).not.toHaveBeenCalled();
  });

  it("9. erro RPC + delete falha -> incidente orfao_auth + 500", async () => {
    const registrarIncidente = vi.fn(async () => true);
    const deps = criarDependenciasFelizes({
      chamarRpcProvisionamento: vi.fn(async () => ({
        conclusivo: true as const,
        ok: false as const,
        mensagem: "Já existe um usuário com este e-mail nesta empresa.",
      })),
      deletarAuthUser: vi.fn(async () => ({ conclusivo: true as const, ok: false })),
      registrarIncidente,
    });

    const resultado = await provisionarUsuarioComGrupo(deps, PAYLOAD_VALIDO);

    expect(resultado).toMatchObject({ ok: false, status: 500, error: { code: CODIGOS_ERRO_PROVISIONAMENTO.FALHA_INTERNA } });
    expect(registrarIncidente).toHaveBeenCalledTimes(1);
    expect(registrarIncidente).toHaveBeenCalledWith(
      expect.objectContaining({
        authUserId: AUTH_USER_ID,
        empresaId: EMPRESA_CRIADOR_ID,
        etapa: "compensacao",
        estadoResultante: "orfao_auth",
        codigoErroCompensacao: CODIGOS_ERRO_PROVISIONAMENTO.COMPENSACAO_ERROR,
      }),
    );
  });

  it("10. timeout RPC + profiles/usuarios coerentes -> 201, nunca apaga Auth", async () => {
    const deletarAuthUser = vi.fn(async () => ({ conclusivo: true as const, ok: true }));
    const deps = criarDependenciasFelizes({
      chamarRpcProvisionamento: vi.fn(async () => ({ conclusivo: false as const })),
      reconciliarEstado: vi.fn(async () => ({ estado: "coerente" as const, empresaId: EMPRESA_CRIADOR_ID })),
      deletarAuthUser,
    });

    const resultado = await provisionarUsuarioComGrupo(deps, PAYLOAD_VALIDO);

    expect(resultado).toEqual({ ok: true, status: 201, usuarioId: AUTH_USER_ID });
    expect(deletarAuthUser).not.toHaveBeenCalled();
  });

  it("11. timeout RPC + nenhum registro + delete sucesso -> 500, sem incidente", async () => {
    const registrarIncidente = vi.fn(async () => true);
    const deps = criarDependenciasFelizes({
      chamarRpcProvisionamento: vi.fn(async () => ({ conclusivo: false as const })),
      reconciliarEstado: vi.fn(async () => ({ estado: "nenhum" as const })),
      registrarIncidente,
    });

    const resultado = await provisionarUsuarioComGrupo(deps, PAYLOAD_VALIDO);

    expect(resultado).toMatchObject({ ok: false, status: 500, error: { code: CODIGOS_ERRO_PROVISIONAMENTO.FALHA_INTERNA } });
    expect(registrarIncidente).not.toHaveBeenCalled();
  });

  it("12. timeout RPC + estado parcial -> incidente parcial_incoerente + 503, nunca apaga", async () => {
    const registrarIncidente = vi.fn(async () => true);
    const deletarAuthUser = vi.fn(async () => ({ conclusivo: true as const, ok: true }));
    const deps = criarDependenciasFelizes({
      chamarRpcProvisionamento: vi.fn(async () => ({ conclusivo: false as const })),
      reconciliarEstado: vi.fn(async () => ({ estado: "parcial" as const, empresaId: EMPRESA_CRIADOR_ID })),
      deletarAuthUser,
      registrarIncidente,
    });

    const resultado = await provisionarUsuarioComGrupo(deps, PAYLOAD_VALIDO);

    expect(resultado).toEqual({
      ok: false,
      status: 503,
      error: {
        code: CODIGOS_ERRO_PROVISIONAMENTO.RECONCILIACAO_PENDENTE,
        message: "Estado do provisionamento pendente de verificação. Contate o suporte.",
      },
    });
    expect(deletarAuthUser).not.toHaveBeenCalled();
    expect(registrarIncidente).toHaveBeenCalledWith(
      expect.objectContaining({ etapa: "reconciliacao", estadoResultante: "parcial_incoerente" }),
    );
  });

  it("13. timeout createUser + Auth recuperado por identidade técnica -> fluxo continua normalmente", async () => {
    const chamarRpcProvisionamento = vi.fn(async () => ({ conclusivo: true as const, ok: true as const }));
    const deps = criarDependenciasFelizes({
      criarAuthUser: vi.fn(async () => ({ conclusivo: false as const })),
      buscarAuthUserPorIdentidade: vi.fn(async () => ({ resultado: "encontrado" as const, authUserId: AUTH_USER_ID })),
      chamarRpcProvisionamento,
    });

    const resultado = await provisionarUsuarioComGrupo(deps, PAYLOAD_VALIDO);

    expect(resultado).toEqual({ ok: true, status: 201, usuarioId: AUTH_USER_ID });
    expect(chamarRpcProvisionamento).toHaveBeenCalledWith(expect.objectContaining({ pUserId: AUTH_USER_ID }));
  });

  it("14. timeout createUser + Auth comprovadamente ausente -> 502, RPC nunca chamada", async () => {
    const deps = criarDependenciasFelizes({
      criarAuthUser: vi.fn(async () => ({ conclusivo: false as const })),
      buscarAuthUserPorIdentidade: vi.fn(async () => ({ resultado: "nao_encontrado" as const })),
    });

    const resultado = await provisionarUsuarioComGrupo(deps, PAYLOAD_VALIDO);

    expect(resultado).toMatchObject({ ok: false, status: 502, error: { code: CODIGOS_ERRO_PROVISIONAMENTO.FALHA_AUTH } });
    expect(deps.chamarRpcProvisionamento).not.toHaveBeenCalled();
  });

  it("15. timeout createUser + busca também inconclusiva -> incidente auth_create/parcial_incoerente + 503", async () => {
    const registrarIncidente = vi.fn(async () => true);
    const deps = criarDependenciasFelizes({
      criarAuthUser: vi.fn(async () => ({ conclusivo: false as const })),
      buscarAuthUserPorIdentidade: vi.fn(async () => ({ resultado: "inconclusivo" as const })),
      registrarIncidente,
    });

    const resultado = await provisionarUsuarioComGrupo(deps, PAYLOAD_VALIDO);

    expect(resultado).toMatchObject({ ok: false, status: 503, error: { code: CODIGOS_ERRO_PROVISIONAMENTO.RECONCILIACAO_INCONCLUSIVA } });
    expect(registrarIncidente).toHaveBeenCalledWith(
      expect.objectContaining({ etapa: "auth_create", authUserId: null, estadoResultante: "parcial_incoerente" }),
    );
  });

  it("16. nenhum segredo/dado interno aparece no resultado devolvido", async () => {
    const deps = criarDependenciasFelizes();
    const resultado = await provisionarUsuarioComGrupo(deps, PAYLOAD_VALIDO);

    const serializado = JSON.stringify(resultado);
    expect(serializado).not.toMatch(/service_role/i);
    expect(serializado).not.toMatch(/auth\.nexotfe\.internal/);
    expect(serializado).not.toMatch(/empresa/i);
    expect(Object.keys(resultado).sort()).toEqual(["ok", "status", "usuarioId"].sort());
  });

  it("17. campos extras do payload nunca alteram autoridade (ignorados por extração seletiva)", async () => {
    const chamarRpcProvisionamento = vi.fn<DependenciasProvisionamento["chamarRpcProvisionamento"]>(async () => ({
      conclusivo: true,
      ok: true,
    }));
    const deps = criarDependenciasFelizes({ chamarRpcProvisionamento });

    const payloadAdulterado = {
      ...PAYLOAD_VALIDO,
      empresaId: "empresa-forjada",
      nivelAcesso: "admin",
      ativo: false,
      criadoPor: "outro-usuario",
      authUserId: "id-forjado",
      serviceRole: "chave-forjada",
    } as PayloadProvisionamentoBruto;

    const resultado = await provisionarUsuarioComGrupo(deps, payloadAdulterado);

    expect(resultado).toEqual({ ok: true, status: 201, usuarioId: AUTH_USER_ID });
    const chamadaRpc = chamarRpcProvisionamento.mock.calls[0][0];
    expect(Object.keys(chamadaRpc).sort()).toEqual(["pCriadoPor", "pEmailComercial", "pGrupoId", "pNome", "pUserId"].sort());
  });

  it("18. empresa_id do frontend nunca é usado (RPC nunca recebe empresa)", async () => {
    const chamarRpcProvisionamento = vi.fn<DependenciasProvisionamento["chamarRpcProvisionamento"]>(async () => ({
      conclusivo: true,
      ok: true,
    }));
    const deps = criarDependenciasFelizes({ chamarRpcProvisionamento });

    await provisionarUsuarioComGrupo(deps, { ...PAYLOAD_VALIDO, empresaId: "empresa-que-o-frontend-tentou-forcar" } as PayloadProvisionamentoBruto);

    const chamadaRpc = chamarRpcProvisionamento.mock.calls[0][0] as Record<string, unknown>;
    expect(chamadaRpc).not.toHaveProperty("empresaId");
    expect(chamadaRpc).not.toHaveProperty("pEmpresaId");
    expect(JSON.stringify(chamadaRpc)).not.toContain("empresa-que-o-frontend-tentou-forcar");
  });

  it("19. criado_por sempre vem da sessão, nunca do payload", async () => {
    const chamarRpcProvisionamento = vi.fn(async () => ({ conclusivo: true as const, ok: true as const }));
    const deps = criarDependenciasFelizes({
      obterUsuarioSessao: vi.fn(async () => ({ id: SESSION_USER_ID })),
      chamarRpcProvisionamento,
    });

    await provisionarUsuarioComGrupo(deps, { ...PAYLOAD_VALIDO, criadoPor: "usuario-forjado-pelo-cliente" } as PayloadProvisionamentoBruto);

    expect(chamarRpcProvisionamento).toHaveBeenCalledWith(expect.objectContaining({ pCriadoPor: SESSION_USER_ID }));
  });

  it("21. timeout RPC + reconciliação inconclusiva (erro de leitura) -> nunca apaga, incidente RECONCILIACAO_INCONCLUSIVA, 503", async () => {
    const registrarIncidente = vi.fn(async () => true);
    const deletarAuthUser = vi.fn(async () => ({ conclusivo: true as const, ok: true }));
    const deps = criarDependenciasFelizes({
      chamarRpcProvisionamento: vi.fn(async () => ({ conclusivo: false as const })),
      reconciliarEstado: vi.fn(async () => ({ estado: "inconclusivo" as const, empresaId: null })),
      deletarAuthUser,
      registrarIncidente,
    });

    const resultado = await provisionarUsuarioComGrupo(deps, PAYLOAD_VALIDO);

    expect(resultado).toEqual({
      ok: false,
      status: 503,
      error: {
        code: CODIGOS_ERRO_PROVISIONAMENTO.RECONCILIACAO_PENDENTE,
        message: "Estado do provisionamento pendente de verificação. Contate o suporte.",
      },
    });
    expect(deletarAuthUser).not.toHaveBeenCalled();
    expect(registrarIncidente).toHaveBeenCalledWith(
      expect.objectContaining({
        etapa: "reconciliacao",
        estadoResultante: "parcial_incoerente",
        codigoErroPrincipal: CODIGOS_ERRO_PROVISIONAMENTO.RECONCILIACAO_INCONCLUSIVA,
        empresaId: EMPRESA_CRIADOR_ID,
      }),
    );
  });

  it("22. service_role nunca aparece no bundle/client - guard de build presente nos arquivos server-only", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const arquivosServerOnly = [
      "src/lib/supabaseServiceClient.ts",
      "src/modules/usuarios/lib/provisionamentoIncidentes.ts",
      "src/modules/usuarios/lib/provisionamentoReconciliacao.ts",
      "src/modules/usuarios/lib/provisionamentoAdaptadoresSupabase.ts",
    ];

    for (const arquivo of arquivosServerOnly) {
      const conteudo = fs.readFileSync(path.join(process.cwd(), arquivo), "utf8");
      expect(conteudo).toContain('import "server-only"');
    }
  });
});
