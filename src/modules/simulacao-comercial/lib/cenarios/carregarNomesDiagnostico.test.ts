import { describe, expect, it } from "vitest";
import { carregarNomesDiagnostico } from "./carregarNomesDiagnostico";
import type { SupabaseClient } from "@supabase/supabase-js";

type RespostaTabela = { data: unknown[] | null; error: { message: string } | null };

function clientFalso(respostas: Record<string, RespostaTabela>): SupabaseClient {
  const chamadas: string[] = [];
  const client = {
    from(tabela: string) {
      chamadas.push(tabela);
      return {
        select() {
          return {
            in() {
              return Promise.resolve(respostas[tabela] ?? { data: [], error: null });
            },
          };
        },
      };
    },
    __chamadas: chamadas,
  };
  return client as unknown as SupabaseClient;
}

describe("carregarNomesDiagnostico", () => {
  it("sem nenhum ID: não consulta nada, devolve mapas vazios", async () => {
    const client = clientFalso({});
    const resultado = await carregarNomesDiagnostico(client, { recursoIds: [], bomOperacaoIds: [] });
    expect(resultado).toEqual({ recursos: {}, operacoes: {} });
  });

  it("resolve nomes de recurso (codigo - nome) e descrição de operação em 2 consultas em lote, nunca 1 por ID", async () => {
    const client = clientFalso({
      recursos_produtivos: {
        data: [
          { id: "recurso-A", codigo: "FER-001", nome: "Ajustador" },
          { id: "recurso-B", codigo: null, nome: "Sem código" },
        ],
        error: null,
      },
      bom_operacoes: {
        data: [{ id: "op-1", descricao: "Montagem no cliente" }],
        error: null,
      },
    });

    const resultado = await carregarNomesDiagnostico(client, {
      recursoIds: ["recurso-A", "recurso-B"],
      bomOperacaoIds: ["op-1"],
    });

    expect(resultado.recursos).toEqual({ "recurso-A": "FER-001 - Ajustador", "recurso-B": "Sem código" });
    expect(resultado.operacoes).toEqual({ "op-1": "Montagem no cliente" });
  });

  it("falha na consulta de recursos (error preenchido): devolve mapas vazios, nunca lança - quem chama cai no fallback (ID cru), nunca perde o cenário já calculado", async () => {
    const client = clientFalso({
      recursos_produtivos: { data: null, error: { message: "conexão falhou" } },
      bom_operacoes: { data: [{ id: "op-1", descricao: "Montagem no cliente" }], error: null },
    });

    const resultado = await carregarNomesDiagnostico(client, { recursoIds: ["recurso-A"], bomOperacaoIds: ["op-1"] });

    expect(resultado).toEqual({ recursos: {}, operacoes: {} });
  });

  it("exceção lançada pelo client (ex.: rede fora): devolve mapas vazios, nunca propaga o erro", async () => {
    const client = {
      from() {
        throw new Error("rede fora");
      },
    } as unknown as SupabaseClient;

    const resultado = await carregarNomesDiagnostico(client, { recursoIds: ["recurso-A"], bomOperacaoIds: [] });

    expect(resultado).toEqual({ recursos: {}, operacoes: {} });
  });

  it("operação sem descrição cadastrada (null) não entra no mapa - quem exibe cai no fallback do ID", async () => {
    const client = clientFalso({
      recursos_produtivos: { data: [], error: null },
      bom_operacoes: { data: [{ id: "op-1", descricao: null }], error: null },
    });

    const resultado = await carregarNomesDiagnostico(client, { recursoIds: [], bomOperacaoIds: ["op-1"] });

    expect(resultado.operacoes).toEqual({});
  });
});
