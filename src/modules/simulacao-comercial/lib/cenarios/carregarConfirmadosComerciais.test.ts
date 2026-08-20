import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarConfirmadosComerciais } from "./carregarConfirmadosComerciais";
import { compararParaFila } from "./estimativaFifoComercial";

/**
 * Mock GENÉRICO de tabela que RESPEITA os filtros encadeados (eq/neq/in/is)
 * de verdade, filtrando as linhas fornecidas - ao contrário de um mock que
 * sempre devolve tudo, isto prova que o carregador filtra corretamente
 * (ex.: isolamento entre empresas), não apenas que ele CHAMA `.eq(...)`.
 */
function tabelaFiltravel<T extends Record<string, unknown>>(linhas: readonly T[]) {
  return () => {
    const filtros: ((linha: T) => boolean)[] = [];
    let single = false;
    const builder = {
      select: () => builder,
      eq: (coluna: string, valor: unknown) => {
        filtros.push((linha) => linha[coluna] === valor);
        return builder;
      },
      neq: (coluna: string, valor: unknown) => {
        filtros.push((linha) => linha[coluna] !== valor);
        return builder;
      },
      in: (coluna: string, valores: readonly unknown[]) => {
        filtros.push((linha) => valores.includes(linha[coluna]));
        return builder;
      },
      is: (coluna: string, valor: null) => {
        filtros.push((linha) => linha[coluna] === valor);
        return builder;
      },
      order: () => builder,
      maybeSingle: () => {
        single = true;
        return builder;
      },
      insert: () => {
        throw new Error("Mock não implementa insert - o carregador nunca deveria chamar escrita.");
      },
      update: () => {
        throw new Error("Mock não implementa update - o carregador nunca deveria chamar escrita.");
      },
      delete: () => {
        throw new Error("Mock não implementa delete - o carregador nunca deveria chamar escrita.");
      },
      then: (resolve: (v: unknown) => unknown) => {
        const resultado = linhas.filter((linha) => filtros.every((f) => f(linha)));
        return Promise.resolve(resolve({ data: single ? (resultado[0] ?? null) : resultado, error: null }));
      },
    };
    return builder;
  };
}

interface DadosMock {
  projetos: { id: string; empresa_id: string; situacao_comercial: string; ativo: boolean; deleted_at: string | null }[];
  historico: { empresa_id: string; projeto_id: string; situacao_nova: string; created_at: string }[];
  simulacoes: { id: string; empresa_id: string; projeto_id: string; vigente: boolean }[];
  itens: { id: string; empresa_id: string; simulacao_comercial_id: string; necessario: number; deficit: number; versao_resultado_motor: number; recurso_considerado_id: string | null }[];
  distribuicoes: { id: string; empresa_id: string; simulacao_comercial_item_id: string; recurso_id: string; horas_padrao_alocadas: number }[];
}

function clienteMock(dados: DadosMock): SupabaseClient {
  const rpc = () => {
    throw new Error("Mock não implementa nenhuma RPC - carregarConfirmadosComerciais nunca deveria chamar calcular_comprometido_v2 nem nenhuma outra RPC de escrita/agregação.");
  };
  const from = (tabela: string) => {
    switch (tabela) {
      case "projetos":
        return tabelaFiltravel(dados.projetos)();
      case "historico_situacao_comercial":
        return tabelaFiltravel(dados.historico)();
      case "simulacoes_comerciais":
        return tabelaFiltravel(dados.simulacoes)();
      case "simulacao_comercial_itens":
        return tabelaFiltravel(dados.itens)();
      case "simulacao_comercial_item_distribuicoes":
        return tabelaFiltravel(dados.distribuicoes)();
      default:
        throw new Error(`Tabela inesperada neste mock: ${tabela}`);
    }
  };
  return { from, rpc } as unknown as SupabaseClient;
}

const DATA_REFERENCIA = "2026-09-01";

