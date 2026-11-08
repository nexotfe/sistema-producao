// Operações de Produção (Fase 1 - leitura + Etapa 59A - origem/apontamento
// reais): fixtures isoladas, nenhuma gravação no Supabase. Cobre os 3
// estados (nao_aplicavel/concluida/pendente), origem (roteiro/y),
// existência real de apontamento, recurso/tempo ausentes, propagação de
// erro de cada fonte, e isolamento entre OFs diferentes na mesma fixture.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarOperacoesOfPcp } from "./buscarOperacoesOfPcp";

type Linha = Record<string, unknown>;

interface Fixtures {
  ordens_fabricacao_operacoes: Linha[];
  recursos_produtivos: Linha[];
  of_apontamentos: Linha[];
  resolvidaPorOpId?: Record<string, boolean>;
  erroEm?: "ordens_fabricacao_operacoes" | "recursos_produtivos" | "ops_resolvidas" | "of_apontamentos";
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
        order(coluna: string, opts?: { ascending?: boolean }) {
          linhas = linhas.slice().sort((a, b) => {
            const av = a[coluna] as number;
            const bv = b[coluna] as number;
            return opts?.ascending === false ? bv - av : av - bv;
          });
          return api;
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

describe("buscarOperacoesOfPcp", () => {
  it("1. OF sem nenhuma operação: lista vazia, sem erro, sem chamar ops_resolvidas", async () => {
    const client = clienteFalso({ ordens_fabricacao_operacoes: [], recursos_produtivos: [], of_apontamentos: [] });
    const resultado = await buscarOperacoesOfPcp(client, "of-1");
    expect(resultado).toEqual({ ok: true, operacoes: [] });
  });

  it("2. Os 3 estados reais: nao_aplicavel tem prioridade sobre ops_resolvidas, mesmo se a RPC marcar como resolvida", async () => {
    const client = clienteFalso({
      ordens_fabricacao_operacoes: [
        { id: "op-1", of_id: "of-1", codigo_operacional: "OP10", descricao: "Corte", sequencia_vigente: 1, recurso_vigente_id: "rec-1", tempo_vigente_minutos: 30, nao_aplicavel: false, motivo_nao_aplicavel: null, origem: "roteiro" },
        { id: "op-2", of_id: "of-1", codigo_operacional: "OP20", descricao: "Furação", sequencia_vigente: 2, recurso_vigente_id: "rec-2", tempo_vigente_minutos: 45, nao_aplicavel: false, motivo_nao_aplicavel: null, origem: "roteiro" },
        { id: "op-3", of_id: "of-1", codigo_operacional: "OP30", descricao: "Pintura", sequencia_vigente: 3, recurso_vigente_id: null, tempo_vigente_minutos: null, nao_aplicavel: true, motivo_nao_aplicavel: "Item não pintado neste pedido", origem: "roteiro" },
      ],
      recursos_produtivos: [
        { id: "rec-1", nome: "Torno CNC 01" },
        { id: "rec-2", nome: "Furadeira 02" },
      ],
      of_apontamentos: [{ op_id: "op-1" }],
      // op-3 é nao_aplicavel=true - mesmo que a RPC (hipoteticamente)
      // devolvesse resolvida=true por esse motivo, não deve aparecer
      // como "concluida" aqui.
      resolvidaPorOpId: { "op-1": true, "op-2": false, "op-3": true },
    });
    const resultado = await buscarOperacoesOfPcp(client, "of-1");
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.operacoes.map((o) => [o.codigoOperacional, o.situacao, o.recursoNome, o.tempoPlanejadoMinutos])).toEqual([
        ["OP10", "concluida", "Torno CNC 01", 30],
        ["OP20", "pendente", "Furadeira 02", 45],
        ["OP30", "nao_aplicavel", null, null],
      ]);
      expect(resultado.operacoes[2].motivoNaoAplicavel).toBe("Item não pintado neste pedido");
    }
  });

  it("3. Recurso e tempo ausentes (OP nascida no Y, sem planejamento completo): nunca inventa valor", async () => {
    const client = clienteFalso({
      ordens_fabricacao_operacoes: [
        { id: "op-9", of_id: "of-1", codigo_operacional: "OP90", descricao: "Inspeção final", sequencia_vigente: 1, recurso_vigente_id: null, tempo_vigente_minutos: null, nao_aplicavel: false, motivo_nao_aplicavel: null, origem: "y" },
      ],
      recursos_produtivos: [],
      of_apontamentos: [],
      resolvidaPorOpId: {},
    });
    const resultado = await buscarOperacoesOfPcp(client, "of-1");
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.operacoes[0].recursoNome).toBeNull();
      expect(resultado.operacoes[0].tempoPlanejadoMinutos).toBeNull();
      expect(resultado.operacoes[0].situacao).toBe("pendente");
    }
  });

  it("4. Erro ao consultar ordens_fabricacao_operacoes: propaga falha, nunca lista vazia disfarçada", async () => {
    const client = clienteFalso({
      ordens_fabricacao_operacoes: [],
      recursos_produtivos: [],
      of_apontamentos: [],
      erroEm: "ordens_fabricacao_operacoes",
    });
    const resultado = await buscarOperacoesOfPcp(client, "of-1");
    expect(resultado).toEqual({ ok: false, motivo: "erro_desconhecido" });
  });

  it("5. Erro ao consultar recursos_produtivos: propaga falha", async () => {
    const client = clienteFalso({
      ordens_fabricacao_operacoes: [
        { id: "op-1", of_id: "of-1", codigo_operacional: "OP10", descricao: "Corte", sequencia_vigente: 1, recurso_vigente_id: "rec-1", tempo_vigente_minutos: 30, nao_aplicavel: false, motivo_nao_aplicavel: null, origem: "roteiro" },
      ],
      recursos_produtivos: [],
      of_apontamentos: [],
      erroEm: "recursos_produtivos",
    });
    const resultado = await buscarOperacoesOfPcp(client, "of-1");
    expect(resultado).toEqual({ ok: false, motivo: "erro_desconhecido" });
  });

  it("6. Erro ao consultar ops_resolvidas: propaga falha, nunca assume pendente/concluída por omissão", async () => {
    const client = clienteFalso({
      ordens_fabricacao_operacoes: [
        { id: "op-1", of_id: "of-1", codigo_operacional: "OP10", descricao: "Corte", sequencia_vigente: 1, recurso_vigente_id: null, tempo_vigente_minutos: null, nao_aplicavel: false, motivo_nao_aplicavel: null, origem: "roteiro" },
      ],
      recursos_produtivos: [],
      of_apontamentos: [],
      erroEm: "ops_resolvidas",
    });
    const resultado = await buscarOperacoesOfPcp(client, "of-1");
    expect(resultado).toEqual({ ok: false, motivo: "erro_desconhecido" });
  });

  it("7. Isolamento entre OFs diferentes na mesma fixture (of_id filtra corretamente)", async () => {
    const client = clienteFalso({
      ordens_fabricacao_operacoes: [
        { id: "op-1", of_id: "of-1", codigo_operacional: "OP10", descricao: "Corte", sequencia_vigente: 1, recurso_vigente_id: null, tempo_vigente_minutos: null, nao_aplicavel: false, motivo_nao_aplicavel: null, origem: "roteiro" },
        { id: "op-2", of_id: "of-2", codigo_operacional: "OP10", descricao: "Corte (outra OF)", sequencia_vigente: 1, recurso_vigente_id: null, tempo_vigente_minutos: null, nao_aplicavel: false, motivo_nao_aplicavel: null, origem: "roteiro" },
      ],
      recursos_produtivos: [],
      of_apontamentos: [],
      resolvidaPorOpId: {},
    });
    const resultado = await buscarOperacoesOfPcp(client, "of-2");
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.operacoes.map((o) => o.opId)).toEqual(["op-2"]);
    }
  });

  it("8. Origem real: 'roteiro' e 'y' são distinguidos, nunca derivados", async () => {
    const client = clienteFalso({
      ordens_fabricacao_operacoes: [
        { id: "op-1", of_id: "of-1", codigo_operacional: "OP10", descricao: "Corte", sequencia_vigente: 1, recurso_vigente_id: null, tempo_vigente_minutos: null, nao_aplicavel: false, motivo_nao_aplicavel: null, origem: "roteiro" },
        { id: "op-2", of_id: "of-1", codigo_operacional: "OP45", descricao: "Inspeção extra", sequencia_vigente: 2, recurso_vigente_id: null, tempo_vigente_minutos: null, nao_aplicavel: false, motivo_nao_aplicavel: null, origem: "y" },
      ],
      recursos_produtivos: [],
      of_apontamentos: [],
      resolvidaPorOpId: {},
    });
    const resultado = await buscarOperacoesOfPcp(client, "of-1");
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.operacoes.map((o) => [o.codigoOperacional, o.origem])).toEqual([
        ["OP10", "roteiro"],
        ["OP45", "y"],
      ]);
    }
  });

  it("9. temApontamento reflete a existência real em of_apontamentos, mesmo para OP 'pendente' (pendente não prova que nunca foi iniciada)", async () => {
    const client = clienteFalso({
      ordens_fabricacao_operacoes: [
        { id: "op-1", of_id: "of-1", codigo_operacional: "OP10", descricao: "Corte", sequencia_vigente: 1, recurso_vigente_id: null, tempo_vigente_minutos: null, nao_aplicavel: false, motivo_nao_aplicavel: null, origem: "roteiro" },
        { id: "op-2", of_id: "of-1", codigo_operacional: "OP20", descricao: "Furação", sequencia_vigente: 2, recurso_vigente_id: null, tempo_vigente_minutos: null, nao_aplicavel: false, motivo_nao_aplicavel: null, origem: "roteiro" },
      ],
      recursos_produtivos: [],
      // op-1 já tem um apontamento 'iniciar' real, mas não 'finalizar' -
      // continua "pendente" pela regra de situação, mas temApontamento
      // precisa ser true mesmo assim.
      of_apontamentos: [{ op_id: "op-1" }],
      resolvidaPorOpId: { "op-1": false, "op-2": false },
    });
    const resultado = await buscarOperacoesOfPcp(client, "of-1");
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const [op1, op2] = resultado.operacoes;
      expect(op1.situacao).toBe("pendente");
      expect(op1.temApontamento).toBe(true);
      expect(op2.situacao).toBe("pendente");
      expect(op2.temApontamento).toBe(false);
    }
  });

  it("10. Erro ao consultar of_apontamentos: propaga falha, nunca assume ausência de execução por omissão", async () => {
    const client = clienteFalso({
      ordens_fabricacao_operacoes: [
        { id: "op-1", of_id: "of-1", codigo_operacional: "OP10", descricao: "Corte", sequencia_vigente: 1, recurso_vigente_id: null, tempo_vigente_minutos: null, nao_aplicavel: false, motivo_nao_aplicavel: null, origem: "roteiro" },
      ],
      recursos_produtivos: [],
      of_apontamentos: [],
      erroEm: "of_apontamentos",
    });
    const resultado = await buscarOperacoesOfPcp(client, "of-1");
    expect(resultado).toEqual({ ok: false, motivo: "erro_desconhecido" });
  });
});
