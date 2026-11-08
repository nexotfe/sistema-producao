// Etapa 65A — testes de persistirCriacaoOperacaoOfPcp: isola a chamada
// de rede à RPC real criar_op_no_y, sem sessão real (client fake
// injetado). Mesmo princípio de persistirConfirmacaoMomentoYPcp.test.ts.
import { describe, expect, it, vi } from "vitest";
import {
  persistirCriacaoOperacaoOfPcp,
  classificarErroCriacaoOperacaoOfPcp,
} from "./persistirCriacaoOperacaoOfPcp";

function clientFalso(resposta: { data: unknown; error: { message: string } | null } | (() => never)) {
  return { rpc: vi.fn(() => (typeof resposta === "function" ? resposta() : Promise.resolve(resposta))) } as never;
}

describe("persistirCriacaoOperacaoOfPcp", () => {
  it("1. Sucesso: devolve o novoOpId, sem erro", async () => {
    const client = clientFalso({ data: "op-novo-1", error: null });
    const resultado = await persistirCriacaoOperacaoOfPcp(client, "of-1", "user-1", "OP40", "Pintura", 4, null, null, "demanda nova");
    expect(resultado).toEqual({ novoOpId: "op-novo-1", erro: null });
  });

  it("2. Erro limpo (resposta da RPC): nunca marca gravacaoIncerta", async () => {
    const client = clientFalso({ data: null, error: { message: "OF nao encontrada." } });
    const resultado = await persistirCriacaoOperacaoOfPcp(client, "of-x", "user-1", "OP40", "Pintura", 4, null, null, "motivo");
    expect(resultado).toEqual({ novoOpId: null, erro: "OF nao encontrada." });
    expect(resultado.gravacaoIncerta).toBeUndefined();
  });

  it("3. Falha de rede (exceção na própria chamada): marca gravacaoIncerta=true", async () => {
    const client = clientFalso(() => {
      throw new Error("fetch failed");
    });
    const resultado = await persistirCriacaoOperacaoOfPcp(client, "of-1", "user-1", "OP40", "Pintura", 4, null, null, "motivo");
    expect(resultado.gravacaoIncerta).toBe(true);
    expect(resultado.novoOpId).toBeNull();
  });

  it("4. Chama a RPC com os parâmetros exatos, incluindo p_criado_por", async () => {
    const rpcMock = vi.fn(() => Promise.resolve({ data: "op-1", error: null }));
    const client = { rpc: rpcMock } as never;
    await persistirCriacaoOperacaoOfPcp(client, "of-1", "usuario-real-1", "OP40", "Pintura", 4, "recurso-1", 30, "motivo x");
    expect(rpcMock).toHaveBeenCalledWith("criar_op_no_y", {
      p_of_id: "of-1",
      p_criado_por: "usuario-real-1",
      p_codigo_operacional: "OP40",
      p_descricao: "Pintura",
      p_sequencia_vigente: 4,
      p_recurso_vigente_id: "recurso-1",
      p_tempo_vigente_minutos: 30,
      p_motivo: "motivo x",
    });
  });
});

describe("classificarErroCriacaoOperacaoOfPcp", () => {
  it("5. Classifica cada mensagem técnica real conhecida", () => {
    expect(classificarErroCriacaoOperacaoOfPcp("criar_op_no_y: motivo/justificativa e obrigatorio para toda OP nova no Y.")).toBe(
      "motivo_obrigatorio",
    );
    expect(classificarErroCriacaoOperacaoOfPcp("OF abc esta em estado final (cancelada) - nenhuma OP pode ser criada/alterada.")).toBe(
      "of_estado_final",
    );
    expect(classificarErroCriacaoOperacaoOfPcp("OF abc nao encontrada.")).toBe("of_nao_encontrada");
    expect(classificarErroCriacaoOperacaoOfPcp("algo totalmente inesperado")).toBe("erro_desconhecido");
  });

  it("6. Classifica OF em estado final para os 3 estados reais do trigger (Etapa 65I)", () => {
    // Mensagem real do trigger ordens_fabricacao_operacoes_impedir_apos_encerramento
    // (impedir_escrita_operacao_of_encerrada), confirmada em produção na Etapa 65H.1.
    for (const estado of ["concluida", "cancelada", "desdobrada"]) {
      expect(
        classificarErroCriacaoOperacaoOfPcp(
          `OF abc esta em estado final (${estado}) - nenhuma OP pode ser criada/alterada (operacoes comuns ficam congeladas apos concluida/cancelada/desdobrada).`,
        ),
      ).toBe("of_estado_final");
    }
  });

  it("7. Nao confunde erro inesperado com estado final (Etapa 65I)", () => {
    expect(classificarErroCriacaoOperacaoOfPcp("conexao com o banco de dados perdida inesperadamente")).toBe("erro_desconhecido");
    expect(classificarErroCriacaoOperacaoOfPcp("estado invalido para esta operacao")).toBe("erro_desconhecido");
  });
});
