// Estes testes cobrem só a fronteira que este arquivo é responsável
// por implementar: o contrato de chamada da RPC e a conversão
// snake_case -> camelCase da resposta. Eles NÃO exercitam (e não
// podem exercitar, sem um Postgres real) a recursão da função SQL -
// multiplicação de quantidade acumulada em 2+ níveis, mesmo
// subconjunto usado duas vezes, consolidação entre itens, detecção de
// ciclo/profundidade excedida, isolamento por empresa e ACL. Esses
// cenários pertencem aos testes reais (BEGIN...ROLLBACK e, para o
// contraste abaixo, dado real em produção) contra o banco, preparados
// junto da migration 202608060001, não a este arquivo - simular a
// resposta "certa" aqui só provaria que o mapa confia na RPC, nunca
// que a RPC calculou certo.
//
// Distinção validada com dado real (projeto 260010, produto
// ZTESTE-SIMCAP-002): estrutura PRODUTIVA incompleta (o que esta RPC
// mede - falta de roteiro/ciclo/profundidade) NÃO é o mesmo que
// estrutura de MATERIAIS incompleta (o que gerar_lista_tecnica_projeto
// mede - falta de matéria-prima ativa). Esse projeto tem roteiro
// resolvível e 7200 min reais de operação, mas nenhuma matéria-prima
// ativa - a Lista Técnica o marca incompleto, o Resumo Produtivo
// corretamente devolve estado="calculado". A RPC nunca deve olhar para
// matéria-prima ao decidir "incompleto".
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calcularResumoProdutivoProjeto } from "./calcularResumoProdutivoProjeto";

function criarClienteFalso(resultado: {
  data: unknown;
  error: { message: string } | null;
}) {
  const rpc = vi.fn().mockResolvedValue(resultado);
  const client = { rpc } as unknown as SupabaseClient;
  return { client, rpc };
}

function resultadoCalculado(recursos: unknown[], itens: unknown[]) {
  return {
    estado: "calculado",
    mensagem: null,
    recursos,
    itens,
  };
}

