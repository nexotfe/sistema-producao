// Etapa 65A — testes de persistirRemocaoOperacaoOfPcp. Mesmo princípio
// de persistirCriacaoOperacaoOfPcp.test.ts.
import { describe, expect, it, vi } from "vitest";
import {
  persistirRemocaoOperacaoOfPcp,
  classificarErroRemocaoOperacaoOfPcp,
} from "./persistirRemocaoOperacaoOfPcp";

function clientFalso(resposta: { data: unknown; error: { message: string } | null } | (() => never)) {
  return { rpc: vi.fn(() => (typeof resposta === "function" ? resposta() : Promise.resolve(resposta))) } as never;
}

describe("persistirRemocaoOperacaoOfPcp", () => {
  it("1. Sucesso: erro null", async () => {
    const client = clientFalso({ data: null, error: null });
    const resultado = await persistirRemocaoOperacaoOfPcp(client, "op-1", "user-1", "peça descontinuada");
    expect(resultado).toEqual({ erro: null });
  });

  it("2. Erro limpo (dependências pendentes): nunca marca gravacaoIncerta", async () => {
    const client = clientFalso({
      data: null,
      error: { message: "marcar_op_nao_aplicavel: OP op-1 tem dependencias relacionadas (op-1->op-2) - revise ou remova via alterar_dependencia_operacao antes de marcar como nao aplicavel." },
    });
    const resultado = await persistirRemocaoOperacaoOfPcp(client, "op-1", "user-1", "motivo");
    expect(resultado.gravacaoIncerta).toBeUndefined();
    expect(resultado.erro).toContain("dependencias relacionadas");
  });

  it("3. Falha de rede: marca gravacaoIncerta=true", async () => {
    const client = clientFalso(() => {
      throw new Error("conexao perdida");
    });
    const resultado = await persistirRemocaoOperacaoOfPcp(client, "op-1", "user-1", "motivo");
    expect(resultado.gravacaoIncerta).toBe(true);
  });

  it("4. Chama a RPC com p_marcado_por sempre o id real passado", async () => {
    const rpcMock = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const client = { rpc: rpcMock } as never;
    await persistirRemocaoOperacaoOfPcp(client, "op-5", "usuario-real-5", "não será mais fabricada");
    expect(rpcMock).toHaveBeenCalledWith("marcar_op_nao_aplicavel", {
      p_op_id: "op-5",
      p_marcado_por: "usuario-real-5",
      p_motivo: "não será mais fabricada",
    });
  });
});

describe("classificarErroRemocaoOperacaoOfPcp", () => {
  it("5. Classifica cada mensagem técnica real conhecida, na ordem certa (dependências antes de apontamento)", () => {
    expect(classificarErroRemocaoOperacaoOfPcp("motivo e obrigatorio para marcar OP como nao aplicavel.")).toBe("motivo_obrigatorio");
    expect(classificarErroRemocaoOperacaoOfPcp("marcar_op_nao_aplicavel: OP x tem dependencias relacionadas (a->b) - revise...")).toBe(
      "dependencias_pendentes",
    );
    expect(classificarErroRemocaoOperacaoOfPcp("marcar_op_nao_aplicavel: OP x ja tem execucao registrada - remocao operacional bloqueada apos inicio.")).toBe(
      "apontamento_bloqueado",
    );
    expect(classificarErroRemocaoOperacaoOfPcp("OF x esta em estado final (desdobrada) - nenhuma OP pode ser criada/alterada.")).toBe(
      "of_estado_final",
    );
    expect(classificarErroRemocaoOperacaoOfPcp("OP x nao encontrada.")).toBe("op_nao_encontrada");
    expect(classificarErroRemocaoOperacaoOfPcp("algo inesperado")).toBe("erro_desconhecido");
  });

  it("6. Classifica OF em estado final para os 3 estados reais do trigger (Etapa 65I)", () => {
    // Mensagem real do trigger ordens_fabricacao_operacoes_impedir_apos_encerramento
    // (impedir_escrita_operacao_of_encerrada), confirmada em produção na Etapa 65H.1.
    for (const estado of ["concluida", "cancelada", "desdobrada"]) {
      expect(
        classificarErroRemocaoOperacaoOfPcp(
          `OF x esta em estado final (${estado}) - nenhuma OP pode ser criada/alterada (operacoes comuns ficam congeladas apos concluida/cancelada/desdobrada).`,
        ),
      ).toBe("of_estado_final");
    }
  });

  it("7. Nao confunde erro inesperado com estado final, e preserva bloqueio de dependencias (Etapa 65I)", () => {
    expect(classificarErroRemocaoOperacaoOfPcp("conexao com o banco de dados perdida inesperadamente")).toBe("erro_desconhecido");
    expect(classificarErroRemocaoOperacaoOfPcp("marcar_op_nao_aplicavel: OP x tem dependencias relacionadas (a->b) - revise...")).toBe(
      "dependencias_pendentes",
    );
  });
});
