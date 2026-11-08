// PCP — Etapa 58B: fixtures isoladas, nenhuma gravação no Supabase.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarNecessidadesConfirmadasOfPcp } from "./buscarNecessidadesConfirmadasOfPcp";

type Linha = Record<string, unknown>;

function clienteFalso(fixtures: { necessidades_of_material: Linha[]; materias_primas: Linha[] }): SupabaseClient {
  return {
    from(tabela: string) {
      const base = (fixtures as Record<string, Linha[]>)[tabela] ?? [];
      let linhas = base.slice();
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
        then(resolve: (v: { data: unknown; error: null }) => void) {
          resolve({ data: linhas, error: null });
        },
      };
      return api;
    },
  } as unknown as SupabaseClient;
}

describe("buscarNecessidadesConfirmadasOfPcp", () => {
  it("1. necessidade confirmada via momento_y, versao_atual=true: aparece com descrição resolvida", async () => {
    const client = clienteFalso({
      necessidades_of_material: [
        {
          of_id: "of-1",
          materia_prima_id: "mp-1",
          origem_logica: "momento_y",
          versao_atual: true,
          quantidade_necessaria: 10,
          origem_fornecimento: "empresa",
          observacao_tecnica: "Confirmado pelo PCP",
        },
      ],
      materias_primas: [{ id: "mp-1", descricao: "Tubo quadrado", material_especificacao: "Aço 1020", unidade: "m" }],
    });
    const resultado = await buscarNecessidadesConfirmadasOfPcp(client, "of-1");
    expect(resultado).toEqual({
      ok: true,
      itens: [
        {
          materiaPrimaId: "mp-1",
          descricao: "Tubo quadrado",
          especificacao: "Aço 1020",
          unidade: "m",
          quantidadeNecessaria: 10,
          origemFornecimento: "empresa",
          observacaoTecnica: "Confirmado pelo PCP",
        },
      ],
    });
  });

  it("2. necessidade de origem_logica='bom_expansao' (legado) nunca aparece aqui - nunca mistura regimes", async () => {
    const client = clienteFalso({
      necessidades_of_material: [
        { of_id: "of-1", materia_prima_id: "mp-1", origem_logica: "bom_expansao", versao_atual: true, quantidade_necessaria: 5, origem_fornecimento: null, observacao_tecnica: null },
      ],
      materias_primas: [{ id: "mp-1", descricao: "Tubo", material_especificacao: null, unidade: "m" }],
    });
    const resultado = await buscarNecessidadesConfirmadasOfPcp(client, "of-1");
    expect(resultado).toEqual({ ok: true, itens: [] });
  });

  it("3. versao_atual=false (versão superada) nunca aparece - só a vigente", async () => {
    const client = clienteFalso({
      necessidades_of_material: [
        { of_id: "of-1", materia_prima_id: "mp-1", origem_logica: "momento_y", versao_atual: false, quantidade_necessaria: 5, origem_fornecimento: "empresa", observacao_tecnica: null },
      ],
      materias_primas: [],
    });
    const resultado = await buscarNecessidadesConfirmadasOfPcp(client, "of-1");
    expect(resultado).toEqual({ ok: true, itens: [] });
  });

  it("4. nenhuma necessidade confirmada ainda (situação real hoje para toda OF): lista vazia, nunca inventada", async () => {
    const client = clienteFalso({ necessidades_of_material: [], materias_primas: [] });
    const resultado = await buscarNecessidadesConfirmadasOfPcp(client, "of-1");
    expect(resultado).toEqual({ ok: true, itens: [] });
  });
});
