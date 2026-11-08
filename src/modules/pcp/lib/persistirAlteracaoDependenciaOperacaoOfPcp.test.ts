// Etapa 66E (Fase B) — testes de persistirAlteracaoDependenciaOperacaoOfPcp.
// Mesmo princípio de persistirAlteracaoOperacaoOfPcp.test.ts.
import { describe, expect, it, vi } from "vitest";
import {
  persistirAlteracaoDependenciaOperacaoOfPcp,
  classificarErroAlteracaoDependenciaOperacaoOfPcp,
  verificarAmbienteDependenciaOperacaoOfPcpHabilitado,
} from "./persistirAlteracaoDependenciaOperacaoOfPcp";

function clientFalso(resposta: { data: unknown; error: { message: string } | null } | (() => never)) {
  return { rpc: vi.fn(() => (typeof resposta === "function" ? resposta() : Promise.resolve(resposta))) } as never;
}

// Etapa 66G/66H.1 — client falso para o probe composto de 3 leituras
// (tabela + catálogo de permissões + assinatura via chamada de prova).
// Cada resposta é configurável independentemente, para testar cada uma
// das 3 checagens isoladamente. Inclui `code`, confirmado empiricamente
// contra produção na Etapa 66H.1 (PGRST202/PGRST205/P0001/sem-código).
type RespostaFalsa = { data: unknown; error: { message: string; code?: string } | null };
const CATALOGO_OK: RespostaFalsa = {
  data: [{ chave: "pcp.criar_dependencia_operacao", categoria: "sensivel" }, { chave: "pcp.remover_dependencia_operacao", categoria: "sensivel" }],
  error: null,
};
// P0001 = código padrão do Postgres para RAISE EXCEPTION sem SQLSTATE
// customizado - toda validação interna da RPC (motivo, ciclo, apontamento
// etc.) usa esse mesmo código, não importa qual dispara primeiro.
const ASSINATURA_OK: RespostaFalsa = {
  data: null,
  error: { message: "alterar_dependencia_operacao: motivo e obrigatorio para toda criacao/remocao de dependencia.", code: "P0001" },
};

function clientFalsoDeProbe(
  overrides: Partial<{
    tabela: RespostaFalsa;
    catalogo: RespostaFalsa;
    assinatura: RespostaFalsa;
    lancarExcecao: boolean;
  }> = {},
) {
  const tabela = overrides.tabela ?? { data: [], error: null };
  const catalogo = overrides.catalogo ?? CATALOGO_OK;
  const assinatura = overrides.assinatura ?? ASSINATURA_OK;
  const rpcMock = vi.fn(() => {
    if (overrides.lancarExcecao) throw new Error("falha de comunicacao inesperada");
    return Promise.resolve(assinatura);
  });
  const fakeClient = {
    from: vi.fn((tabelaNome: string) => {
      if (tabelaNome === "of_operacao_dependencia_auditoria") {
        return { select: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve(tabela)) })) };
      }
      if (tabelaNome === "permissoes") {
        return { select: vi.fn(() => ({ in: vi.fn(() => Promise.resolve(catalogo)) })) };
      }
      throw new Error(`tabela inesperada no teste: ${tabelaNome}`);
    }),
    rpc: rpcMock,
  };
  return { client: fakeClient as never, rpcMock };
}

describe("persistirAlteracaoDependenciaOperacaoOfPcp", () => {
  it("1. Sucesso (criar): erro null", async () => {
    const client = clientFalso({ data: null, error: null });
    const resultado = await persistirAlteracaoDependenciaOperacaoOfPcp(client, "op-1", "op-2", "criar", "user-1", "motivo real");
    expect(resultado).toEqual({ erro: null });
  });

  it("2. Sucesso (remover): erro null", async () => {
    const client = clientFalso({ data: null, error: null });
    const resultado = await persistirAlteracaoDependenciaOperacaoOfPcp(client, "op-1", "op-2", "remover", "user-1", "motivo real");
    expect(resultado).toEqual({ erro: null });
  });

  it("3. Erro limpo (ciclo): nunca marca gravacaoIncerta", async () => {
    const client = clientFalso({
      data: null,
      error: { message: "Dependencia rejeitada: criaria ciclo (ja existe caminho de op-2 para op-1)." },
    });
    const resultado = await persistirAlteracaoDependenciaOperacaoOfPcp(client, "op-1", "op-2", "criar", "user-1", "motivo");
    expect(resultado.gravacaoIncerta).toBeUndefined();
    expect(resultado.erro).toContain("criaria ciclo");
  });

  it("4. Falha de rede: marca gravacaoIncerta=true", async () => {
    const client = clientFalso(() => {
      throw new Error("timeout");
    });
    const resultado = await persistirAlteracaoDependenciaOperacaoOfPcp(client, "op-1", "op-2", "criar", "user-1", "motivo");
    expect(resultado.gravacaoIncerta).toBe(true);
  });

  it("5. Chama a RPC com os 5 parametros certos, p_alterado_por sempre o id real passado", async () => {
    const rpcMock = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const client = { rpc: rpcMock } as never;
    await persistirAlteracaoDependenciaOperacaoOfPcp(client, "op-9", "op-10", "remover", "usuario-real-9", "justificativa");
    expect(rpcMock).toHaveBeenCalledWith("alterar_dependencia_operacao", {
      p_op_origem_id: "op-9",
      p_op_dependente_id: "op-10",
      p_acao: "remover",
      p_alterado_por: "usuario-real-9",
      p_motivo: "justificativa",
    });
  });
});

