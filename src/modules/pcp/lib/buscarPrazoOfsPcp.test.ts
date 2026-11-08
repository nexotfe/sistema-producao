// PCP — Etapa 52: fixtures isoladas. buscarProgramacaoVigentePcp é
// injetada como fixture direta (a própria ProgramacaoVigentePcp já
// montada) para não reimplementar aqui toda a cadeia de consultas
// daquela função (que já é responsabilidade exclusiva dela, B5.1) -
// este teste cobre só a composição nova desta etapa: a busca em lote de
// ordens_fabricacao_operacoes + o encaixe com classificarPrazoOfPcp.
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarPrazoOfsPcp } from "./buscarPrazoOfsPcp";
import type { ProgramacaoVigentePcp } from "./buscarProgramacaoVigentePcp";

type Linha = Record<string, unknown>;

/**
 * `opsResolvidas`: fixture da resposta da RPC oficial ops_resolvidas
 * (Etapa 53) - cada linha `{op_id, resolvida}`. Por padrão vazia (nenhum
 * id reconhecido como resolvido), preservando o comportamento das
 * Etapas 51/52 em todos os testes que não mencionam resolução.
 * `rpcImpl` permite um mock customizado (contagem de chamadas, erro
 * simulado etc.) para os testes específicos de lote/falha da Etapa 53.
 */
function clienteFalso(
  operacoesOf: Linha[],
  opsResolvidas: Linha[] = [],
  rpcImpl?: (nome: string, params: { p_op_ids: readonly string[] }) => Promise<{ data: unknown; error: { message: string } | null }>,
): SupabaseClient {
  return {
    from(tabela: string) {
      if (tabela !== "ordens_fabricacao_operacoes") {
        throw new Error(`clienteFalso: tabela inesperada neste teste: ${tabela}`);
      }
      let linhas = operacoesOf.slice();
      const api = {
        select(_cols: string) {
          return api;
        },
        in(coluna: string, valores: unknown[]) {
          linhas = linhas.filter((l) => valores.includes(l[coluna]));
          return api;
        },
        eq(coluna: string, valor: unknown) {
          linhas = linhas.filter((l) => l[coluna] === valor);
          return api;
        },
        then(resolve: (v: { data: unknown; error: null }) => void) {
          resolve({ data: linhas, error: null });
        },
      };
      return api;
    },
    rpc(nome: string, params: { p_op_ids: readonly string[] }) {
      if (rpcImpl) return rpcImpl(nome, params);
      if (nome !== "ops_resolvidas") {
        throw new Error(`clienteFalso: rpc inesperada neste teste: ${nome}`);
      }
      const linhas = opsResolvidas.filter((l) => params.p_op_ids.includes(l.op_id as string));
      return Promise.resolve({ data: linhas, error: null });
    },
  } as unknown as SupabaseClient;
}

function programacaoFixture(params: {
  versaoOrigem?: number;
  versaoAtual?: number;
  janelaFim?: string;
  operacoes: ProgramacaoVigentePcp["operacoes"];
}): ProgramacaoVigentePcp {
  return {
    programacaoId: "prog-1",
    versaoSequencial: 1,
    empresaCapacidadeVersaoOrigem: params.versaoOrigem ?? 10,
    nomeEmpresa: "Empresa Teste",
    janelaInicio: "2026-11-01",
    janelaFim: params.janelaFim ?? "2026-11-10",
    criadaEm: "2026-11-01T00:00:00Z",
    criadaPor: "user-1",
    motivo: null,
    operacoes: params.operacoes,
    versaoCapacidadeAtual: params.versaoAtual ?? 10,
  };
}

function operacaoFixture(params: {
  opId: string;
  ofId: string;
  status: ProgramacaoVigentePcp["operacoes"][number]["statusCalculoMotor"];
  dataFimPrevista: string | null;
  deficit?: number;
  alocacoes?: number;
}): ProgramacaoVigentePcp["operacoes"][number] {
  return {
    opId: params.opId,
    codigoOperacional: "OP10",
    descricaoOperacao: "Operação teste",
    ofId: params.ofId,
    numeroOf: "260099-0001",
    projetoId: "proj-1",
    numeroProjeto: "260099",
    nomeProjeto: "Projeto teste",
    prioridadeUsada: 1,
    statusCalculoMotor: params.status,
    dataInicioPrevista: params.dataFimPrevista,
    dataFimPrevista: params.dataFimPrevista,
    deficitResidualHorasPadrao: params.deficit ?? 0,
    alocacoes: Array.from({ length: params.alocacoes ?? 1 }, (_, i) => ({
      data: "2026-11-02",
      recursoId: `rec-${i}`,
      nomeRecurso: "Recurso teste",
      natureza: "normal",
      horasMaquina: 1,
      horasPadrao: 1,
    })),
  };
}

