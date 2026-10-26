// PCP-Etapa2O.5: testes de buscarFilaPrioridadesPcp com um client
// Supabase falso (só a fatia de .from().select().order()/.in() de fato
// usada, igual à filosofia de criarClientePcpFalso.ts) - nunca escreve,
// nunca chama RPC.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarFilaPrioridadesPcp } from "./buscarFilaPrioridadesPcp";

interface FixtureFila {
  pcp_fila_projetos: { projeto_id: string; posicao: number }[];
  projetos: { id: string; numero_projeto: string; nome: string; cliente_id: string | null; data_objetivo: string | null }[];
  clientes: { id: string; nome: string }[];
}

const chamadasDeEscrita: string[] = [];

function criarClienteFalso(fixture: FixtureFila): SupabaseClient {
  function builder(tabela: string) {
    const filtros: { in: Record<string, unknown[]> } = { in: {} };
    let ordenacao: { coluna: string; ascending: boolean } | null = null;

    const api = {
      select() {
        return api;
      },
      order(coluna: string, opts: { ascending: boolean }) {
        ordenacao = { coluna, ascending: opts.ascending };
        return api;
      },
      in(coluna: string, valores: unknown[]) {
        filtros.in[coluna] = valores;
        return api;
      },
      insert() {
        chamadasDeEscrita.push(`insert:${tabela}`);
        throw new Error("fake client: insert não suportado (nenhuma escrita esperada).");
      },
      update() {
        chamadasDeEscrita.push(`update:${tabela}`);
        throw new Error("fake client: update não suportado (nenhuma escrita esperada).");
      },
      delete() {
        chamadasDeEscrita.push(`delete:${tabela}`);
        throw new Error("fake client: delete não suportado (nenhuma escrita esperada).");
      },
      then(resolve: (valor: { data: unknown; error: null }) => void) {
        let linhas = ((fixture as unknown as Record<string, Record<string, unknown>[]>)[tabela] ?? []).slice();
        for (const [coluna, valores] of Object.entries(filtros.in)) {
          linhas = linhas.filter((linha) => valores.includes(linha[coluna]));
        }
        if (ordenacao) {
          const { coluna, ascending } = ordenacao;
          linhas = [...linhas].sort((a, b) => {
            const va = a[coluna] as number;
            const vb = b[coluna] as number;
            return ascending ? va - vb : vb - va;
          });
        }
        resolve({ data: linhas, error: null });
        return Promise.resolve();
      },
    };
    return api;
  }

  return { from: (tabela: string) => builder(tabela) } as unknown as SupabaseClient;
}

function fixturePadrao(): FixtureFila {
  return {
    pcp_fila_projetos: [
      { projeto_id: "proj-e", posicao: 0 },
      { projeto_id: "proj-a", posicao: 1000 },
      { projeto_id: "proj-b", posicao: 2000 },
      { projeto_id: "proj-c", posicao: 3000 },
      { projeto_id: "proj-d", posicao: 4000 },
    ],
    projetos: [
      { id: "proj-e", numero_projeto: "260005", nome: "Projeto E", cliente_id: "cli-1", data_objetivo: "2026-11-30" },
      { id: "proj-a", numero_projeto: "260001", nome: "Projeto A", cliente_id: "cli-1", data_objetivo: "2026-11-01" },
      { id: "proj-b", numero_projeto: "260002", nome: "Projeto B", cliente_id: "cli-2", data_objetivo: null },
      { id: "proj-c", numero_projeto: "260003", nome: "Projeto C", cliente_id: null, data_objetivo: "2026-12-01" },
      { id: "proj-d", numero_projeto: "260004", nome: "Projeto D", cliente_id: "cli-2", data_objetivo: "2026-12-15" },
    ],
    clientes: [
      { id: "cli-1", nome: "Cliente Um" },
      { id: "cli-2", nome: "Cliente Dois" },
    ],
  };
}

describe("buscarFilaPrioridadesPcp", () => {
  it("5 projetos ordenados corretamente por posicaoReal (rank fracionário), com posicaoSequencial 1..5", async () => {
    const resultado = await buscarFilaPrioridadesPcp(criarClienteFalso(fixturePadrao()));

    expect(resultado.map((item) => item.nomeProjeto)).toEqual(["Projeto E", "Projeto A", "Projeto B", "Projeto C", "Projeto D"]);
    expect(resultado.map((item) => item.posicaoSequencial)).toEqual([1, 2, 3, 4, 5]);
  });

  it("posicaoReal preserva o rank fracionário exato - nunca normalizado/truncado", async () => {
    const resultado = await buscarFilaPrioridadesPcp(criarClienteFalso(fixturePadrao()));

    expect(resultado[0]).toMatchObject({ projetoId: "proj-e", posicaoReal: 0 });
    expect(resultado[1]).toMatchObject({ projetoId: "proj-a", posicaoReal: 1000 });
  });

  it("cliente ausente (projeto sem cliente_id): nomeCliente e clienteId ficam null, nunca lançam erro", async () => {
    const resultado = await buscarFilaPrioridadesPcp(criarClienteFalso(fixturePadrao()));

    const projetoC = resultado.find((item) => item.projetoId === "proj-c")!;
    expect(projetoC.clienteId).toBeNull();
    expect(projetoC.nomeCliente).toBeNull();
  });

  it("data objetivo ausente: dataObjetivo fica null, nunca inventa uma data", async () => {
    const resultado = await buscarFilaPrioridadesPcp(criarClienteFalso(fixturePadrao()));

    const projetoB = resultado.find((item) => item.projetoId === "proj-b")!;
    expect(projetoB.dataObjetivo).toBeNull();
  });

  it("fila vazia: devolve array vazio, nunca lança nem inventa uma linha", async () => {
    const resultado = await buscarFilaPrioridadesPcp(
      criarClienteFalso({ pcp_fila_projetos: [], projetos: [], clientes: [] }),
    );

    expect(resultado).toEqual([]);
  });

  it("nunca chama insert/update/delete em nenhuma tabela - leitura pura", async () => {
    chamadasDeEscrita.length = 0;
    await buscarFilaPrioridadesPcp(criarClienteFalso(fixturePadrao()));

    expect(chamadasDeEscrita).toEqual([]);
  });

  it("projeto na fila sem contrapartida em projetos (inconsistência) lança erro explícito, nunca omite silenciosamente", async () => {
    const fixtureInconsistente: FixtureFila = {
      pcp_fila_projetos: [{ projeto_id: "proj-fantasma", posicao: 1000 }],
      projetos: [],
      clientes: [],
    };

    await expect(buscarFilaPrioridadesPcp(criarClienteFalso(fixtureInconsistente))).rejects.toThrow(/proj-fantasma/);
  });
});
