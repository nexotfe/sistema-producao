import { describe, expect, it } from "vitest";
import { buscarCenarioComercialAprovado } from "./buscarCenarioComercialAprovado";

function clienteFake(resultado: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => resultado,
          }),
        }),
      }),
    }),
  } as never;
}

describe("buscarCenarioComercialAprovado", () => {
  it("mapeia a linha do banco para o formato do domínio, extraindo a janela produtiva do snapshot", async () => {
    const cliente = clienteFake({
      data: {
        id: "cenario-1",
        empresa_id: "empresa-1",
        tipo_cenario: "ajustado",
        data_solicitada_cliente: "2026-09-01",
        prazo_proposto: "2026-09-10",
        diferenca_em_dias: 9,
        custo_tecnico_atual: 50000,
        custo_adicional_total: 1500,
        novo_custo_tecnico: 51500,
        aprovado_em: "2026-08-18T10:00:00Z",
        assinatura_tecnica: "a".repeat(64),
        snapshot: {
          disponibilidadeMaterial: { original: "2026-08-20", negociada: null },
          saidaPrevisaoComercial: { primeiraEntregaPossivel: "2026-09-05" },
        },
      },
      error: null,
    });

    const resultado = await buscarCenarioComercialAprovado(cliente, "projeto-1");

    expect(resultado).toEqual({
      id: "cenario-1",
      empresaId: "empresa-1",
      tipoCenario: "ajustado",
      dataSolicitadaCliente: "2026-09-01",
      prazoProposto: "2026-09-10",
      diferencaEmDias: 9,
      custoTecnicoAtual: 50000,
      custoAdicionalTotal: 1500,
      novoCustoTecnico: 51500,
      aprovadoEm: "2026-08-18T10:00:00Z",
      assinaturaTecnica: "a".repeat(64),
      janelaInicio: "2026-08-20",
      janelaFim: "2026-09-05",
    });
  });

  it("cenário legado (assinatura_tecnica NULL, ex.: 260007): assinaturaTecnica null, resto mapeado normalmente", async () => {
    const cliente = clienteFake({
      data: {
        id: "cenario-260007",
        empresa_id: "empresa-1",
        tipo_cenario: "atual",
        data_solicitada_cliente: "2026-08-01",
        prazo_proposto: "2026-08-15",
        diferenca_em_dias: 14,
        custo_tecnico_atual: 4920,
        custo_adicional_total: 0,
        novo_custo_tecnico: 4920,
        aprovado_em: "2026-08-05T10:00:00Z",
        assinatura_tecnica: null,
        snapshot: {
          disponibilidadeMaterial: { original: "2026-07-25", negociada: null },
          saidaPrevisaoComercial: { primeiraEntregaPossivel: "2026-08-10" },
        },
      },
      error: null,
    });

    const resultado = await buscarCenarioComercialAprovado(cliente, "projeto-260007");
    expect(resultado?.assinaturaTecnica).toBeNull();
    expect(resultado?.janelaInicio).toBe("2026-07-25");
    expect(resultado?.janelaFim).toBe("2026-08-10");
  });

  it("snapshot em formato inesperado (sem os campos de janela): janelaInicio/janelaFim null, nunca lança", async () => {
    const cliente = clienteFake({
      data: {
        id: "cenario-1",
        empresa_id: "empresa-1",
        tipo_cenario: "atual",
        data_solicitada_cliente: "2026-09-01",
        prazo_proposto: "2026-09-10",
        diferenca_em_dias: 9,
        custo_tecnico_atual: 50000,
        custo_adicional_total: 0,
        novo_custo_tecnico: 50000,
        aprovado_em: "2026-08-18T10:00:00Z",
        assinatura_tecnica: "a".repeat(64),
        snapshot: { versaoFormato: 1 },
      },
      error: null,
    });

    const resultado = await buscarCenarioComercialAprovado(cliente, "projeto-1");
    expect(resultado?.janelaInicio).toBeNull();
    expect(resultado?.janelaFim).toBeNull();
  });

  it("devolve null quando não há cenário vigente (comportamento normal, não erro)", async () => {
    const cliente = clienteFake({ data: null, error: null });
    expect(await buscarCenarioComercialAprovado(cliente, "projeto-1")).toBeNull();
  });

  it("devolve null em caso de erro de consulta", async () => {
    const cliente = clienteFake({ data: null, error: { message: "falhou" } });
    expect(await buscarCenarioComercialAprovado(cliente, "projeto-1")).toBeNull();
  });
});
