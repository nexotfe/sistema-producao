/* @vitest-environment jsdom */
// Cobre o comportamento do vínculo "Necessário antes de" (DEC-007
// §6/§7) na tela de Roteiro: exibição do vínculo atual, troca/remoção
// via select, restauração visual em caso de erro, bloqueio durante
// gravação e filtro por operação ativa. onTrocarVinculoSubconjunto é
// mockado - a lógica de INSERT/UPDATE/erro em si é coberta em
// trocarVinculoSubconjunto.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {},
}));

import { RoteiroForm } from "./RoteiroForm";
import type {
  Bom,
  BomItemSubconjunto,
  BomOperacao,
  CustoBom,
} from "../types";

afterEach(() => {
  cleanup();
});

const bom: Bom = {
  id: "bom-1",
  produtoId: "produto-1",
  versao: "A",
  descricao: null,
  status: "rascunho",
  dataValidade: null,
};

const custoZero: CustoBom = {
  materiaPrima: 0,
  subconjunto: 0,
  engenharia: 0,
  maoDeObra: 0,
  terceiros: 0,
  logistica: 0,
  total: 0,
};

function operacao(overrides: Partial<BomOperacao> = {}): BomOperacao {
  return {
    id: "op-1",
    ordem: 10,
    descricao: "Corte a laser",
    recursoProdutivoId: null,
    recursoNome: "Sem recurso vinculado",
    tipo: "producao",
    tempoEstimadoMinutos: 30,
    observacoes: null,
    ativo: true,
    ...overrides,
  };
}

function subconjunto(overrides: Partial<BomItemSubconjunto> = {}): BomItemSubconjunto {
  return {
    id: "subconjunto-1",
    componenteProdutoId: "produto-sub-1",
    codigo: "SUB-001",
    descricao: "Chassi soldado",
    quantidade: 1,
    unidade: "peca",
    ordem: 1,
    observacoes: null,
    vinculoId: null,
    vinculoOperacaoId: null,
    ...overrides,
  };
}

function propsBase(overrides: Partial<Parameters<typeof RoteiroForm>[0]> = {}) {
  return {
    bom,
    processando: false,
    materiais: [],
    onAdicionarMaterial: vi.fn().mockResolvedValue({ status: "ok" }),
    onEditarMaterial: vi.fn().mockResolvedValue({ status: "ok" }),
    onRemoverMaterial: vi.fn().mockResolvedValue({ status: "excluido" }),
    subconjuntos: [subconjunto()],
    onAdicionarSubconjunto: vi.fn().mockResolvedValue({ status: "ok" }),
    onRemoverSubconjunto: vi.fn().mockResolvedValue({ status: "excluido" }),
    onTrocarVinculoSubconjunto: vi.fn().mockResolvedValue({ status: "ok" }),
    operacoesEngenharia: [],
    operacoesProducao: [operacao()],
    recursosDisponiveis: [],
    onAdicionarOperacao: vi.fn().mockResolvedValue({ status: "ok" }),
    onEditarOperacao: vi.fn().mockResolvedValue({ status: "ok" }),
    onRemoverOperacao: vi.fn().mockResolvedValue({ status: "excluido" }),
    proximaOrdemOperacoes: () => 20,
    servicosTerceiros: [],
    fornecedoresDisponiveis: [],
    onAdicionarServicoTerceiro: vi.fn().mockResolvedValue({ status: "ok" }),
    onRemoverServicoTerceiro: vi.fn().mockResolvedValue({ status: "excluido" }),
    transportes: [],
    onAdicionarTransporte: vi.fn().mockResolvedValue({ status: "ok" }),
    onRemoverTransporte: vi.fn().mockResolvedValue({ status: "excluido" }),
    custo: custoZero,
    ...overrides,
  };
}

function selectDoSubconjunto(container: HTMLElement) {
  return container.querySelector("select") as HTMLSelectElement;
}

