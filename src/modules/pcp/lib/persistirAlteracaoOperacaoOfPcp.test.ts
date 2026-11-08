// Etapa 65A — testes de persistirAlteracaoOperacaoOfPcp. Mesmo
// princípio de persistirCriacaoOperacaoOfPcp.test.ts.
import { describe, expect, it, vi } from "vitest";
import {
  persistirAlteracaoOperacaoOfPcp,
  classificarErroAlteracaoOperacaoOfPcp,
} from "./persistirAlteracaoOperacaoOfPcp";

function clientFalso(resposta: { data: unknown; error: { message: string } | null } | (() => never)) {
  return { rpc: vi.fn(() => (typeof resposta === "function" ? resposta() : Promise.resolve(resposta))) } as never;
}

describe("persistirAlteracaoOperacaoOfPcp", () => {
  it("1. Sucesso: erro null", async () => {
    const client = clientFalso({ data: null, error: null });
    const resultado = await persistirAlteracaoOperacaoOfPcp(client, "op-1", "user-1", "recurso-2", 45, 2, "ajuste de recurso");
    expect(resultado).toEqual({ erro: null });
  });

  it("2. Erro limpo (OP com apontamento): nunca marca gravacaoIncerta", async () => {
    const client = clientFalso({
      data: null,
      error: { message: "alterar_y_operacao: OP op-1 ja tem execucao registrada - planejamento (Y) bloqueado apos inicio." },
    });
    const resultado = await persistirAlteracaoOperacaoOfPcp(client, "op-1", "user-1", null, null, null, "motivo");
    expect(resultado.gravacaoIncerta).toBeUndefined();
    expect(resultado.erro).toContain("ja tem execucao registrada");
  });

  it("3. Falha de rede: marca gravacaoIncerta=true", async () => {
    const client = clientFalso(() => {
      throw new Error("timeout");
    });
    const resultado = await persistirAlteracaoOperacaoOfPcp(client, "op-1", "user-1", null, null, null, "motivo");
    expect(resultado.gravacaoIncerta).toBe(true);
  });

  it("4. Chama a RPC com p_alterado_por sempre o id real passado", async () => {
    const rpcMock = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const client = { rpc: rpcMock } as never;
    await persistirAlteracaoOperacaoOfPcp(client, "op-9", "usuario-real-9", null, 20, null, "ajuste");
    expect(rpcMock).toHaveBeenCalledWith("alterar_y_operacao", {
      p_op_id: "op-9",
      p_alterado_por: "usuario-real-9",
      p_recurso_vigente_id: null,
      p_tempo_vigente_minutos: 20,
      p_sequencia_vigente: null,
      p_motivo: "ajuste",
    });
  });
});

describe("classificarErroAlteracaoOperacaoOfPcp", () => {
  it("5. Classifica cada mensagem técnica real conhecida", () => {
    expect(classificarErroAlteracaoOperacaoOfPcp("alterar_y_operacao: OP x ja tem execucao registrada - planejamento (Y) bloqueado apos inicio.")).toBe(
      "apontamento_bloqueado",
    );
    expect(classificarErroAlteracaoOperacaoOfPcp("OF x esta em estado final (concluida) - nenhuma OP pode ser criada/alterada.")).toBe(
      "of_estado_final",
    );
    expect(classificarErroAlteracaoOperacaoOfPcp("OP x nao encontrada.")).toBe("op_nao_encontrada");
    expect(classificarErroAlteracaoOperacaoOfPcp("algo inesperado")).toBe("erro_desconhecido");
  });

  it("6. Classifica OF em estado final para os 3 estados reais do trigger (Etapa 65I)", () => {
    // Mensagem real do trigger ordens_fabricacao_operacoes_impedir_apos_encerramento
    // (impedir_escrita_operacao_of_encerrada), confirmada em produção na Etapa 65H.1.
    for (const estado of ["concluida", "cancelada", "desdobrada"]) {
      expect(
        classificarErroAlteracaoOperacaoOfPcp(
          `OF x esta em estado final (${estado}) - nenhuma OP pode ser criada/alterada (operacoes comuns ficam congeladas apos concluida/cancelada/desdobrada).`,
        ),
      ).toBe("of_estado_final");
    }
  });

  it("7. Nao confunde erro inesperado com estado final, e preserva bloqueio de apontamento (Etapa 65I)", () => {
    expect(classificarErroAlteracaoOperacaoOfPcp("conexao com o banco de dados perdida inesperadamente")).toBe("erro_desconhecido");
    expect(
      classificarErroAlteracaoOperacaoOfPcp("alterar_y_operacao: OP x ja tem execucao registrada - planejamento (Y) bloqueado apos inicio."),
    ).toBe("apontamento_bloqueado");
  });
});
