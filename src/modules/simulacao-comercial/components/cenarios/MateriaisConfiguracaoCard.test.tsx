/* @vitest-environment jsdom */
// Estado específico de Industrialização (orçamento 260007, DEC-007):
// internamente o motor já usa a Data Prevista de Aprovação do Pedido
// como disponibilidade de material (ver GeradorComparadorCenarios.tsx/
// prepararJanelaComercial.ts) - este cartão só precisa ser transparente
// sobre essa data, nunca sugerir que existe configuração/negociação
// para esta natureza (requisito confirmado com o usuário).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MateriaisConfiguracaoCard } from "./MateriaisConfiguracaoCard";
import type { BaseCenarios } from "@/modules/simulacao-comercial/lib/cenarios/carregarBaseCenarios";

function baseMinima(): BaseCenarios {
  return {
    empresaId: "empresa-1",
    projetoId: "projeto-1",
    ocorrencias: [],
    dependencias: [],
    chavesRaizOrcamentoNovo: [],
    chavesFinaisOrcamentoNovo: [],
    recursoIds: [],
    compatibilidades: {},
    capacidadeDiariaPorRecurso: {},
    produtividadePorRecurso: {},
    comprometidoInicialPorRecurso: {},
    valorHoraPorRecurso: {},
    convencoesHorasAdicionais: [],
    restricaoMaterialPorChave: {},
  };
}

afterEach(cleanup);

describe("MateriaisConfiguracaoCard - naturezaIndustrializacao", () => {
  it("mostra só o título e a frase com a data, citando a Data Prevista de Aprovação do Pedido - nunca os campos de negociação", () => {
    render(
      <MateriaisConfiguracaoCard
        base={baseMinima()}
        disponibilidadeOriginal="2026-08-26"
        dataNegociada={null}
        custo={null}
        onCalcular={vi.fn()}
        naturezaIndustrializacao
      />,
    );

    expect(screen.getByText("Materiais")).toBeTruthy();
    expect(
      screen.getByText(
        "Não se aplica para projetos de Industrialização. O material é considerado disponível em 26/08/2026, conforme a aprovação prevista do pedido.",
      ),
    ).toBeTruthy();

    // Nenhum dos campos/ações de negociação pode aparecer para esta
    // natureza - mostrar qualquer um deles sugeriria que existe
    // configuração/negociação de matéria-prima, o que não existe aqui.
    expect(screen.queryByText("Disponibilidade original")).toBeNull();
    expect(screen.queryByText("Data negociada")).toBeNull();
    expect(screen.queryByText("Custo")).toBeNull();
    expect(screen.queryByText("Ainda não calculado")).toBeNull();
    expect(screen.queryByRole("button", { name: "Configurar" })).toBeNull();
  });

  it("disponibilidadeOriginal ainda não carregada (null): mostra o traço, nunca quebra nem inventa uma data", () => {
    render(
      <MateriaisConfiguracaoCard
        base={baseMinima()}
        disponibilidadeOriginal={null}
        dataNegociada={null}
        custo={null}
        onCalcular={vi.fn()}
        naturezaIndustrializacao
      />,
    );

    expect(
      screen.getByText("Não se aplica para projetos de Industrialização. O material é considerado disponível em —, conforme a aprovação prevista do pedido."),
    ).toBeTruthy();
  });

  it("demais naturezas (naturezaIndustrializacao=false/undefined): comportamento normal preservado - campos de negociação e botão Configurar continuam aparecendo (regressão)", () => {
    render(
      <MateriaisConfiguracaoCard
        base={baseMinima()}
        disponibilidadeOriginal="2026-09-01"
        dataNegociada={null}
        custo={null}
        onCalcular={vi.fn()}
      />,
    );

    expect(screen.getByText("Disponibilidade original")).toBeTruthy();
    expect(screen.getByText("Data negociada")).toBeTruthy();
    expect(screen.getByText("Custo")).toBeTruthy();
    expect(screen.getByText("Ainda não calculado")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Configurar" })).toBeTruthy();
    expect(
      screen.queryByText("Não se aplica para projetos de Industrialização. O material é considerado disponível em 2026-09-01, conforme a aprovação prevista do pedido."),
    ).toBeNull();
  });
});