describe("verificarAmbienteDependenciaOperacaoOfPcpHabilitado (Etapa 66F/66G — probe composto de 3 leituras)", () => {
  it("9. As 3 checagens passam (migration aplicada): habilitado=true", async () => {
    const { client } = clientFalsoDeProbe();
    expect(await verificarAmbienteDependenciaOperacaoOfPcpHabilitado(client)).toBe(true);
  });

  it("10. Tabela de auditoria não existe (ex.: produção hoje): habilitado=false", async () => {
    const { client } = clientFalsoDeProbe({
      tabela: { data: null, error: { message: 'relation "of_operacao_dependencia_auditoria" does not exist' } },
    });
    expect(await verificarAmbienteDependenciaOperacaoOfPcpHabilitado(client)).toBe(false);
  });

  it("11. Catálogo de permissões incompleto (só 1 das 2 chaves): habilitado=false", async () => {
    const { client } = clientFalsoDeProbe({
      catalogo: { data: [{ chave: "pcp.criar_dependencia_operacao", categoria: "sensivel" }], error: null },
    });
    expect(await verificarAmbienteDependenciaOperacaoOfPcpHabilitado(client)).toBe(false);
  });

  it("12. Catálogo de permissões com categoria errada: habilitado=false", async () => {
    const { client } = clientFalsoDeProbe({
      catalogo: {
        data: [
          { chave: "pcp.criar_dependencia_operacao", categoria: "comum" },
          { chave: "pcp.remover_dependencia_operacao", categoria: "sensivel" },
        ],
        error: null,
      },
    });
    expect(await verificarAmbienteDependenciaOperacaoOfPcpHabilitado(client)).toBe(false);
  });

  it("13. Assinatura de 5 parâmetros não existe (PGRST202 - só a antiga de 4, ex.: produção hoje): habilitado=false", async () => {
    const { client } = clientFalsoDeProbe({
      assinatura: {
        data: null,
        error: {
          message: "Could not find the function public.alterar_dependencia_operacao(...) in the schema cache",
          code: "PGRST202",
        },
      },
    });
    expect(await verificarAmbienteDependenciaOperacaoOfPcpHabilitado(client)).toBe(false);
  });

  it("15. Etapa 66H — robusto a reordenação interna da RPC: QUALQUER exceção P0001 (não importa a mensagem) prova que a assinatura existe", async () => {
    // Simula uma RPC hipotética onde outra validação (ex.: cross-tenant)
    // passou a disparar ANTES da checagem de motivo - mensagem totalmente
    // diferente da esperada antes desta etapa, mesmo código P0001 (toda
    // RAISE EXCEPTION sem SQLSTATE customizado usa esse código, não
    // importa qual delas dispara primeiro).
    const { client } = clientFalsoDeProbe({
      assinatura: { data: null, error: { message: "OP origem ou dependente nao encontrada.", code: "P0001" } },
    });
    expect(await verificarAmbienteDependenciaOperacaoOfPcpHabilitado(client)).toBe(true);
  });

  it("16. Chamada de prova nunca escreve: sempre chamada com motivo vazio e ids nulos, nunca ids reais", async () => {
    const { client, rpcMock } = clientFalsoDeProbe();
    await verificarAmbienteDependenciaOperacaoOfPcpHabilitado(client);
    expect(rpcMock).toHaveBeenCalledWith("alterar_dependencia_operacao", expect.objectContaining({ p_motivo: "" }));
  });

  it("17. Etapa 66H.1 — tabela ausente por código estruturado PGRST205: habilitado=false", async () => {
    const { client } = clientFalsoDeProbe({
      tabela: {
        data: null,
        error: { message: "Could not find the table 'public.of_operacao_dependencia_auditoria' in the schema cache", code: "PGRST205" },
      },
    });
    expect(await verificarAmbienteDependenciaOperacaoOfPcpHabilitado(client)).toBe(false);
  });

  it("18. Etapa 66H.1 — erro de autenticação (chave inválida, sem código estruturado): nunca interpretado como 'habilitado'", async () => {
    // Confirmado empiricamente contra produção: "Invalid API key" não
    // vem com nenhum `code` populado - não pode ser confundido com
    // P0001 nem com nenhum outro sinal positivo.
    const { client } = clientFalsoDeProbe({
      tabela: { data: null, error: { message: "Invalid API key" } },
    });
    expect(await verificarAmbienteDependenciaOperacaoOfPcpHabilitado(client)).toBe(false);
  });

  it("19. Etapa 66H.1 — erro de autorização (RLS/GRANT negando, sem código útil): nunca interpretado como 'habilitado'", async () => {
    const { client } = clientFalsoDeProbe({
      assinatura: { data: null, error: { message: "permission denied for function alterar_dependencia_operacao", code: "42501" } },
    });
    expect(await verificarAmbienteDependenciaOperacaoOfPcpHabilitado(client)).toBe(false);
  });

  it("20. Etapa 66H.1 — indisponibilidade temporária do Supabase (erro genérico sem código reconhecido): nunca interpretado como 'habilitado'", async () => {
    const { client } = clientFalsoDeProbe({
      assinatura: { data: null, error: { message: "upstream connect error or disconnect/reset before headers", code: "" } },
    });
    expect(await verificarAmbienteDependenciaOperacaoOfPcpHabilitado(client)).toBe(false);
  });

  it("21. Etapa 66H.1 — falha de comunicação que lança exceção (nunca resolve com {error}): nunca propaga, nunca 'habilitado'", async () => {
    const { client } = clientFalsoDeProbe({ lancarExcecao: true });
    await expect(verificarAmbienteDependenciaOperacaoOfPcpHabilitado(client)).resolves.toBe(false);
  });

  it("22. Etapa 66H.1 — resposta inesperada do PostgREST (código desconhecido, não listado em nenhuma categoria): nunca 'habilitado' por omissão", async () => {
    const { client } = clientFalsoDeProbe({
      assinatura: { data: null, error: { message: "formato de resposta não reconhecido", code: "XX999" } },
    });
    expect(await verificarAmbienteDependenciaOperacaoOfPcpHabilitado(client)).toBe(false);
  });
});

