// Fase 2 do rollout da Entrega 2 (leitura dupla): prova que
// carregarSnapshotPersistido lê corretamente os dois formatos - legado
// (versao_resultado_motor=1, sintetizado dos 5 campos escalares) e novo
// (=2, tabela filha) -, ordena deterministicamente (operações e
// distribuições) e valida a consistência estrutural, lançando
// SnapshotInconsistenteError em vez de exibir dado silenciosamente
// errado.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarSnapshotPersistido } from "./carregarSnapshotPersistido";
import { SnapshotInconsistenteError } from "./errors";

type Base = {
  itens: Record<string, unknown>[];
  distribuicoes: Record<string, unknown>[];
  recursos: Record<string, unknown>[];
  operacoes: Record<string, unknown>[];
};

const TABELA_PARA_CHAVE: Record<string, keyof Base> = {
  simulacao_comercial_itens: "itens",
  simulacao_comercial_item_distribuicoes: "distribuicoes",
  recursos_produtivos: "recursos",
  bom_operacoes: "operacoes",
};

function criarClienteFalso(base: Base): SupabaseClient {
  function builderPara(tabela: string) {
    const filtrosEq: Record<string, unknown> = {};
    let filtroIn: { coluna: string; valores: unknown[] } | null = null;
    let ordenacao: { coluna: string; ascending: boolean } | null = null;

    const builder = {
      select() {
        return builder;
      },
      eq(coluna: string, valor: unknown) {
        filtrosEq[coluna] = valor;
        return builder;
      },
      in(coluna: string, valores: unknown[]) {
        filtroIn = { coluna, valores };
        return builder;
      },
      order(coluna: string, opcoes?: { ascending?: boolean }) {
        ordenacao = { coluna, ascending: opcoes?.ascending ?? true };
        return builder;
      },
      then(resolve: (valor: { data: unknown[]; error: null }) => void) {
        const chave = TABELA_PARA_CHAVE[tabela];
        const linhas = chave ? base[chave] : [];
        let filtradas = linhas.filter((linha) => {
          for (const [coluna, valor] of Object.entries(filtrosEq)) {
            if (linha[coluna] !== valor) return false;
          }
          if (filtroIn && !filtroIn.valores.includes(linha[filtroIn.coluna])) {
            return false;
          }
          return true;
        });

        if (ordenacao) {
          const { coluna, ascending } = ordenacao;
          filtradas = [...filtradas].sort((a, b) => {
            const valorA = a[coluna] as number;
            const valorB = b[coluna] as number;
            return ascending ? valorA - valorB : valorB - valorA;
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

function itemBase(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    simulacao_comercial_id: "sim-1",
    bom_operacao_id: "op-1",
    recurso_original_id: "recurso-1",
    versao_resultado_motor: 1,
    necessario: 10,
    deficit: 0,
    recurso_considerado_id: null,
    motivo_consideracao: null,
    capacidade_bruta: null,
    capacidade_efetiva: null,
    comprometido: null,
    livre: null,
    ...overrides,
  };
}

function distribuicaoBase(overrides: Record<string, unknown> = {}) {
  return {
    simulacao_comercial_item_id: "item-1",
    recurso_id: "recurso-1",
    origem: "ORIGINAL",
    ordem_consideracao: 0,
    capacidade_bruta_periodo: 100,
    produtividade_considerada: 0.8,
    capacidade_efetiva: 80,
    comprometido_inicial: 0,
    capacidade_disponivel_inicial: 80,
    capacidade_disponivel_antes: 80,
    horas_padrao_alocadas: 10,
    horas_maquina_estimadas: 12.5,
    capacidade_disponivel_depois: 70,
    ...overrides,
  };
}

describe("carregarSnapshotPersistido", () => {
  it("legado (versao=1) com 1 recurso: sintetiza 1 distribuição, derivando produtividade dos valores congelados", async () => {
    const client = criarClienteFalso({
      itens: [
        itemBase({
          necessario: 10,
          deficit: 0,
          recurso_considerado_id: "recurso-1",
          motivo_consideracao: "ORIGINAL",
          capacidade_bruta: 100,
          capacidade_efetiva: 80,
          comprometido: 20,
          livre: 60,
        }),
      ],
      distribuicoes: [],
      recursos: [{ id: "recurso-1", nome: "Torno 1", codigo: "T1" }],
      operacoes: [{ id: "op-1", descricao: "Furar", ordem: 1 }],
    });

    const resultado = await carregarSnapshotPersistido(client, "sim-1");

    expect(resultado).toHaveLength(1);
    expect(resultado[0].versaoResultadoMotor).toBe(1);
    expect(resultado[0].distribuicoes).toHaveLength(1);
    expect(resultado[0].distribuicoes[0].produtividadeConsiderada).toBe(0.8);
    expect(resultado[0].distribuicoes[0].capacidadeDisponivelInicial).toBe(60);
    expect(resultado[0].distribuicoes[0].capacidadeDisponivelAntes).toBeNull();
    expect(resultado[0].distribuicoes[0].capacidadeDisponivelDepois).toBeNull();
    expect(resultado[0].distribuicoes[0].horasMaquinaEstimadas).toBe(12.5);
  });

  it("legado (versao=1) em déficit total: zero distribuições, igual ao formato novo", async () => {
    const client = criarClienteFalso({
      itens: [itemBase({ necessario: 10, deficit: 10 })],
      distribuicoes: [],
      recursos: [{ id: "recurso-1", nome: "Torno 1", codigo: "T1" }],
      operacoes: [{ id: "op-1", descricao: "Furar", ordem: 1 }],
    });

    const resultado = await carregarSnapshotPersistido(client, "sim-1");

    expect(resultado[0].distribuicoes).toEqual([]);
    expect(resultado[0].deficit).toBe(10);
  });

  it("novo (versao=2): carrega a tabela filha com fidelidade total e ordena por ordem_consideracao", async () => {
    const client = criarClienteFalso({
      itens: [itemBase({ versao_resultado_motor: 2, necessario: 200, deficit: 0 })],
      distribuicoes: [
        // Propositalmente fora de ordem no fixture - o resultado tem
        // que sair ordenado por ordem_consideracao (0 = original,
        // depois prioridade cadastrada), não na ordem do fixture.
        distribuicaoBase({
          recurso_id: "recurso-2",
          origem: "COMPATIBILIDADE",
          ordem_consideracao: 1,
          capacidade_bruta_periodo: 60,
          produtividade_considerada: 1,
          capacidade_efetiva: 60,
          capacidade_disponivel_inicial: 60,
          capacidade_disponivel_antes: 60,
          horas_padrao_alocadas: 60,
          horas_maquina_estimadas: 60,
          capacidade_disponivel_depois: 0,
        }),
        distribuicaoBase({
          recurso_id: "recurso-1",
          origem: "ORIGINAL",
          ordem_consideracao: 0,
          capacidade_bruta_periodo: 175,
          produtividade_considerada: 0.8,
          capacidade_efetiva: 140,
          capacidade_disponivel_inicial: 140,
          capacidade_disponivel_antes: 140,
          horas_padrao_alocadas: 140,
          horas_maquina_estimadas: 175,
          capacidade_disponivel_depois: 0,
        }),
      ],
      recursos: [
        { id: "recurso-1", nome: "Torno 1", codigo: "T1" },
        { id: "recurso-2", nome: "Torno 2", codigo: "T2" },
      ],
      operacoes: [{ id: "op-1", descricao: "Furar", ordem: 1 }],
    });

    const resultado = await carregarSnapshotPersistido(client, "sim-1");

    expect(resultado[0].versaoResultadoMotor).toBe(2);
    expect(resultado[0].distribuicoes).toHaveLength(2);
    // Ordenado por ordem_consideracao: original (0) primeiro, mesmo
    // que o fixture tenha entregue o compatível (1) antes.
    expect(resultado[0].distribuicoes.map((d) => d.recursoNome)).toEqual(["T1 — Torno 1", "T2 — Torno 2"]);
    expect(resultado[0].distribuicoes[0].capacidadeDisponivelAntes).toBe(140);
    expect(resultado[0].distribuicoes[0].capacidadeDisponivelDepois).toBe(0);
  });

  it("ordena as operações do snapshot por bom_operacoes.ordem, com bomOperacaoId como desempate estável", async () => {
    const client = criarClienteFalso({
      itens: [
        itemBase({ id: "item-2", bom_operacao_id: "op-2", necessario: 5, deficit: 5 }),
        itemBase({ id: "item-1", bom_operacao_id: "op-1", necessario: 3, deficit: 3 }),
      ],
      distribuicoes: [],
      recursos: [{ id: "recurso-1", nome: "Torno 1", codigo: "T1" }],
      operacoes: [
        { id: "op-2", descricao: "Furar", ordem: 2 },
        { id: "op-1", descricao: "Tornear", ordem: 1 },
      ],
    });

    const resultado = await carregarSnapshotPersistido(client, "sim-1");

    expect(resultado.map((op) => op.bomOperacaoId)).toEqual(["op-1", "op-2"]);
  });

  it("REJEITA item versao=1 com filhos em simulacao_comercial_item_distribuicoes - inconsistência estrutural", async () => {
    const client = criarClienteFalso({
      itens: [itemBase({ versao_resultado_motor: 1, necessario: 10, deficit: 0, recurso_considerado_id: "recurso-1", motivo_consideracao: "ORIGINAL", capacidade_bruta: 100, capacidade_efetiva: 80, comprometido: 0, livre: 80 })],
      distribuicoes: [distribuicaoBase()],
      recursos: [{ id: "recurso-1", nome: "Torno 1", codigo: "T1" }],
      operacoes: [{ id: "op-1", descricao: "Furar", ordem: 1 }],
    });

    await expect(carregarSnapshotPersistido(client, "sim-1")).rejects.toThrow(SnapshotInconsistenteError);
  });

  it("REJEITA item versao=2 sem filhos quando déficit != necessário", async () => {
    const client = criarClienteFalso({
      itens: [itemBase({ versao_resultado_motor: 2, necessario: 10, deficit: 4 })], // deveria ser deficit=10 se 0 filhos
      distribuicoes: [],
      recursos: [{ id: "recurso-1", nome: "Torno 1", codigo: "T1" }],
      operacoes: [{ id: "op-1", descricao: "Furar", ordem: 1 }],
    });

    await expect(carregarSnapshotPersistido(client, "sim-1")).rejects.toThrow(SnapshotInconsistenteError);
  });

  it("REJEITA item versao=2 cuja soma das distribuições + déficit não fecha com necessário", async () => {
    const client = criarClienteFalso({
      itens: [itemBase({ versao_resultado_motor: 2, necessario: 10, deficit: 0 })],
      distribuicoes: [distribuicaoBase({ horas_padrao_alocadas: 6 })], // 6 + 0 != 10
      recursos: [{ id: "recurso-1", nome: "Torno 1", codigo: "T1" }],
      operacoes: [{ id: "op-1", descricao: "Furar", ordem: 1 }],
    });

    await expect(carregarSnapshotPersistido(client, "sim-1")).rejects.toThrow(SnapshotInconsistenteError);
  });

  it("ACEITA item versao=2 cuja soma + déficit fecha dentro da tolerância EPSILON_HORAS", async () => {
    const client = criarClienteFalso({
      itens: [itemBase({ versao_resultado_motor: 2, necessario: 10, deficit: 4 })],
      distribuicoes: [distribuicaoBase({ horas_padrao_alocadas: 6 + 1e-9 })], // 6.000000001 + 4 ≈ 10
      recursos: [{ id: "recurso-1", nome: "Torno 1", codigo: "T1" }],
      operacoes: [{ id: "op-1", descricao: "Furar", ordem: 1 }],
    });

    const resultado = await carregarSnapshotPersistido(client, "sim-1");
    expect(resultado[0].distribuicoes).toHaveLength(1);
  });
});