describe("calcularResumoProdutivoProjeto", () => {
  it("chama a RPC certa, só com p_projeto_id (nunca envia tipo_projeto/exclusão - operações sempre contam, inclusive industrialização)", async () => {
    const { client, rpc } = criarClienteFalso({
      data: resultadoCalculado([], []),
      error: null,
    });

    await calcularResumoProdutivoProjeto(client, "projeto-x");

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("calcular_resumo_produtivo_projeto", {
      p_projeto_id: "projeto-x",
    });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_excluir_operacoes");
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("tipo_projeto");
  });

  it("mapeia recursos de snake_case para camelCase, convertendo minutos para number", async () => {
    const { client } = criarClienteFalso({
      data: resultadoCalculado(
        [
          {
            recurso_produtivo_id: "recurso-1",
            recurso_codigo: "F001",
            recurso_nome: "Fresa Convencional",
            minutos: "123.5",
          },
        ],
        [],
      ),
      error: null,
    });

    const resultado = await calcularResumoProdutivoProjeto(client, "projeto-x");

    expect(resultado.recursos).toEqual([
      {
        recursoId: "recurso-1",
        codigo: "F001",
        nome: "Fresa Convencional",
        minutos: 123.5,
      },
    ]);
  });

  it("operação sem recurso (recurso_produtivo_id null) não desaparece - vira uma linha própria no mapeamento", async () => {
    const { client } = criarClienteFalso({
      data: resultadoCalculado(
        [
          {
            recurso_produtivo_id: null,
            recurso_codigo: null,
            recurso_nome: null,
            minutos: 40,
          },
          {
            recurso_produtivo_id: "recurso-1",
            recurso_codigo: "F001",
            recurso_nome: "Fresa",
            minutos: 60,
          },
        ],
        [],
      ),
      error: null,
    });

    const resultado = await calcularResumoProdutivoProjeto(client, "projeto-x");

    expect(resultado.recursos).toHaveLength(2);
    expect(resultado.recursos).toContainEqual({
      recursoId: null,
      codigo: null,
      nome: null,
      minutos: 40,
    });
  });

  it("item incompleto não desaparece do mapeamento - itens com estrutura_ok=false continuam na lista", async () => {
    const { client } = criarClienteFalso({
      data: {
        estado: "incompleto",
        mensagem: "Resumo produtivo incompleto: ...",
        recursos: [
          { recurso_produtivo_id: "recurso-1", recurso_codigo: "F001", recurso_nome: "Fresa", minutos: 30 },
        ],
        itens: [
          {
            projeto_item_id: "item-ok",
            produto_id: "produto-ok",
            produto_codigo: "6158-01",
            estrutura_ok: true,
            motivo: null,
          },
          {
            projeto_item_id: "item-incompleto",
            produto_id: "produto-sem-roteiro",
            produto_codigo: "6158-02",
            estrutura_ok: false,
            motivo: "sem_roteiro",
          },
        ],
      },
      error: null,
    });

    const resultado = await calcularResumoProdutivoProjeto(client, "projeto-x");

    expect(resultado.estado).toBe("incompleto");
    expect(resultado.itens).toHaveLength(2);
    expect(resultado.itens).toContainEqual({
      projetoItemId: "item-incompleto",
      produtoId: "produto-sem-roteiro",
      produtoCodigo: "6158-02",
      estruturaOk: false,
      motivo: "sem_roteiro",
    });
  });

  it.each(["sem_roteiro", "ciclo", "profundidade_excedida"])(
    "repassa o motivo '%s' sem alterar",
    async (motivo) => {
      const { client } = criarClienteFalso({
        data: {
          estado: "incompleto",
          mensagem: "incompleto",
          recursos: [],
          itens: [
            {
              projeto_item_id: "item-1",
              produto_id: "produto-1",
              produto_codigo: "COD-1",
              estrutura_ok: false,
              motivo,
            },
          ],
        },
        error: null,
      });

      const resultado = await calcularResumoProdutivoProjeto(client, "projeto-x");

      expect(resultado.itens[0].motivo).toBe(motivo);
    },
  );

  it("estado 'calculado' e mensagem null são repassados sem alteração", async () => {
    const { client } = criarClienteFalso({
      data: resultadoCalculado([], []),
      error: null,
    });

    const resultado = await calcularResumoProdutivoProjeto(client, "projeto-x");

    expect(resultado.estado).toBe("calculado");
    expect(resultado.mensagem).toBeNull();
  });

  it("erro real da RPC (ex: projeto não encontrado, quantidade inválida) é lançado com a mensagem exata", async () => {
    const { client } = criarClienteFalso({
      data: null,
      error: {
        message:
          "Não é possível calcular o resumo produtivo: item do projeto com quantidade inválida.",
      },
    });

    await expect(
      calcularResumoProdutivoProjeto(client, "projeto-x"),
    ).rejects.toThrow(
      "Não é possível calcular o resumo produtivo: item do projeto com quantidade inválida.",
    );
  });

  it("erro sem mensagem cai no texto genérico", async () => {
    const { client } = criarClienteFalso({ data: null, error: { message: "" } });

    await expect(
      calcularResumoProdutivoProjeto(client, "projeto-x"),
    ).rejects.toThrow("Não foi possível calcular o resumo produtivo do projeto.");
  });

  it("sucesso sem erro mas sem dado válido lança erro claro (defesa contra resposta incoerente)", async () => {
    const { client } = criarClienteFalso({ data: null, error: null });

    await expect(
      calcularResumoProdutivoProjeto(client, "projeto-x"),
    ).rejects.toThrow("O cálculo do resumo produtivo não retornou resultado.");
  });

  it("recursos e itens ausentes (null) viram arrays vazios, nunca lançam", async () => {
    const { client } = criarClienteFalso({
      data: { estado: "calculado", mensagem: null, recursos: null, itens: null },
      error: null,
    });

    const resultado = await calcularResumoProdutivoProjeto(client, "projeto-x");

    expect(resultado.recursos).toEqual([]);
    expect(resultado.itens).toEqual([]);
  });
});
