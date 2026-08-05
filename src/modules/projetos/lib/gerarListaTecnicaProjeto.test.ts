import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gerarListaTecnicaProjeto } from "./gerarListaTecnicaProjeto";

function criarClienteFalso(resultado: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(resultado);
  const client = { rpc } as unknown as SupabaseClient;
  return { client, rpc };
}

function linhaBase(overrides: Record<string, unknown> = {}) {
  return {
    projeto_item_id: "item-1",
    produto_raiz_id: "produto-raiz",
    produto_raiz_codigo: "6158-02",
    quantidade_solicitada: 1,
    materia_prima_id: "mp-1",
    materia_prima_codigo: "CH1020-1/2",
    materia_prima_descricao: "Chapa 1020 1/2",
    unidade_base: "kg",
    bom_item_id: "bi-1",
    ordem: 4,
    quantidade_linha: 19.6,
    unidade_linha: "kg",
    quantidade_acumulada_produto: 1,
    quantidade_calculada_origem: 19.6,
    quantidade_convertida: 19.6,
    dimensoes: null,
    profundidade: 0,
    caminho_ids: ["produto-raiz"],
    caminho_codigos: ["6158-02"],
    caminho_bom_item_ids: [],
    ...overrides,
  };
}

function resultadoCalculado(itensAnalisados: unknown[], materiais: unknown[]) {
  return {
    estado: "calculado",
    mensagem: null,
    itens_analisados: itensAnalisados,
    materiais,
  };
}