const HOJE = "2026-11-05";

describe("buscarPrazoOfsPcp", () => {
  it("1. OF com uma operação: previsão disponível", async () => {
    const programacao = programacaoFixture({
      operacoes: [operacaoFixture({ opId: "op-1", ofId: "of-1", status: "concluida", dataFimPrevista: "2026-11-07" })],
    });
    const client = clienteFalso([{ id: "op-1", of_id: "of-1", nao_aplicavel: false }]);
    const resultado = await buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => programacao });
    expect(resultado.get("of-1")).toEqual({
      estado: "previsao_disponivel",
      terminoPrevisto: "2026-11-07",
      operacoes: [{ opId: "op-1", classificacao: "sem_deficit", dataFimPrevista: "2026-11-07" }],
    });
  });

  it("2. OF com várias operações: término é o mais tardio entre elas", async () => {
    const programacao = programacaoFixture({
      operacoes: [
        operacaoFixture({ opId: "op-1", ofId: "of-1", status: "concluida", dataFimPrevista: "2026-11-06" }),
        operacaoFixture({ opId: "op-2", ofId: "of-1", status: "concluida", dataFimPrevista: "2026-11-09" }),
      ],
    });
    const client = clienteFalso([
      { id: "op-1", of_id: "of-1", nao_aplicavel: false },
      { id: "op-2", of_id: "of-1", nao_aplicavel: false },
    ]);
    const resultado = await buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => programacao });
    const interpretacao = resultado.get("of-1");
    expect(interpretacao?.estado).toBe("previsao_disponivel");
    expect(interpretacao?.estado === "previsao_disponivel" && interpretacao.terminoPrevisto).toBe("2026-11-09");
  });

  it("3. operações paralelas (recursos diferentes, mesmo período)", async () => {
    const programacao = programacaoFixture({
      operacoes: [
        operacaoFixture({ opId: "op-a", ofId: "of-1", status: "concluida", dataFimPrevista: "2026-11-05" }),
        operacaoFixture({ opId: "op-b", ofId: "of-1", status: "concluida", dataFimPrevista: "2026-11-05" }),
      ],
    });
    const client = clienteFalso([
      { id: "op-a", of_id: "of-1", nao_aplicavel: false },
      { id: "op-b", of_id: "of-1", nao_aplicavel: false },
    ]);
    const resultado = await buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => programacao });
    expect(resultado.get("of-1")?.estado).toBe("previsao_disponivel");
  });

  it("4. dependência não resolvida (predecessora) impede o término, mesmo com a outra concluída", async () => {
    const programacao = programacaoFixture({
      operacoes: [
        operacaoFixture({ opId: "op-1", ofId: "of-1", status: "concluida", dataFimPrevista: "2026-11-05" }),
        operacaoFixture({ opId: "op-2", ofId: "of-1", status: "bloqueada_por_predecessora", dataFimPrevista: null, deficit: 4, alocacoes: 0 }),
      ],
    });
    const client = clienteFalso([
      { id: "op-1", of_id: "of-1", nao_aplicavel: false },
      { id: "op-2", of_id: "of-1", nao_aplicavel: false },
    ]);
    const resultado = await buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => programacao });
    expect(resultado.get("of-1")?.estado).toBe("operacoes_impedidas");
  });

  it("5. operação ausente na programação vigente: cobertura insuficiente", async () => {
    const programacao = programacaoFixture({
      operacoes: [operacaoFixture({ opId: "op-1", ofId: "of-1", status: "concluida", dataFimPrevista: "2026-11-05" })],
    });
    // of_id "of-1" tem DUAS operações necessárias reais, mas só uma está na programação vigente.
    const client = clienteFalso([
      { id: "op-1", of_id: "of-1", nao_aplicavel: false },
      { id: "op-2", of_id: "of-1", nao_aplicavel: false },
    ]);
    const resultado = await buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => programacao });
    expect(resultado.get("of-1")).toEqual({ estado: "cobertura_insuficiente", opsAusentes: ["op-2"] });
  });

  it("6. operação bloqueada por déficit real de capacidade", async () => {
    const programacao = programacaoFixture({
      operacoes: [operacaoFixture({ opId: "op-1", ofId: "of-1", status: "bloqueada_por_deficit", dataFimPrevista: null, deficit: 5, alocacoes: 2 })],
    });
    const client = clienteFalso([{ id: "op-1", of_id: "of-1", nao_aplicavel: false }]);
    const resultado = await buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => programacao });
    expect(resultado.get("of-1")).toEqual({
      estado: "operacoes_impedidas",
      operacoes: [{ opId: "op-1", classificacao: "deficit_parcial_de_capacidade", dataFimPrevista: null }],
    });
  });

  it("7. operação bloqueada por predecessora (isolada)", async () => {
    const programacao = programacaoFixture({
      operacoes: [operacaoFixture({ opId: "op-1", ofId: "of-1", status: "bloqueada_por_predecessora", dataFimPrevista: null, deficit: 2, alocacoes: 0 })],
    });
    const client = clienteFalso([{ id: "op-1", of_id: "of-1", nao_aplicavel: false }]);
    const resultado = await buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => programacao });
    expect(resultado.get("of-1")).toEqual({
      estado: "operacoes_impedidas",
      operacoes: [{ opId: "op-1", classificacao: "bloqueio_por_predecessora", dataFimPrevista: null }],
    });
  });

  it("8. OF só com operação não aplicável (nao_aplicavel=true na única existente) — Etapa 53A: nunca 'previsão disponível'", async () => {
    const programacao = programacaoFixture({ operacoes: [] });
    const client = clienteFalso([{ id: "op-1", of_id: "of-1", nao_aplicavel: true }]);
    const resultado = await buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => programacao });
    expect(resultado.get("of-1")).toEqual({ estado: "sem_operacoes_aplicaveis", motivo: "somente_nao_aplicaveis" });
  });

  it("9. programação com versão de capacidade desatualizada", async () => {
    const programacao = programacaoFixture({
      versaoOrigem: 10,
      versaoAtual: 12,
      operacoes: [operacaoFixture({ opId: "op-1", ofId: "of-1", status: "concluida", dataFimPrevista: "2026-11-05" })],
    });
    const client = clienteFalso([{ id: "op-1", of_id: "of-1", nao_aplicavel: false }]);
    const resultado = await buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => programacao });
    expect(resultado.get("of-1")).toEqual({ estado: "programacao_desatualizada" });
  });

  it("10. janela de programação já expirada", async () => {
    const programacao = programacaoFixture({
      janelaFim: "2026-11-02",
      operacoes: [operacaoFixture({ opId: "op-1", ofId: "of-1", status: "concluida", dataFimPrevista: "2026-11-02" })],
    });
    const client = clienteFalso([{ id: "op-1", of_id: "of-1", nao_aplicavel: false }]);
    const resultado = await buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => programacao });
    expect(resultado.get("of-1")).toEqual({ estado: "janela_incompativel_com_avaliacao" });
  });

  it("11. mais de uma OF na mesma programação vigente: cada uma recebe só o resultado que lhe pertence", async () => {
    const programacao = programacaoFixture({
      operacoes: [
        operacaoFixture({ opId: "op-1", ofId: "of-1", status: "concluida", dataFimPrevista: "2026-11-05" }),
        operacaoFixture({ opId: "op-9", ofId: "of-2", status: "bloqueada_por_deficit", dataFimPrevista: null, deficit: 10, alocacoes: 1 }),
      ],
    });
    const client = clienteFalso([
      { id: "op-1", of_id: "of-1", nao_aplicavel: false },
      { id: "op-9", of_id: "of-2", nao_aplicavel: false },
    ]);
    const resultado = await buscarPrazoOfsPcp(client, ["of-1", "of-2"], HOJE, { buscarProgramacaoVigente: async () => programacao });
    expect(resultado.get("of-1")?.estado).toBe("previsao_disponivel");
    expect(resultado.get("of-2")?.estado).toBe("operacoes_impedidas");
  });

  it("12. lista de OFs vazia: nenhuma consulta é necessária, retorna mapa vazio", async () => {
    const client = clienteFalso([]);
    const resultado = await buscarPrazoOfsPcp(client, [], HOJE, {
      buscarProgramacaoVigente: async () => {
        throw new Error("não deveria ser chamada com lista vazia");
      },
    });
    expect(resultado.size).toBe(0);
  });

  it("13. programação vigente inexistente (null) para a empresa", async () => {
    const client = clienteFalso([{ id: "op-1", of_id: "of-1", nao_aplicavel: false }]);
    const resultado = await buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => null });
    expect(resultado.get("of-1")).toEqual({ estado: "programacao_inexistente" });
  });

  // --- Etapa 53: integração com a RPC oficial ops_resolvidas ---

  it("14. operação resolvida é excluída do conjunto necessário; a pendente continua sendo exigida", async () => {
    // op-1 já tem apontamento real de finalização (resolvida=true) - o Motor nunca a inclui em
    // pcp_programacao_operacoes (comportamento já existente, Etapa 50/52). Só op-2 (pendente)
    // precisa estar coberta pela programação vigente.
    const programacao = programacaoFixture({
      operacoes: [operacaoFixture({ opId: "op-2", ofId: "of-1", status: "concluida", dataFimPrevista: "2026-11-08" })],
    });
    const client = clienteFalso(
      [
        { id: "op-1", of_id: "of-1", nao_aplicavel: false },
        { id: "op-2", of_id: "of-1", nao_aplicavel: false },
      ],
      [{ op_id: "op-1", resolvida: true }],
    );
    const resultado = await buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => programacao });
    expect(resultado.get("of-1")).toEqual({
      estado: "previsao_disponivel",
      terminoPrevisto: "2026-11-08",
      operacoes: [{ opId: "op-2", classificacao: "sem_deficit", dataFimPrevista: "2026-11-08" }],
    });
  });

  it("15. operação não aplicável nunca chega a ser consultada na RPC de resolução", async () => {
    const programacao = programacaoFixture({
      operacoes: [operacaoFixture({ opId: "op-2", ofId: "of-1", status: "concluida", dataFimPrevista: "2026-11-08" })],
    });
    const idsConsultados: string[][] = [];
    const client = clienteFalso(
      [
        { id: "op-1", of_id: "of-1", nao_aplicavel: true },
        { id: "op-2", of_id: "of-1", nao_aplicavel: false },
      ],
      [],
      async (_nome, params) => {
        idsConsultados.push([...params.p_op_ids]);
        return { data: [], error: null };
      },
    );
    await buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => programacao });
    expect(idsConsultados).toEqual([["op-2"]]);
  });

  it("16. resolução em lotes: mais de 500 ids gera mais de uma chamada à RPC, resultado combinado corretamente", async () => {
    const operacoesCandidatas = Array.from({ length: 520 }, (_, i) => ({ id: `op-${i}`, of_id: "of-1", nao_aplicavel: false }));
    const programacao = programacaoFixture({
      operacoes: [operacaoFixture({ opId: "op-519", ofId: "of-1", status: "concluida", dataFimPrevista: "2026-11-09" })],
    });
    const rpcMock = vi.fn(async (_nome: string, params: { p_op_ids: readonly string[] }) => {
      // Só a última operação (op-519) é pendente; todas as outras 519 estão resolvidas.
      const resolvidas = params.p_op_ids.filter((id) => id !== "op-519").map((id) => ({ op_id: id, resolvida: true }));
      return { data: resolvidas, error: null };
    });
    const client = clienteFalso(operacoesCandidatas, [], rpcMock);
    const resultado = await buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => programacao });
    expect(rpcMock.mock.calls.length).toBe(2); // 520 ids / 500 por lote = 2 chamadas
    expect(resultado.get("of-1")).toEqual({
      estado: "previsao_disponivel",
      terminoPrevisto: "2026-11-09",
      operacoes: [{ opId: "op-519", classificacao: "sem_deficit", dataFimPrevista: "2026-11-09" }],
    });
  });

  it("17. falha numa chamada da RPC propaga - nunca produz uma previsão aparentemente confiável", async () => {
    const programacao = programacaoFixture({ operacoes: [] });
    const client = clienteFalso([{ id: "op-1", of_id: "of-1", nao_aplicavel: false }], [], async () => ({
      data: null,
      error: { message: "falha simulada de rede" },
    }));
    await expect(buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => programacao })).rejects.toThrow(
      /ops_resolvidas/,
    );
  });

  it("18. resposta incompleta da RPC: id ausente nunca é tratado como resolvido", async () => {
    // op-1 e op-2 são candidatas; a RPC só devolve informação sobre op-1 (op-2 ausente, por
    // qualquer motivo) - op-2 tem que continuar exigida, nunca presumida resolvida.
    const programacao = programacaoFixture({
      operacoes: [operacaoFixture({ opId: "op-2", ofId: "of-1", status: "concluida", dataFimPrevista: "2026-11-06" })],
    });
    const client = clienteFalso(
      [
        { id: "op-1", of_id: "of-1", nao_aplicavel: false },
        { id: "op-2", of_id: "of-1", nao_aplicavel: false },
      ],
      [{ op_id: "op-1", resolvida: true }], // op-2 deliberadamente ausente da resposta
    );
    const resultado = await buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => programacao });
    // op-2 continua necessária e está coberta e concluída -> previsão disponível só com ela.
    expect(resultado.get("of-1")).toEqual({
      estado: "previsao_disponivel",
      terminoPrevisto: "2026-11-06",
      operacoes: [{ opId: "op-2", classificacao: "sem_deficit", dataFimPrevista: "2026-11-06" }],
    });
  });

  it("19. isolamento entre OFs: resolver operações de uma OF nunca afeta o conjunto necessário de outra", async () => {
    const programacao = programacaoFixture({
      operacoes: [operacaoFixture({ opId: "op-2", ofId: "of-2", status: "concluida", dataFimPrevista: "2026-11-07" })],
    });
    const client = clienteFalso(
      [
        { id: "op-1", of_id: "of-1", nao_aplicavel: false },
        { id: "op-2", of_id: "of-2", nao_aplicavel: false },
      ],
      [{ op_id: "op-1", resolvida: true }], // só a OP da of-1 está resolvida
    );
    const resultado = await buscarPrazoOfsPcp(client, ["of-1", "of-2"], HOJE, { buscarProgramacaoVigente: async () => programacao });
    // of-1 (Etapa 53A): sua única operação foi resolvida -> "todas_operacoes_resolvidas", nunca
    // confundido com "previsao_disponivel" nem contaminado pelo resultado real de of-2.
    expect(resultado.get("of-1")).toEqual({ estado: "todas_operacoes_resolvidas" });
    expect(resultado.get("of-2")).toEqual({
      estado: "previsao_disponivel",
      terminoPrevisto: "2026-11-07",
      operacoes: [{ opId: "op-2", classificacao: "sem_deficit", dataFimPrevista: "2026-11-07" }],
    });
  });

  // --- Etapa 53A: distinção explícita entre sem operações / só não aplicáveis / todas resolvidas ---

  it("20. OF com todas as OPs resolvidas: agora distinguível de 'OF sem operações' (Etapa 53A resolve a ambiguidade da Etapa 53)", async () => {
    const programacao = programacaoFixture({ operacoes: [] });
    const client = clienteFalso([{ id: "op-1", of_id: "of-1", nao_aplicavel: false }], [{ op_id: "op-1", resolvida: true }]);
    const resultado = await buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => programacao });
    expect(resultado.get("of-1")).toEqual({ estado: "todas_operacoes_resolvidas" });
  });

  it("21. OF com operações resolvidas e não aplicáveis misturadas, nenhuma pendente: 'todas resolvidas', nunca 'só não aplicáveis'", async () => {
    const programacao = programacaoFixture({ operacoes: [] });
    const client = clienteFalso(
      [
        { id: "op-1", of_id: "of-1", nao_aplicavel: false },
        { id: "op-2", of_id: "of-1", nao_aplicavel: true },
      ],
      [{ op_id: "op-1", resolvida: true }],
    );
    const resultado = await buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => programacao });
    expect(resultado.get("of-1")).toEqual({ estado: "todas_operacoes_resolvidas" });
  });

  it("22. OF com todas as operações resolvidas e programação inexistente: reconhece a conclusão sem depender do Motor", async () => {
    const client = clienteFalso([{ id: "op-1", of_id: "of-1", nao_aplicavel: false }], [{ op_id: "op-1", resolvida: true }]);
    const resultado = await buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => null });
    expect(resultado.get("of-1")).toEqual({ estado: "todas_operacoes_resolvidas" });
  });

  it("23. OF sem nenhuma operação cadastrada (nenhuma linha em ordens_fabricacao_operacoes)", async () => {
    const programacao = programacaoFixture({ operacoes: [] });
    const client = clienteFalso([]); // nenhuma operação para nenhuma OF
    const resultado = await buscarPrazoOfsPcp(client, ["of-1"], HOJE, { buscarProgramacaoVigente: async () => programacao });
    expect(resultado.get("of-1")).toEqual({ estado: "sem_operacoes_aplicaveis", motivo: "sem_operacoes_cadastradas" });
  });
});
