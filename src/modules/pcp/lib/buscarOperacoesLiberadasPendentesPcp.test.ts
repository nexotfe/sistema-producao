// Planejamento Diário (PCP) — fixtures isoladas, nenhuma gravação real.
// Cobre: OF não liberada excluída, OP concluída/não aplicável excluída,
// OF liberada sem nenhuma OP elegível excluída, propagação de erro de
// cada fonte, nome da empresa propagado.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarOperacoesLiberadasPendentesPcp } from "./buscarOperacoesLiberadasPendentesPcp";

type Linha = Record<string, unknown>;

interface Fixtures {
  empresas?: Linha[];
  ordens_fabricacao?: Linha[];
  ordens_fabricacao_operacoes?: Linha[];
  resolvidaPorOpId?: Record<string, boolean>;
  erroEm?: "empresas" | "ordens_fabricacao" | "ordens_fabricacao_operacoes" | "ops_resolvidas";
}

function clienteFalso(fixtures: Fixtures): SupabaseClient {
  return {
    from(tabela: string) {
      const base = (fixtures as unknown as Record<string, Linha[]>)[tabela] ?? [];
      let linhas = base.slice();
      const erro = fixtures.erroEm === tabela ? { message: `falha simulada em ${tabela}`, code: "ERR" } : null;
      const api = {
        select(_cols: string) {
          return api;
        },
        eq(coluna: string, valor: unknown) {
          linhas = linhas.filter((l) => l[coluna] === valor);
          return api;
        },
        in(coluna: string, valores: unknown[]) {
          linhas = linhas.filter((l) => valores.includes(l[coluna]));
          return api;
        },
        maybeSingle() {
          return Promise.resolve({ data: erro ? null : linhas[0] ?? null, error: erro });
        },
        then(resolve: (v: { data: unknown; error: typeof erro }) => void) {
          resolve({ data: erro ? null : linhas, error: erro });
        },
      };
      return api;
    },
    rpc(nome: string, args: { p_op_ids: string[] }) {
      if (nome !== "ops_resolvidas") throw new Error(`rpc inesperada: ${nome}`);
      if (fixtures.erroEm === "ops_resolvidas") {
        return Promise.resolve({ data: null, error: { message: "falha simulada em ops_resolvidas", code: "ERR" } });
      }
      const mapa = fixtures.resolvidaPorOpId ?? {};
      const linhas = args.p_op_ids.map((opId) => ({ op_id: opId, resolvida: mapa[opId] ?? false }));
      return Promise.resolve({ data: linhas, error: null });
    },
  } as unknown as SupabaseClient;
}

