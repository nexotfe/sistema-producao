// Fase 0 da Entrega 3 (Calculador Reverso): coletarEstruturaBom.ts nunca
// teve teste automatizado - achado registrado no PAD-008 §19.4 na
// Entrega 2 e carregado como pendência até esta rodada. Cobre a
// travessia recursiva de subconjuntos, o multiplicador de quantidade
// acumulada, ordenação por `ordem`, o erro de operação sem recurso e o
// limite defensivo de profundidade.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { coletarEstruturaBom } from "./coletarEstruturaBom";
import { OperacaoSemRecursoError, ProfundidadeMaximaBomError } from "./errors";

type BomRow = { id: string; produto_id: string; status: string; created_at: string; ativo: boolean; deleted_at: string | null };
type OperacaoRow = {
  id: string;
  bom_id: string;
  ordem: number;
  tempo_estimado_minutos: number;
  recurso_produtivo_id: string | null;
  ativo: boolean;
  deleted_at: string | null;
};
type ItemRow = {
  bom_id: string;
  quantidade: number;
  componente_produto_id: string;
  componente_tipo: string;
  ativo: boolean;
  deleted_at: string | null;
  ordem: number;
};

type Base = {
  boms: BomRow[];
  operacoes: OperacaoRow[];
  itens: ItemRow[];
};

function criarClienteFalso(base: Base): SupabaseClient {
  function builderPara(tabela: string) {
    const filtrosEq: Record<string, unknown> = {};
    const ordenacao: { coluna: string; ascending: boolean }[] = [];

    const builder = {
      select() {
        return builder;
      },
      eq(coluna: string, valor: unknown) {
        filtrosEq[coluna] = valor;
        return builder;
      },
      is(coluna: string, valor: unknown) {
        filtrosEq[coluna] = valor;
        return builder;
      },
      order(coluna: string, opcoes?: { ascending?: boolean }) {
        ordenacao.push({ coluna, ascending: opcoes?.ascending ?? true });
        return builder;
      },
      then(resolve: (valor: { data: unknown[]; error: null }) => void) {
        const linhas: Record<string, unknown>[] =
          tabela === "boms"
            ? (base.boms as unknown as Record<string, unknown>[])
            : tabela === "bom_operacoes"
              ? (base.operacoes as unknown as Record<string, unknown>[])
              : tabela === "bom_itens"
                ? (base.itens as unknown as Record<string, unknown>[])
                : (() => {
                    throw new Error(`Tabela não suportada no cliente falso: ${tabela}`);
                  })();

        let filtradas = linhas.filter((linha) => {
          for (const [coluna, valor] of Object.entries(filtrosEq)) {
            if (linha[coluna] !== valor) return false;
          }
          return true;
        });

        if (ordenacao.length > 0) {
          filtradas = [...filtradas].sort((a, b) => {
            for (const { coluna, ascending } of ordenacao) {
              const valorA = String(a[coluna] ?? "");
              const valorB = String(b[coluna] ?? "");
              if (valorA !== valorB) return ascending ? (valorA < valorB ? -1 : 1) : valorA < valorB ? 1 : -1;
            }
            return 0;
          });
        }

        resolve({ data: filtradas, error: null });
      },
    };

    return builder;
  }

  return {
    from(tabela: string) {
      return builderPara(tabela);
    },
  } as unknown as SupabaseClient;
}

function bom(overrides: Partial<BomRow> = {}): BomRow {
  return { id: "bom-1", produto_id: "produto-1", status: "ativo", created_at: "2026-01-01", ativo: true, deleted_at: null, ...overrides };
}

function operacao(overrides: Partial<OperacaoRow> = {}): OperacaoRow {
  return {
    id: "op-1",
    bom_id: "bom-1",
    ordem: 10,
    tempo_estimado_minutos: 30,
    recurso_produtivo_id: "recurso-1",
    ativo: true,
    deleted_at: null,
    ...overrides,
  };
}

function itemSubconjunto(overrides: Partial<ItemRow> = {}): ItemRow {
  return {
    bom_id: "bom-1",
    quantidade: 1,
    componente_produto_id: "produto-2",
    componente_tipo: "subconjunto",
    ativo: true,
    deleted_at: null,
    ordem: 10,
    ...overrides,
  };
}

