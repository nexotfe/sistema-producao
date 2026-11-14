// Testes de persistirAprovacaoELiberacaoOfPcp: isola a chamada de rede
// à RPC candidata aprovar_e_liberar_of, sem sessão real (client fake
// injetado). Mesmo princípio de persistirLiberacaoOfPcp.test.ts/
// persistirAprovacaoOfPcp.test.ts.
import { describe, expect, it, vi } from "vitest";
import { persistirAprovacaoELiberacaoOfPcp, classificarErroAprovacaoELiberacaoOfPcp } from "./persistirAprovacaoELiberacaoOfPcp";

function clientFalso(resposta: { data: unknown; error: { message: string } | null } | (() => never)) {
  return { rpc: vi.fn(() => (typeof resposta === "function" ? resposta() : Promise.resolve(resposta))) } as never;
}

describe("persistirAprovacaoELiberacaoOfPcp", () => {
  it("1. Sucesso (aprovação+liberação real): resultado='liberada', aprovacaoRealizada=true", async () => {
    const client = clientFalso({
      data: { resultado: "liberada", of_id: "of-1", numero_of: "900301-0001", aprovacao_realizada: true },
      error: null,
    });
    const resultado = await persistirAprovacaoELiberacaoOfPcp(client, "of-1", "obs aprovação", "motivo liberação");
    expect(resultado).toEqual({ resultado: "liberada", numeroOf: "900301-0001", aprovacaoRealizada: true, erro: null });
  });

  it("2. Sucesso (só liberação, OF já aprovada): resultado='liberada', aprovacaoRealizada=false", async () => {
    const client = clientFalso({
      data: { resultado: "liberada", of_id: "of-1", numero_of: "900301-0002", aprovacao_realizada: false },
      error: null,
    });
    const resultado = await persistirAprovacaoELiberacaoOfPcp(client, "of-1", null, null);
    expect(resultado).toEqual({ resultado: "liberada", numeroOf: "900301-0002", aprovacaoRealizada: false, erro: null });
  });

  it("3. Sucesso idempotente (OF já liberada): resultado='ja_liberada', nunca um erro", async () => {
    const client = clientFalso({
      data: { resultado: "ja_liberada", of_id: "of-1", numero_of: "900301-0003", aprovacao_realizada: false },
      error: null,
    });
    const resultado = await persistirAprovacaoELiberacaoOfPcp(client, "of-1", null, null);
    expect(resultado.resultado).toBe("ja_liberada");
  });

  it("4. Erro limpo (resposta da RPC): nunca marca gravacaoIncerta", async () => {
    const client = clientFalso({ data: null, error: { message: "aprovar_e_liberar_of: OF x nao encontrada." } });
    const resultado = await persistirAprovacaoELiberacaoOfPcp(client, "of-x", null, null);
    expect(resultado).toEqual({ resultado: null, numeroOf: null, aprovacaoRealizada: false, erro: "aprovar_e_liberar_of: OF x nao encontrada." });
    expect(resultado.gravacaoIncerta).toBeUndefined();
  });

  it("5. Falha de rede (exceção na própria chamada): marca gravacaoIncerta=true, nunca presume sucesso ou falha", async () => {
    const client = clientFalso(() => {
      throw new Error("fetch failed");
    });
    const resultado = await persistirAprovacaoELiberacaoOfPcp(client, "of-1", null, null);
    expect(resultado.gravacaoIncerta).toBe(true);
    expect(resultado.resultado).toBeNull();
  });

  it("6. Resposta de sucesso sem payload reconhecido: resultado=null, erro=null", async () => {
    const client = clientFalso({ data: {}, error: null });
    const resultado = await persistirAprovacaoELiberacaoOfPcp(client, "of-1", null, null);
    expect(resultado).toEqual({ resultado: null, numeroOf: null, aprovacaoRealizada: false, erro: null });
  });

  it("7. Chama a RPC com os parâmetros exatos", async () => {
    const rpcMock = vi.fn(() => Promise.resolve({ data: { resultado: "liberada", numero_of: "900301-0001" }, error: null }));
    const client = { rpc: rpcMock } as never;
    await persistirAprovacaoELiberacaoOfPcp(client, "of-1", "obs", "motivo");
    expect(rpcMock).toHaveBeenCalledWith("aprovar_e_liberar_of", {
      p_of_id: "of-1",
      p_observacao_aprovacao: "obs",
      p_motivo_liberacao: "motivo",
    });
  });
});

describe("classificarErroAprovacaoELiberacaoOfPcp", () => {
  it("8. Classifica cada mensagem técnica real conhecida", () => {
    expect(classificarErroAprovacaoELiberacaoOfPcp("aprovar_e_liberar_of: sessao invalida.")).toBe("nao_autenticado");
    expect(classificarErroAprovacaoELiberacaoOfPcp("aprovar_e_liberar_of: empresa atual nao encontrada.")).toBe("empresa_nao_encontrada");
    expect(classificarErroAprovacaoELiberacaoOfPcp("aprovar_e_liberar_of: usuario sem permissao para aprovar OF.")).toBe(
      "nao_autorizado_aprovar",
    );
    expect(classificarErroAprovacaoELiberacaoOfPcp("aprovar_e_liberar_of: usuario sem permissao para liberar OF.")).toBe(
      "nao_autorizado_liberar",
    );
    expect(classificarErroAprovacaoELiberacaoOfPcp("aprovar_e_liberar_of: OF abc nao encontrada.")).toBe("of_nao_encontrada");
    expect(classificarErroAprovacaoELiberacaoOfPcp("liberar_of: liberado_por xyz nao e um usuario valido da empresa abc da OF def.")).toBe(
      "liberado_por_invalido",
    );
    expect(classificarErroAprovacaoELiberacaoOfPcp("liberar_of: OF abc ainda nao teve as materias-primas conferidas (Momento Y pendente).")).toBe(
      "momento_y_pendente",
    );
    expect(classificarErroAprovacaoELiberacaoOfPcp("liberar_of: OF abc em aguardando_auditoria/planejada nao pode ser liberada - precisa estar aprovada+planejada.")).toBe(
      "estado_incompativel",
    );
    expect(classificarErroAprovacaoELiberacaoOfPcp("aprovar_of: transicao invalida - OF abc em cancelada/cancelada.")).toBe("estado_incompativel");
    expect(classificarErroAprovacaoELiberacaoOfPcp("liberar_of: falha ao liberar OF abc - estado mudou durante a operacao.")).toBe(
      "conflito_concorrencia",
    );
    expect(classificarErroAprovacaoELiberacaoOfPcp("algo totalmente inesperado")).toBe("erro_desconhecido");
  });
});