describe("gerarListaTecnicaProjeto", () => {
  it("chama a RPC certa com projetoId", async () => {
    const { client, rpc } = criarClienteFalso({
      data: resultadoCalculado([], []),
      error: null,
    });

    await gerarListaTecnicaProjeto(client, "projeto-x");

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("gerar_lista_tecnica_projeto", { p_projeto_id: "projeto-x" });
  });

  it("industrialização: devolve estado nao_aplicavel_industrializacao com arrays vazios, sem lançar", async () => {
    const { client } = criarClienteFalso({
      data: {
        estado: "nao_aplicavel_industrializacao",
        mensagem: "A matéria-prima deste projeto é fornecida pelo cliente.",
        itens_analisados: [],
        materiais: [],
      },
      error: null,
    });

    const resultado = await gerarListaTecnicaProjeto(client, "projeto-x");

    expect(resultado.estado).toBe("nao_aplicavel_industrializacao");
    expect(resultado.mensagem).toBe("A matéria-prima deste projeto é fornecida pelo cliente.");
    expect(resultado.itensAnalisados).toEqual([]);
    expect(resultado.materiais).toEqual([]);
  });

  it("mapeia itensAnalisados (serviço sem material aparece com possuiMateriais=false)", async () => {
    const { client } = criarClienteFalso({
      data: resultadoCalculado(
        [
          {
            projeto_item_id: "item-servico",
            produto_raiz_id: "produto-servico",
            produto_raiz_codigo: "SERVICO-01",
            quantidade_solicitada: 1,
            tipo_item: "servico",
            possui_materiais: false,
          },
        ],
        [],
      ),
      error: null,
    });

    const resultado = await gerarListaTecnicaProjeto(client, "projeto-x");

    expect(resultado.itensAnalisados).toEqual([
      {
        projetoItemId: "item-servico",
        produtoRaizId: "produto-servico",
        produtoRaizCodigo: "SERVICO-01",
        quantidadeSolicitada: 1,
        tipoItem: "servico",
        possuiMateriais: false,
      },
    ]);
    expect(resultado.materiais).toEqual([]);
  });

  it("consolida duas linhas do mesmo materia_prima_id, de itens de projeto diferentes, somando quantidadeConvertida", async () => {
    const { client } = criarClienteFalso({
      data: resultadoCalculado(
        [],
        [
          linhaBase({ projeto_item_id: "item-1", bom_item_id: "bi-1", quantidade_convertida: 124.16 }),
          linhaBase({ projeto_item_id: "item-2", bom_item_id: "bi-2", quantidade_convertida: 248.32 }),
        ],
      ),
      error: null,
    });

    const resultado = await gerarListaTecnicaProjeto(client, "projeto-x");

    expect(resultado.materiais).toHaveLength(1);
    expect(resultado.materiais[0].quantidadeTotal).toBeCloseTo(372.48, 10);
    expect(resultado.materiais[0].origens).toHaveLength(2);
    expect(resultado.materiais[0].origens.map((o) => o.projetoItemId)).toEqual(["item-1", "item-2"]);
  });

  it("mapeia todos os campos de origem corretamente (snake_case -> camelCase)", async () => {
    const { client } = criarClienteFalso({
      data: resultadoCalculado(
        [],
        [
          linhaBase({
            projeto_item_id: "item-9",
            produto_raiz_id: "raiz-9",
            produto_raiz_codigo: "6158-02",
            quantidade_solicitada: 2,
            bom_item_id: "bi-9",
            ordem: 12,
            quantidade_linha: 39.2,
            quantidade_acumulada_produto: 2,
            quantidade_calculada_origem: 78.4,
            quantidade_convertida: 78.4,
            dimensoes: '1/2"x118x1865',
            profundidade: 1,
            caminho_ids: ["raiz-9", "subconjunto-id"],
            caminho_codigos: ["6158-02", "02-6158-03-01"],
            caminho_bom_item_ids: ["vinculo-1"],
          }),
        ],
      ),
      error: null,
    });

    const [material] = (await gerarListaTecnicaProjeto(client, "projeto-x")).materiais;
    const [origem] = material.origens;

    expect(origem).toEqual({
      projetoItemId: "item-9",
      produtoRaizId: "raiz-9",
      produtoRaizCodigo: "6158-02",
      quantidadeSolicitada: 2,
      bomItemId: "bi-9",
      ordem: 12,
      quantidadeLinha: 39.2,
      unidadeLinha: "kg",
      quantidadeAcumuladaProduto: 2,
      quantidadeCalculadaOrigem: 78.4,
      quantidadeConvertida: 78.4,
      dimensoes: '1/2"x118x1865',
      profundidade: 1,
      caminhoIds: ["raiz-9", "subconjunto-id"],
      caminhoCodigos: ["6158-02", "02-6158-03-01"],
      caminhoBomItemIds: ["vinculo-1"],
    });
  });

  it("ordena os grupos consolidados por código e, em empate, por materiaPrimaId", async () => {
    const { client } = criarClienteFalso({
      data: resultadoCalculado(
        [],
        [
          linhaBase({ materia_prima_id: "mp-b", materia_prima_codigo: "ZZZ", bom_item_id: "bi-1" }),
          linhaBase({ materia_prima_id: "mp-a2", materia_prima_codigo: "AAA", bom_item_id: "bi-2" }),
          linhaBase({ materia_prima_id: "mp-a1", materia_prima_codigo: "AAA", bom_item_id: "bi-3" }),
        ],
      ),
      error: null,
    });

    const resultado = await gerarListaTecnicaProjeto(client, "projeto-x");

    expect(resultado.materiais.map((m) => m.materiaPrimaId)).toEqual(["mp-a1", "mp-a2", "mp-b"]);
  });

  it("erro da RPC: repassa a mensagem de domínio sem alterar", async () => {
    const mensagem =
      "Roteiro de fabricação incompleto: nenhuma matéria-prima ativa foi encontrada (item abc, caminho: SERVICO-01).";
    const { client } = criarClienteFalso({ data: null, error: { message: mensagem } });

    await expect(gerarListaTecnicaProjeto(client, "projeto-x")).rejects.toThrow(mensagem);
  });

  it("erro sem mensagem da RPC cai no texto genérico", async () => {
    const { client } = criarClienteFalso({ data: null, error: { message: "" } });

    await expect(gerarListaTecnicaProjeto(client, "projeto-x")).rejects.toThrow(
      "Não foi possível gerar a lista técnica do projeto.",
    );
  });

  it("sucesso sem erro mas sem dado algum lança erro claro", async () => {
    const { client } = criarClienteFalso({ data: null, error: null });

    await expect(gerarListaTecnicaProjeto(client, "projeto-x")).rejects.toThrow(
      "A geração da lista técnica não retornou resultado.",
    );
  });
});