describe("coletarEstruturaBom", () => {
  it("coleta as operações de um BOM sem subconjuntos, na ordem de `ordem`", async () => {
    const client = criarClienteFalso({
      boms: [],
      operacoes: [
        operacao({ id: "op-20", ordem: 20, recurso_produtivo_id: "recurso-b" }),
        operacao({ id: "op-10", ordem: 10, recurso_produtivo_id: "recurso-a" }),
      ],
      itens: [],
    });

    const resultado = await coletarEstruturaBom(client, "bom-1", 3);

    expect(resultado.map((op) => op.bomOperacaoId)).toEqual(["op-10", "op-20"]);
    expect(resultado[0].quantidadeAcumulada).toBe(3);
    expect(resultado[0].recursoProdutivoId).toBe("recurso-a");
  });

  it("multiplica a quantidade acumulada ao descer em subconjunto (quantidade do consumidor × quantidade do subconjunto)", async () => {
    const client = criarClienteFalso({
      boms: [bom({ id: "bom-filho", produto_id: "produto-2", status: "ativo" })],
      operacoes: [
        operacao({ id: "op-pai", bom_id: "bom-1", ordem: 10 }),
        operacao({ id: "op-filho", bom_id: "bom-filho", ordem: 10, recurso_produtivo_id: "recurso-filho" }),
      ],
      itens: [itemSubconjunto({ bom_id: "bom-1", componente_produto_id: "produto-2", quantidade: 4 })],
    });

    // quantidadeAcumulada inicial = 2 (ex.: projeto_item.quantidade=2);
    // subconjunto usa 4 unidades por pai -> operação do filho deve
    // acumular 2 * 4 = 8.
    const resultado = await coletarEstruturaBom(client, "bom-1", 2);

    const pai = resultado.find((op) => op.bomOperacaoId === "op-pai");
    const filho = resultado.find((op) => op.bomOperacaoId === "op-filho");

    expect(pai?.quantidadeAcumulada).toBe(2);
    expect(filho?.quantidadeAcumulada).toBe(8);
  });

  it("operações do BOM pai aparecem antes das operações do subconjunto na lista resultante", async () => {
    const client = criarClienteFalso({
      boms: [bom({ id: "bom-filho", produto_id: "produto-2" })],
      operacoes: [
        operacao({ id: "op-pai", bom_id: "bom-1", ordem: 10 }),
        operacao({ id: "op-filho", bom_id: "bom-filho", ordem: 5, recurso_produtivo_id: "recurso-filho" }),
      ],
      itens: [itemSubconjunto({ bom_id: "bom-1", componente_produto_id: "produto-2", quantidade: 1 })],
    });

    const resultado = await coletarEstruturaBom(client, "bom-1", 1);

    expect(resultado.map((op) => op.bomOperacaoId)).toEqual(["op-pai", "op-filho"]);
  });

  it("desce recursivamente em múltiplos níveis de subconjunto, multiplicando a cada nível", async () => {
    const client = criarClienteFalso({
      boms: [
        bom({ id: "bom-nivel2", produto_id: "produto-nivel2" }),
        bom({ id: "bom-nivel3", produto_id: "produto-nivel3" }),
      ],
      operacoes: [
        operacao({ id: "op-nivel3", bom_id: "bom-nivel3", recurso_produtivo_id: "recurso-3" }),
      ],
      itens: [
        itemSubconjunto({ bom_id: "bom-1", componente_produto_id: "produto-nivel2", quantidade: 2 }),
        itemSubconjunto({ bom_id: "bom-nivel2", componente_produto_id: "produto-nivel3", quantidade: 5 }),
      ],
    });

    // acumulado inicial 1 -> nivel2 (x2) -> nivel3 (x5) = 10
    const resultado = await coletarEstruturaBom(client, "bom-1", 1);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].quantidadeAcumulada).toBe(10);
  });

  it("ignora item de bom_itens cujo componente não tem BOM ativo (resolverBomAtivo retorna null) - sem lançar erro", async () => {
    const client = criarClienteFalso({
      boms: [], // nenhum BOM cadastrado para produto-2
      operacoes: [operacao({ id: "op-pai", bom_id: "bom-1" })],
      itens: [itemSubconjunto({ bom_id: "bom-1", componente_produto_id: "produto-2" })],
    });

    const resultado = await coletarEstruturaBom(client, "bom-1", 1);

    expect(resultado.map((op) => op.bomOperacaoId)).toEqual(["op-pai"]);
  });

  it("lança OperacaoSemRecursoError quando uma operação não tem recurso_produtivo_id", async () => {
    const client = criarClienteFalso({
      boms: [],
      operacoes: [operacao({ id: "op-sem-recurso", recurso_produtivo_id: null })],
      itens: [],
    });

    await expect(coletarEstruturaBom(client, "bom-1", 1)).rejects.toThrow(OperacaoSemRecursoError);
  });

  it("lança ProfundidadeMaximaBomError contra referência circular entre subconjuntos", async () => {
    const client = criarClienteFalso({
      boms: [bom({ id: "bom-1", produto_id: "produto-1" })], // produto-1 resolve para o próprio bom-1
      operacoes: [],
      itens: [itemSubconjunto({ bom_id: "bom-1", componente_produto_id: "produto-1", quantidade: 1 })],
    });

    await expect(coletarEstruturaBom(client, "bom-1", 1)).rejects.toThrow(ProfundidadeMaximaBomError);
  });

  it("ignora operações e itens inativos ou com deleted_at preenchido", async () => {
    const client = criarClienteFalso({
      boms: [],
      operacoes: [
        operacao({ id: "op-ativa", ordem: 10 }),
        operacao({ id: "op-inativa", ordem: 20, ativo: false }),
        operacao({ id: "op-deletada", ordem: 30, deleted_at: "2026-01-01" }),
      ],
      itens: [],
    });

    const resultado = await coletarEstruturaBom(client, "bom-1", 1);

    expect(resultado.map((op) => op.bomOperacaoId)).toEqual(["op-ativa"]);
  });
});