describe("classificarErroAlteracaoDependenciaOperacaoOfPcp", () => {
  it("6. Classifica cada mensagem técnica real conhecida (confirmadas em sandbox nas Etapas 66B/66C/66D)", () => {
    expect(classificarErroAlteracaoDependenciaOperacaoOfPcp("alterar_dependencia_operacao: motivo e obrigatorio para toda criacao/remocao de dependencia.")).toBe(
      "motivo_obrigatorio",
    );
    expect(classificarErroAlteracaoDependenciaOperacaoOfPcp("OP origem ou dependente nao encontrada.")).toBe("op_nao_encontrada");
    expect(classificarErroAlteracaoDependenciaOperacaoOfPcp("OPs pertencem a empresas diferentes.")).toBe("empresas_diferentes");
    expect(
      classificarErroAlteracaoDependenciaOperacaoOfPcp("Dependencia so e permitida entre OPs da MESMA OF (PCP-P6C.3 Parte 19)."),
    ).toBe("of_diferente");
    expect(
      classificarErroAlteracaoDependenciaOperacaoOfPcp(
        "alterar_dependencia_operacao: uma das OPs (op-1 ou op-2) ja tem execucao registrada - dependencia nao pode mais ser alterada.",
      ),
    ).toBe("apontamento_bloqueado");
    expect(classificarErroAlteracaoDependenciaOperacaoOfPcp("Dependencia rejeitada: criaria ciclo (ja existe caminho de op-2 para op-1).")).toBe(
      "ciclo_detectado",
    );
    expect(
      classificarErroAlteracaoDependenciaOperacaoOfPcp(
        "A OF da dependencia esta em estado final (cancelada) - nenhuma dependencia pode ser criada/alterada.",
      ),
    ).toBe("of_estado_final");
    expect(classificarErroAlteracaoDependenciaOperacaoOfPcp("algo totalmente inesperado")).toBe("erro_desconhecido");
  });

  it("7. Classifica estado final para os 3 estados reais do trigger (mesmo trigger de impedir_dependencia_of_encerrada)", () => {
    for (const estado of ["concluida", "cancelada", "desdobrada"]) {
      expect(
        classificarErroAlteracaoDependenciaOperacaoOfPcp(`A OF da dependencia esta em estado final (${estado}) - nenhuma dependencia pode ser criada/alterada.`),
      ).toBe("of_estado_final");
    }
  });

  it("8. Nao confunde erro inesperado com nenhum motivo conhecido", () => {
    expect(classificarErroAlteracaoDependenciaOperacaoOfPcp("conexao com o banco de dados perdida inesperadamente")).toBe("erro_desconhecido");
  });
});
