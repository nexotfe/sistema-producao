import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validarEstruturaFabricacaoProjeto } from "./validarEstruturaFabricacaoProjeto";
import { EstruturaFabricacaoIncompletaError } from "./errors";

function criarClienteFalso(resultado: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(resultado);
  const client = { rpc } as unknown as SupabaseClient;
  return { client, rpc };
}

function resultadoRpc(estado: string, mensagem: string | null = null) {
  return { estado, mensagem, itens_analisados: [], materiais: [] };
}

describe("validarEstruturaFabricacaoProjeto", () => {
  it("não lança quando gerarListaTecnicaProjeto devolve estado 'calculado'", async () => {
    const { client } = criarClienteFalso({ data: resultadoRpc("calculado"), error: null });

    await expect(validarEstruturaFabricacaoProjeto(client, "projeto-1")).resolves.toBeUndefined();
  });

  it("não lança para projeto de industrialização (estado 'nao_aplicavel_industrializacao')", async () => {
    const { client } = criarClienteFalso({
      data: resultadoRpc("nao_aplicavel_industrializacao", "A matéria-prima deste projeto é fornecida pelo cliente."),
      error: null,
    });

    await expect(validarEstruturaFabricacaoProjeto(client, "projeto-1")).resolves.toBeUndefined();
  });

  it("lança EstruturaFabricacaoIncompletaError com a mensagem de negócio da RPC, sem reformular", async () => {
    const mensagem =
      "Roteiro de fabricação incompleto: nenhuma matéria-prima ativa foi encontrada (item abc, caminho: ZTESTE-SIMCAP-002).";
    const { client } = criarClienteFalso({ data: null, error: { message: mensagem } });

    let erroCapturado: unknown;
    try {
      await validarEstruturaFabricacaoProjeto(client, "projeto-1");
    } catch (erro) {
      erroCapturado = erro;
    }

    expect(erroCapturado).toBeInstanceOf(EstruturaFabricacaoIncompletaError);
    expect((erroCapturado as EstruturaFabricacaoIncompletaError).message).toBe(mensagem);
    expect((erroCapturado as EstruturaFabricacaoIncompletaError).projetoId).toBe("projeto-1");
  });

  it("chama a RPC exatamente uma vez por validação", async () => {
    const { client, rpc } = criarClienteFalso({ data: resultadoRpc("calculado"), error: null });

    await validarEstruturaFabricacaoProjeto(client, "projeto-1");

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("gerar_lista_tecnica_projeto", { p_projeto_id: "projeto-1" });
  });
});
