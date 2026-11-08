// Etapa 63 — testes com as mensagens REAIS extraídas de
// confirmar_necessidades_momento_y em produção (pg_get_functiondef,
// Etapas 61/62) - nunca inventadas.
import { describe, expect, it, vi } from "vitest";
import {
  persistirConfirmacaoMomentoYPcp,
  classificarErroConfirmacaoMomentoYPcp,
  type ItemConfirmacaoMomentoYPayload,
} from "./persistirConfirmacaoMomentoYPcp";

function itemFicticio(sobrescritas: Partial<ItemConfirmacaoMomentoYPayload> = {}): ItemConfirmacaoMomentoYPayload {
  return { materia_prima_id: "mp-1", origem_fornecimento: "empresa", quantidade_confirmada: 10, quantidade_ci: 0, observacao_tecnica: "", ...sobrescritas };
}

describe("persistirConfirmacaoMomentoYPcp", () => {
  it("1. Sucesso: resposta limpa, sem erro, sem gravacaoIncerta", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { resultado: "confirmado", of_id: "of-1", total_materiais: 2, total_reservas_ci: 1, total_itens_requisicao_ce: 1, requisicao_compra_id: "req-1" },
      error: null,
    });
    const client = { rpc } as unknown as Parameters<typeof persistirConfirmacaoMomentoYPcp>[0];

    const resultado = await persistirConfirmacaoMomentoYPcp(client, "of-1", [], [itemFicticio()]);

    expect(resultado.erro).toBeNull();
    expect(resultado.gravacaoIncerta).toBeUndefined();
    expect(resultado.resposta?.total_materiais).toBe(2);
    expect(rpc).toHaveBeenCalledWith("confirmar_necessidades_momento_y", {
      p_of_id: "of-1",
      p_proposta_original: [],
      p_itens_confirmados: [itemFicticio()],
    });
  });

  it("2. Erro limpo (resposta da RPC com error): nunca marcado como gravacaoIncerta - sabemos que nada foi gravado", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "confirmar_necessidades_momento_y: OF % nao esta aprovada." } });
    const client = { rpc } as unknown as Parameters<typeof persistirConfirmacaoMomentoYPcp>[0];

    const resultado = await persistirConfirmacaoMomentoYPcp(client, "of-1", [], [itemFicticio()]);

    expect(resultado.erro).toContain("nao esta aprovada");
    expect(resultado.gravacaoIncerta).toBeUndefined();
  });

  it("3. Falha de rede (a própria chamada lança): gravacaoIncerta=true, erro nunca null", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const client = { rpc } as unknown as Parameters<typeof persistirConfirmacaoMomentoYPcp>[0];

    const resultado = await persistirConfirmacaoMomentoYPcp(client, "of-1", [], [itemFicticio()]);

    expect(resultado.gravacaoIncerta).toBe(true);
    expect(resultado.erro).toBe("fetch failed");
    expect(resultado.resposta).toBeNull();
  });

  it("4. p_proposta_original é repassada sem nenhuma alteração", async () => {
    const propostaReal = [{ materia_prima_id: "mp-1", quantidade_sugerida: 10, unidade: "kg", descricao: "Chapa", especificacao: null }];
    const rpc = vi.fn().mockResolvedValue({ data: { resultado: "confirmado", of_id: "of-1", total_materiais: 1, total_reservas_ci: 0, total_itens_requisicao_ce: 1, requisicao_compra_id: null }, error: null });
    const client = { rpc } as unknown as Parameters<typeof persistirConfirmacaoMomentoYPcp>[0];

    await persistirConfirmacaoMomentoYPcp(client, "of-1", propostaReal, [itemFicticio()]);

    expect(rpc).toHaveBeenCalledWith("confirmar_necessidades_momento_y", expect.objectContaining({ p_proposta_original: propostaReal }));
  });
});

describe("classificarErroConfirmacaoMomentoYPcp — mensagens reais da produção", () => {
  const casos: Array<[string, string]> = [
    ["confirmar_necessidades_momento_y: usuario sem permissao para confirmar necessidades.", "nao_autorizado"],
    ["confirmar_necessidades_momento_y: OF 260015-0002 ja teve o Momento Y confirmado em 2026-11-07 por x.", "ja_confirmado"],
    ["confirmar_necessidades_momento_y: OF 260015-0002 esta em estado final (cancelada) - nao e possivel confirmar necessidades.", "of_estado_final"],
    ["confirmar_necessidades_momento_y: OF 260015-0002 nao esta aprovada.", "of_nao_aprovada"],
    ["confirmar_necessidades_momento_y: confirmacao de materias-primas via Momento Y nao esta habilitada para esta empresa.", "interruptor_desligado"],
    ["confirmar_necessidades_momento_y: OF nao encontrada.", "of_nao_encontrada"],
    ["confirmar_necessidades_momento_y: a proposta de materiais mudou desde a abertura da tela (material mp-1, sugestao atual 12) - releia a proposta antes de confirmar.", "proposta_desatualizada"],
    ["confirmar_necessidades_momento_y: a proposta de materiais mudou desde a abertura da tela (quantidade de itens difere: original=2, atual=3) - releia a proposta antes de confirmar.", "proposta_desatualizada"],
    ["confirmar_necessidades_momento_y: observacoes tecnicas divergentes para o material mp-1 (origem empresa) - revise e unifique antes de confirmar.", "observacoes_divergentes"],
    ["confirmar_necessidades_momento_y: saldo livre insuficiente para a reserva CI do material mp-1 (livre=3, confirmado=10).", "saldo_insuficiente"],
    ["confirmar_necessidades_momento_y: falha ao confirmar OF 260015-0002 - o Momento Y foi confirmado por outra operacao durante esta chamada.", "confirmacao_concorrente"],
    ["confirmar_necessidades_momento_y: quantidade confirmada invalida para o material mp-1.", "dados_invalidos"],
    ["confirmar_necessidades_momento_y: origem_fornecimento invalida (externo) para o material mp-1 - use 'empresa' ou 'cliente'.", "dados_invalidos"],
    ["confirmar_necessidades_momento_y: material mp-1 tem origem_fornecimento='cliente' mas quantidade_ci=5 - material fornecido pelo cliente nao pode ter reserva CI propria, corrija o formulario antes de confirmar.", "dados_invalidos"],
    ["confirmar_necessidades_momento_y: quantidade CI invalida para o material mp-1 (CI=15, confirmado=10) - CI nao pode exceder a quantidade confirmada.", "dados_invalidos"],
    ["alguma mensagem totalmente inesperada", "erro_desconhecido"],
  ];

  it.each(casos)("classifica %s como %s", (mensagem, motivoEsperado) => {
    expect(classificarErroConfirmacaoMomentoYPcp(mensagem)).toBe(motivoEsperado);
  });
});
