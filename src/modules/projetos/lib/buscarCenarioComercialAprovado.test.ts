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
  it("mapeia a linha do banco para o formato do domínio", async () => {
    const cliente = clienteFake({
      data: {
        id: "cenario-1",
        tipo_cenario: "ajustado",
        data_solicitada_cliente: "2026-09-01",
        prazo_proposto: "2026-09-10",
        diferenca_em_dias: 9,
        custo_tecnico_atual: 50000,
        custo_adicional_total: 1500,
        novo_custo_tecnico: 51500,
        aprovado_em: "2026-08-18T10:00:00Z",
      },
      error: null,
    });

    const resultado = await buscarCenarioComercialAprovado(cliente, "projeto-1");

    expect(resultado).toEqual({
      id: "cenario-1",
      tipoCenario: "ajustado",
      dataSolicitadaCliente: "2026-09-01",
      prazoProposto: "2026-09-10",
      diferencaEmDias: 9,
      custoTecnicoAtual: 50000,
      custoAdicionalTotal: 1500,
      novoCustoTecnico: 51500,
      aprovadoEm: "2026-08-18T10:00:00Z",
    });
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