describe("RoteiroForm - vínculo do subconjunto (Necessário antes de)", () => {
  it("exibe o codigo do subconjunto (nunca PN) e nenhuma seleção quando não há vínculo", () => {
    const { container } = render(
      <RoteiroForm {...propsBase({ subconjuntos: [subconjunto()] })} />,
    );

    expect(screen.getByText(/SUB-001/)).toBeTruthy();
    expect(selectDoSubconjunto(container).value).toBe("");
  });

  it("exibe o vínculo atual pré-selecionado quando o subconjunto já tem uma operação vinculada", () => {
    const { container } = render(
      <RoteiroForm
        {...propsBase({
          subconjuntos: [
            subconjunto({ vinculoId: "vinculo-1", vinculoOperacaoId: "op-1" }),
          ],
        })}
      />,
    );

    expect(selectDoSubconjunto(container).value).toBe("op-1");
  });

  it("lista somente operações ativas do roteiro atual no seletor", () => {
    const { container } = render(
      <RoteiroForm
        {...propsBase({
          operacoesProducao: [
            operacao({ id: "op-ativa", descricao: "Ativa", ativo: true }),
            operacao({ id: "op-inativa", descricao: "Inativa", ativo: false }),
          ],
        })}
      />,
    );

    const options = Array.from(selectDoSubconjunto(container).querySelectorAll("option")).map(
      (opt) => opt.getAttribute("value"),
    );

    expect(options).toContain("op-ativa");
    expect(options).not.toContain("op-inativa");
  });

  it("selecionar uma operação quando não há vínculo aciona onTrocarVinculoSubconjunto com a nova operação", async () => {
    const onTrocarVinculoSubconjunto = vi.fn().mockResolvedValue({ status: "ok" });
    const { container } = render(
      <RoteiroForm
        {...propsBase({
          subconjuntos: [subconjunto({ id: "sub-x" })],
          operacoesProducao: [operacao({ id: "op-1" })],
          onTrocarVinculoSubconjunto,
        })}
      />,
    );

    await act(async () => {
      fireEvent.change(selectDoSubconjunto(container), { target: { value: "op-1" } });
    });

    expect(onTrocarVinculoSubconjunto).toHaveBeenCalledTimes(1);
    expect(onTrocarVinculoSubconjunto).toHaveBeenCalledWith("sub-x", "op-1");
  });

  it("trocar de uma operação para outra aciona onTrocarVinculoSubconjunto uma única vez com a nova operação", async () => {
    const onTrocarVinculoSubconjunto = vi.fn().mockResolvedValue({ status: "ok" });
    const { container } = render(
      <RoteiroForm
        {...propsBase({
          subconjuntos: [
            subconjunto({ id: "sub-x", vinculoId: "vinculo-1", vinculoOperacaoId: "op-1" }),
          ],
          operacoesProducao: [
            operacao({ id: "op-1", descricao: "Corte" }),
            operacao({ id: "op-2", descricao: "Solda" }),
          ],
          onTrocarVinculoSubconjunto,
        })}
      />,
    );

    await act(async () => {
      fireEvent.change(selectDoSubconjunto(container), { target: { value: "op-2" } });
    });

    expect(onTrocarVinculoSubconjunto).toHaveBeenCalledTimes(1);
    expect(onTrocarVinculoSubconjunto).toHaveBeenCalledWith("sub-x", "op-2");
  });

  it("voltar para '— (regra conservadora)' aciona onTrocarVinculoSubconjunto com null (remoção, nunca omissão silenciosa)", async () => {
    const onTrocarVinculoSubconjunto = vi.fn().mockResolvedValue({ status: "ok" });
    const { container } = render(
      <RoteiroForm
        {...propsBase({
          subconjuntos: [
            subconjunto({ id: "sub-x", vinculoId: "vinculo-1", vinculoOperacaoId: "op-1" }),
          ],
          operacoesProducao: [operacao({ id: "op-1" })],
          onTrocarVinculoSubconjunto,
        })}
      />,
    );

    await act(async () => {
      fireEvent.change(selectDoSubconjunto(container), { target: { value: "" } });
    });

    expect(onTrocarVinculoSubconjunto).toHaveBeenCalledWith("sub-x", null);
  });

  it("falha ao trocar mostra mensagem clara; como o vínculo não é recarregado em caso de erro, a seleção visual permanece no valor persistido", async () => {
    const onTrocarVinculoSubconjunto = vi.fn().mockResolvedValue({
      status: "erro",
      mensagem: "Não foi possível trocar - verifique se você é quem criou este vínculo ou é administrador.",
    });
    const { container } = render(
      <RoteiroForm
        {...propsBase({
          subconjuntos: [
            subconjunto({ id: "sub-x", vinculoId: "vinculo-1", vinculoOperacaoId: "op-1" }),
          ],
          operacoesProducao: [
            operacao({ id: "op-1", descricao: "Corte" }),
            operacao({ id: "op-2", descricao: "Solda" }),
          ],
          onTrocarVinculoSubconjunto,
        })}
      />,
    );

    await act(async () => {
      fireEvent.change(selectDoSubconjunto(container), { target: { value: "op-2" } });
    });

    expect(
      screen.getByText(
        "Não foi possível trocar - verifique se você é quem criou este vínculo ou é administrador.",
      ),
    ).toBeTruthy();
    // O componente é controlado pela prop subconjuntos: como o
    // chamador (hook) só recarrega em caso de sucesso, a prop
    // permanece com vinculoOperacaoId="op-1" e o select reflete isso.
    expect(selectDoSubconjunto(container).value).toBe("op-1");
  });

  it("o seletor fica desabilitado enquanto processando=true, impedindo múltiplas trocas simultâneas", () => {
    const { container } = render(
      <RoteiroForm {...propsBase({ processando: true })} />,
    );

    expect(selectDoSubconjunto(container).disabled).toBe(true);
  });

  it("o seletor fica habilitado quando processando=false", () => {
    const { container } = render(
      <RoteiroForm {...propsBase({ processando: false })} />,
    );

    expect(selectDoSubconjunto(container).disabled).toBe(false);
  });
});
