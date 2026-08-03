// Fase 2 do rollout da Entrega 2: prova que o adaptador para a RPC v3
// aceita SÓ os 2 estados que v3 representa (déficit total; 1 recurso
// atendendo 100%) e rejeita explicitamente qualquer distribuição
// parcial real - inclusive o caso de 1 único recurso cobrindo só parte
// da necessidade (a lacuna apontada na auditoria: "1 distribuição" por
// si só não basta, precisa cobrir 100%).
import { describe, expect, it } from "vitest";
import { adaptarItemParaV3, adaptarItensParaV3 } from "./adaptarParaV3";
import type { DistribuicaoParaPersistencia, ItemSimulacaoOperacao } from "./executarSimulacao";

function distribuicao(overrides: Partial<DistribuicaoParaPersistencia> = {}): DistribuicaoParaPersistencia {
  return {
    recursoId: "recurso-1",
    origem: "ORIGINAL",
    ordemConsideracao: 0,
    capacidadeBrutaPeriodo: 100,
    produtividadeConsiderada: 0.8,
    capacidadeEfetiva: 80,
    comprometidoInicial: 0,
    capacidadeDisponivelInicial: 80,
    capacidadeDisponivelAntes: 80,
    horasPadraoAlocadas: 10,
    horasMaquinaEstimadas: 12.5,
    capacidadeDisponivelDepois: 70,
    ...overrides,
  };
}

function item(overrides: Partial<ItemSimulacaoOperacao> = {}): ItemSimulacaoOperacao {
  return {
    bomOperacaoId: "op-1",
    recursoOriginalId: "recurso-1",
    necessario: 10,
    deficit: 0,
    distribuicoes: [distribuicao()],
    ...overrides,
  };
}

describe("adaptarItemParaV3", () => {
  it("déficit total (0 distribuições) é representável", () => {
    const resultado = adaptarItemParaV3(item({ distribuicoes: [], deficit: 10 }));
    expect(resultado).toEqual({
      bom_operacao_id: "op-1",
      recurso_original_id: "recurso-1",
      recurso_considerado_id: null,
      motivo_consideracao: null,
      necessario: 10,
      capacidade_bruta: null,
      capacidade_efetiva: null,
      capacidade_disponivel: null,
      comprometido: null,
      livre: null,
      deficit: 10,
    });
  });

  it("1 recurso atendendo 100% (deficit=0) é representável", () => {
    const resultado = adaptarItemParaV3(
      item({ necessario: 10, deficit: 0, distribuicoes: [distribuicao({ horasPadraoAlocadas: 10 })] }),
    );
    expect(resultado).not.toBeNull();
    expect(resultado?.recurso_considerado_id).toBe("recurso-1");
    expect(resultado?.motivo_consideracao).toBe("ORIGINAL");
    expect(resultado?.deficit).toBe(0);
    // "capacidade_disponivel" = valor bruto (efetiva), "livre" = líquido.
    expect(resultado?.capacidade_disponivel).toBe(80);
    expect(resultado?.livre).toBe(80);
  });

  it("REJEITA 1 recurso atendendo só parcialmente (deficit > 0) - a lacuna da auditoria: necessário 10h, atende 6h, déficit 4h", () => {
    const resultado = adaptarItemParaV3(
      item({
        necessario: 10,
        deficit: 4,
        distribuicoes: [distribuicao({ horasPadraoAlocadas: 6 })],
      }),
    );
    expect(resultado).toBeNull();
  });

  it("REJEITA 2 recursos, mesmo que juntos cubram 100% sem déficit", () => {
    const resultado = adaptarItemParaV3(
      item({
        necessario: 10,
        deficit: 0,
        distribuicoes: [
          distribuicao({ recursoId: "r1", horasPadraoAlocadas: 6 }),
          distribuicao({ recursoId: "r2", horasPadraoAlocadas: 4 }),
        ],
      }),
    );
    expect(resultado).toBeNull();
  });
});

describe("adaptarItensParaV3", () => {
  it("todos representáveis: retorna ok com os itens adaptados", () => {
    const resultado = adaptarItensParaV3([item({ bomOperacaoId: "op-1", distribuicoes: [] , necessario: 5, deficit: 5 })]);
    expect(resultado.ok).toBe(true);
  });

  it("qualquer operação não representável bloqueia a lista inteira (nada persiste parcialmente)", () => {
    const resultado = adaptarItensParaV3([
      item({ bomOperacaoId: "op-1", distribuicoes: [] }),
      item({
        bomOperacaoId: "op-2",
        necessario: 10,
        deficit: 4,
        distribuicoes: [distribuicao({ horasPadraoAlocadas: 6 })],
      }),
    ]);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.operacoesNaoRepresentaveis).toEqual(["op-2"]);
    }
  });
});