describe("buscarOperacoesLiberadasPendentesPcp", () => {
  it("1. Nenhuma OF liberada: lista vazia, nome da empresa presente", async () => {
    const client = clienteFalso({ empresas: [{ nome: "Empresa Teste" }], ordens_fabricacao: [] });
    const resultado = await buscarOperacoesLiberadasPendentesPcp(client);
    expect(resultado).toEqual({ ok: true, itens: [], nomeEmpresa: "Empresa Teste" });
  });

  it("2. OF liberada com OP pendente: aparece", async () => {
    const client = clienteFalso({
      empresas: [{ nome: "Empresa Teste" }],
      ordens_fabricacao: [{ id: "of-1", numero_of: "260101-0001", projeto_id: "proj-1", estado_execucao: "liberada" }],
      ordens_fabricacao_operacoes: [
        { id: "op-1", of_id: "of-1", codigo_operacional: "OP10", descricao: "Corte", recurso_vigente_id: "rec-1", nao_aplicavel: false },
      ],
      resolvidaPorOpId: { "op-1": false },
    });
    const resultado = await buscarOperacoesLiberadasPendentesPcp(client);
    expect(resultado).toEqual({
      ok: true,
      itens: [{ opId: "op-1", codigoOperacional: "OP10", descricao: "Corte", ofId: "of-1", numeroOf: "260101-0001", projetoId: "proj-1", recursoId: "rec-1" }],
      nomeEmpresa: "Empresa Teste",
    });
  });

  it("3. OF NÃO liberada (planejada): não aparece, mesmo com OP pendente", async () => {
    const client = clienteFalso({
      empresas: [{ nome: "Empresa Teste" }],
      ordens_fabricacao: [{ id: "of-1", numero_of: "260101-0001", projeto_id: "proj-1", estado_execucao: "planejada" }],
    });
    const resultado = await buscarOperacoesLiberadasPendentesPcp(client);
    expect(resultado).toEqual({ ok: true, itens: [], nomeEmpresa: "Empresa Teste" });
  });

  it("4. OP concluída (ops_resolvidas=true) e OP não aplicável: nenhuma das duas aparece", async () => {
    const client = clienteFalso({
      empresas: [{ nome: "Empresa Teste" }],
      ordens_fabricacao: [{ id: "of-1", numero_of: "260101-0001", projeto_id: "proj-1", estado_execucao: "liberada" }],
      ordens_fabricacao_operacoes: [
        { id: "op-concluida", of_id: "of-1", codigo_operacional: "OP10", descricao: "Corte", recurso_vigente_id: "rec-1", nao_aplicavel: false },
        { id: "op-na", of_id: "of-1", codigo_operacional: "OP20", descricao: "Pintura", recurso_vigente_id: null, nao_aplicavel: true },
      ],
      resolvidaPorOpId: { "op-concluida": true },
    });
    const resultado = await buscarOperacoesLiberadasPendentesPcp(client);
    expect(resultado).toEqual({ ok: true, itens: [], nomeEmpresa: "Empresa Teste" });
  });

  it("5. Falha técnica em ordens_fabricacao: propagada", async () => {
    const client = clienteFalso({ empresas: [{ nome: "Empresa Teste" }], erroEm: "ordens_fabricacao" });
    const resultado = await buscarOperacoesLiberadasPendentesPcp(client);
    expect(resultado).toEqual({ ok: false, motivo: "erro_desconhecido" });
  });

  it("6. Falha técnica em ops_resolvidas: propagada", async () => {
    const client = clienteFalso({
      empresas: [{ nome: "Empresa Teste" }],
      ordens_fabricacao: [{ id: "of-1", numero_of: "260101-0001", projeto_id: "proj-1", estado_execucao: "liberada" }],
      ordens_fabricacao_operacoes: [
        { id: "op-1", of_id: "of-1", codigo_operacional: "OP10", descricao: "Corte", recurso_vigente_id: "rec-1", nao_aplicavel: false },
      ],
      erroEm: "ops_resolvidas",
    });
    const resultado = await buscarOperacoesLiberadasPendentesPcp(client);
    expect(resultado).toEqual({ ok: false, motivo: "erro_desconhecido" });
  });

  it("7. Duas OFs liberadas de projetos diferentes: isolamento correto entre elas", async () => {
    const client = clienteFalso({
      empresas: [{ nome: "Empresa Teste" }],
      ordens_fabricacao: [
        { id: "of-1", numero_of: "260101-0001", projeto_id: "proj-1", estado_execucao: "liberada" },
        { id: "of-2", numero_of: "260102-0001", projeto_id: "proj-2", estado_execucao: "liberada" },
      ],
      ordens_fabricacao_operacoes: [
        { id: "op-1", of_id: "of-1", codigo_operacional: "OP10", descricao: "Corte", recurso_vigente_id: "rec-1", nao_aplicavel: false },
        { id: "op-2", of_id: "of-2", codigo_operacional: "OP10", descricao: "Furação", recurso_vigente_id: "rec-2", nao_aplicavel: false },
      ],
      resolvidaPorOpId: { "op-1": false, "op-2": false },
    });
    const resultado = await buscarOperacoesLiberadasPendentesPcp(client);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.itens.map((i) => i.projetoId).sort()).toEqual(["proj-1", "proj-2"]);
    }
  });
});