describe("carregarConfirmadosComerciais", () => {
  it("fila vazia: nenhum projeto em pedido_recebido não é erro, devolve listas vazias", async () => {
    const client = clienteMock({ projetos: [], historico: [], simulacoes: [], itens: [], distribuicoes: [] });
    const resultado = await carregarConfirmadosComerciais(client, "empresa-1", "projeto-orcamento-novo", DATA_REFERENCIA);
    expect(resultado.compromissos).toEqual([]);
    expect(resultado.diagnosticos).toEqual([]);
  });

  it("isolamento entre empresas: projeto de outra empresa nunca aparece, mesmo com situacao_comercial idêntica", async () => {
    const dados: DadosMock = {
      projetos: [
        { id: "proj-empresa1", empresa_id: "empresa-1", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null },
        { id: "proj-empresa2", empresa_id: "empresa-2", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null },
      ],
      historico: [
        { empresa_id: "empresa-1", projeto_id: "proj-empresa1", situacao_nova: "pedido_recebido", created_at: "2026-08-01T10:00:00Z" },
        { empresa_id: "empresa-2", projeto_id: "proj-empresa2", situacao_nova: "pedido_recebido", created_at: "2026-08-01T10:00:00Z" },
      ],
      simulacoes: [
        { id: "sim-empresa1", empresa_id: "empresa-1", projeto_id: "proj-empresa1", vigente: true },
        { id: "sim-empresa2", empresa_id: "empresa-2", projeto_id: "proj-empresa2", vigente: true },
      ],
      itens: [
        { id: "item-empresa1", empresa_id: "empresa-1", simulacao_comercial_id: "sim-empresa1", necessario: 10, deficit: 0, versao_resultado_motor: 1, recurso_considerado_id: "recurso-X" },
        { id: "item-empresa2", empresa_id: "empresa-2", simulacao_comercial_id: "sim-empresa2", necessario: 10, deficit: 0, versao_resultado_motor: 1, recurso_considerado_id: "recurso-X" },
      ],
      distribuicoes: [],
    };
    const client = clienteMock(dados);

    const resultadoEmpresa1 = await carregarConfirmadosComerciais(client, "empresa-1", "projeto-orcamento-novo", DATA_REFERENCIA);
    expect(resultadoEmpresa1.compromissos).toHaveLength(1);
    expect(resultadoEmpresa1.compromissos[0].projetoId).toBe("proj-empresa1");
    expect(resultadoEmpresa1.compromissos.every((c) => c.empresaId === "empresa-1")).toBe(true);

    const resultadoEmpresa2 = await carregarConfirmadosComerciais(client, "empresa-2", "projeto-orcamento-novo", DATA_REFERENCIA);
    expect(resultadoEmpresa2.compromissos).toHaveLength(1);
    expect(resultadoEmpresa2.compromissos[0].projetoId).toBe("proj-empresa2");
  });

  it("exclui o próprio orçamento novo da fila de confirmados, mesmo que ele também esteja em pedido_recebido", async () => {
    const dados: DadosMock = {
      projetos: [
        { id: "proj-orcamento-novo", empresa_id: "empresa-1", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null },
        { id: "proj-outro", empresa_id: "empresa-1", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null },
      ],
      historico: [
        { empresa_id: "empresa-1", projeto_id: "proj-orcamento-novo", situacao_nova: "pedido_recebido", created_at: "2026-08-01T10:00:00Z" },
        { empresa_id: "empresa-1", projeto_id: "proj-outro", situacao_nova: "pedido_recebido", created_at: "2026-08-02T10:00:00Z" },
      ],
      simulacoes: [
        { id: "sim-orcamento-novo", empresa_id: "empresa-1", projeto_id: "proj-orcamento-novo", vigente: true },
        { id: "sim-outro", empresa_id: "empresa-1", projeto_id: "proj-outro", vigente: true },
      ],
      itens: [
        { id: "item-orcamento-novo", empresa_id: "empresa-1", simulacao_comercial_id: "sim-orcamento-novo", necessario: 10, deficit: 0, versao_resultado_motor: 1, recurso_considerado_id: "recurso-X" },
        { id: "item-outro", empresa_id: "empresa-1", simulacao_comercial_id: "sim-outro", necessario: 5, deficit: 0, versao_resultado_motor: 1, recurso_considerado_id: "recurso-X" },
      ],
      distribuicoes: [],
    };
    const client = clienteMock(dados);

    const resultado = await carregarConfirmadosComerciais(client, "empresa-1", "proj-orcamento-novo", DATA_REFERENCIA);
    expect(resultado.compromissos).toHaveLength(1);
    expect(resultado.compromissos[0].projetoId).toBe("proj-outro");
  });

  it("considera apenas projetos realmente em pedido_recebido - outras situações comerciais nunca contam", async () => {
    const dados: DadosMock = {
      projetos: [
        { id: "proj-negociacao", empresa_id: "empresa-1", situacao_comercial: "negociacao", ativo: true, deleted_at: null },
        { id: "proj-confirmado", empresa_id: "empresa-1", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null },
      ],
      historico: [{ empresa_id: "empresa-1", projeto_id: "proj-confirmado", situacao_nova: "pedido_recebido", created_at: "2026-08-01T10:00:00Z" }],
      simulacoes: [{ id: "sim-confirmado", empresa_id: "empresa-1", projeto_id: "proj-confirmado", vigente: true }],
      itens: [{ id: "item-confirmado", empresa_id: "empresa-1", simulacao_comercial_id: "sim-confirmado", necessario: 8, deficit: 0, versao_resultado_motor: 1, recurso_considerado_id: "recurso-X" }],
      distribuicoes: [],
    };
    const client = clienteMock(dados);

    const resultado = await carregarConfirmadosComerciais(client, "empresa-1", "projeto-orcamento-novo", DATA_REFERENCIA);
    expect(resultado.compromissos).toHaveLength(1);
    expect(resultado.compromissos[0].projetoId).toBe("proj-confirmado");
  });

  it("dataEntradaFila vem da transição MAIS RECENTE em historico_situacao_comercial, nunca de um campo de aprovação interna", async () => {
    const dados: DadosMock = {
      projetos: [{ id: "proj-1", empresa_id: "empresa-1", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null }],
      historico: [
        // Ida e volta - a fila deve usar a transição MAIS RECENTE, não a primeira.
        { empresa_id: "empresa-1", projeto_id: "proj-1", situacao_nova: "pedido_recebido", created_at: "2026-07-01T10:00:00Z" },
        { empresa_id: "empresa-1", projeto_id: "proj-1", situacao_nova: "negociacao", created_at: "2026-07-15T10:00:00Z" },
        { empresa_id: "empresa-1", projeto_id: "proj-1", situacao_nova: "pedido_recebido", created_at: "2026-08-10T10:00:00Z" },
      ],
      simulacoes: [{ id: "sim-1", empresa_id: "empresa-1", projeto_id: "proj-1", vigente: true }],
      itens: [{ id: "item-1", empresa_id: "empresa-1", simulacao_comercial_id: "sim-1", necessario: 6, deficit: 0, versao_resultado_motor: 1, recurso_considerado_id: "recurso-X" }],
      distribuicoes: [],
    };
    const client = clienteMock(dados);

    const resultado = await carregarConfirmadosComerciais(client, "empresa-1", "projeto-orcamento-novo", DATA_REFERENCIA);
    // Mais recente é 2026-08-10 (não a primeira, 2026-07-01) - e truncada pra data (o motor todo trabalha em granularidade diária).
    expect(resultado.compromissos[0].dataEntradaFila).toBe("2026-08-10");
  });

  it("snapshot ausente (projeto em pedido_recebido sem simulação vigente) vira diagnóstico e é excluído, nunca completado por suposição", async () => {
    const dados: DadosMock = {
      projetos: [{ id: "proj-sem-snapshot", empresa_id: "empresa-1", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null }],
      historico: [{ empresa_id: "empresa-1", projeto_id: "proj-sem-snapshot", situacao_nova: "pedido_recebido", created_at: "2026-08-01T10:00:00Z" }],
      simulacoes: [], // nenhuma simulação vigente para este projeto
      itens: [],
      distribuicoes: [],
    };
    const client = clienteMock(dados);

    const resultado = await carregarConfirmadosComerciais(client, "empresa-1", "projeto-orcamento-novo", DATA_REFERENCIA);
    expect(resultado.compromissos).toEqual([]);
    expect(resultado.diagnosticos).toHaveLength(1);
    expect(resultado.diagnosticos[0].projetoId).toBe("proj-sem-snapshot");
    expect(resultado.diagnosticos[0].motivo).toMatch(/sem simulação comercial vigente/);
  });

  it("item com déficit total (sem recurso identificável) vira diagnóstico, nunca um recurso adivinhado", async () => {
    const dados: DadosMock = {
      projetos: [{ id: "proj-1", empresa_id: "empresa-1", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null }],
      historico: [{ empresa_id: "empresa-1", projeto_id: "proj-1", situacao_nova: "pedido_recebido", created_at: "2026-08-01T10:00:00Z" }],
      simulacoes: [{ id: "sim-1", empresa_id: "empresa-1", projeto_id: "proj-1", vigente: true }],
      itens: [
        { id: "item-deficit-v1", empresa_id: "empresa-1", simulacao_comercial_id: "sim-1", necessario: 10, deficit: 10, versao_resultado_motor: 1, recurso_considerado_id: null },
        { id: "item-deficit-v2", empresa_id: "empresa-1", simulacao_comercial_id: "sim-1", necessario: 5, deficit: 5, versao_resultado_motor: 2, recurso_considerado_id: null },
      ],
      distribuicoes: [], // item v2 sem nenhuma linha filha = déficit total
    };
    const client = clienteMock(dados);

    const resultado = await carregarConfirmadosComerciais(client, "empresa-1", "projeto-orcamento-novo", DATA_REFERENCIA);
    expect(resultado.compromissos).toEqual([]);
    expect(resultado.diagnosticos).toHaveLength(2);
    expect(resultado.diagnosticos.every((d) => /déficit total/.test(d.motivo))).toBe(true);
  });

  it("duplicidade: 2 operações do mesmo projeto no mesmo recurso somam em 1 único CompromissoCapacidade", async () => {
    const dados: DadosMock = {
      projetos: [{ id: "proj-1", empresa_id: "empresa-1", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null }],
      historico: [{ empresa_id: "empresa-1", projeto_id: "proj-1", situacao_nova: "pedido_recebido", created_at: "2026-08-01T10:00:00Z" }],
      simulacoes: [{ id: "sim-1", empresa_id: "empresa-1", projeto_id: "proj-1", vigente: true }],
      itens: [
        { id: "item-A", empresa_id: "empresa-1", simulacao_comercial_id: "sim-1", necessario: 4, deficit: 0, versao_resultado_motor: 1, recurso_considerado_id: "recurso-X" },
        { id: "item-B", empresa_id: "empresa-1", simulacao_comercial_id: "sim-1", necessario: 6, deficit: 0, versao_resultado_motor: 1, recurso_considerado_id: "recurso-X" },
      ],
      distribuicoes: [],
    };
    const client = clienteMock(dados);

    const resultado = await carregarConfirmadosComerciais(client, "empresa-1", "projeto-orcamento-novo", DATA_REFERENCIA);
    expect(resultado.compromissos).toHaveLength(1);
    expect(resultado.compromissos[0].recursoId).toBe("recurso-X");
    expect(resultado.compromissos[0].horasRestantesPadrao).toBe(10); // 4 + 6, nunca duplicado nem perdido.
    expect([...resultado.compromissos[0].chavesTrabalhoOrigem].sort()).toEqual(["item-A", "item-B"]);
  });

  it("versao_resultado_motor=2 lê as linhas de simulacao_comercial_item_distribuicoes (podendo gerar mais de 1 recurso por item)", async () => {
    const dados: DadosMock = {
      projetos: [{ id: "proj-1", empresa_id: "empresa-1", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null }],
      historico: [{ empresa_id: "empresa-1", projeto_id: "proj-1", situacao_nova: "pedido_recebido", created_at: "2026-08-01T10:00:00Z" }],
      simulacoes: [{ id: "sim-1", empresa_id: "empresa-1", projeto_id: "proj-1", vigente: true }],
      itens: [{ id: "item-parcial", empresa_id: "empresa-1", simulacao_comercial_id: "sim-1", necessario: 10, deficit: 2, versao_resultado_motor: 2, recurso_considerado_id: null }],
      distribuicoes: [
        { id: "dist-1", empresa_id: "empresa-1", simulacao_comercial_item_id: "item-parcial", recurso_id: "recurso-X", horas_padrao_alocadas: 6 },
        { id: "dist-2", empresa_id: "empresa-1", simulacao_comercial_item_id: "item-parcial", recurso_id: "recurso-Y", horas_padrao_alocadas: 2 },
      ],
    };
    const client = clienteMock(dados);

    const resultado = await carregarConfirmadosComerciais(client, "empresa-1", "projeto-orcamento-novo", DATA_REFERENCIA);
    expect(resultado.compromissos).toHaveLength(2);
    const porRecurso = new Map(resultado.compromissos.map((c) => [c.recursoId, c.horasRestantesPadrao]));
    expect(porRecurso.get("recurso-X")).toBe(6);
    expect(porRecurso.get("recurso-Y")).toBe(2);
    // Os 2h de déficit do item nunca viram compromisso - só as horas efetivamente alocadas nas linhas filhas.
    expect([...porRecurso.values()].reduce((s, h) => s + h, 0)).toBe(8);
  });

  it("ordenação FIFO (compararParaFila) preservada depois do carregamento - confirmados sempre antes, por dataEntradaFila crescente", async () => {
    const dados: DadosMock = {
      projetos: [
        { id: "proj-tarde", empresa_id: "empresa-1", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null },
        { id: "proj-cedo", empresa_id: "empresa-1", situacao_comercial: "pedido_recebido", ativo: true, deleted_at: null },
      ],
      historico: [
        { empresa_id: "empresa-1", projeto_id: "proj-tarde", situacao_nova: "pedido_recebido", created_at: "2026-08-10T10:00:00Z" },
        { empresa_id: "empresa-1", projeto_id: "proj-cedo", situacao_nova: "pedido_recebido", created_at: "2026-08-01T10:00:00Z" },
      ],
      simulacoes: [
        { id: "sim-tarde", empresa_id: "empresa-1", projeto_id: "proj-tarde", vigente: true },
        { id: "sim-cedo", empresa_id: "empresa-1", projeto_id: "proj-cedo", vigente: true },
      ],
      itens: [
        { id: "item-tarde", empresa_id: "empresa-1", simulacao_comercial_id: "sim-tarde", necessario: 3, deficit: 0, versao_resultado_motor: 1, recurso_considerado_id: "recurso-A" },
        { id: "item-cedo", empresa_id: "empresa-1", simulacao_comercial_id: "sim-cedo", necessario: 3, deficit: 0, versao_resultado_motor: 1, recurso_considerado_id: "recurso-B" },
      ],
      distribuicoes: [],
    };
    const client = clienteMock(dados);

    const resultado = await carregarConfirmadosComerciais(client, "empresa-1", "projeto-orcamento-novo", DATA_REFERENCIA);
    const ordenados = [...resultado.compromissos].sort(compararParaFila);
    expect(ordenados.map((c) => c.projetoId)).toEqual(["proj-cedo", "proj-tarde"]);
  });
});
