/* @vitest-environment jsdom */
// Etapa 61 — testes do componente compartilhado de conferência de
// matérias-primas (extraído do protótipo mockado). Cobre as mesmas
// regras usadas tanto pelos 3 cenários mockados quanto pela OF real:
// nenhuma lógica própria foi deixada em nenhum dos dois chamadores.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  ConferenciaMateriasPrimasPcp,
  type ItemConferenciaConfirmavel,
  type ResumoConferenciaMateriasPrimas,
} from "./ConferenciaMateriasPrimasPcp";

// catalogo.modo="busca" usa MateriaPrimaSearchInput (módulo roteiros),
// que importa o client de NAVEGADOR na importação do módulo - mesmo
// padrão de mock já usado em ClienteSearchInput.test.tsx.
vi.mock("@/lib/supabaseClient", () => ({
  supabase: { from: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const MATERIAL_CHAPA = { materiaPrimaId: "mp-chapa", descricao: "Chapa de aço", materialEspecificacao: "SAE 1020", formaDimensoes: "10mm", unidade: "kg" };
const MATERIAL_PARAFUSO = { materiaPrimaId: "mp-parafuso", descricao: "Parafuso M8", materialEspecificacao: "Inox", formaDimensoes: "", unidade: "un" };

function itemInicial(sobrescritas: Partial<Parameters<typeof ConferenciaMateriasPrimasPcp>[0]["itensIniciais"][number]> = {}) {
  return {
    materiaPrimaId: "mp-chapa",
    descricao: "Chapa de aço",
    materialEspecificacao: "SAE 1020",
    formaDimensoes: "10mm",
    unidade: "kg",
    quantidade: 10,
    ...sobrescritas,
  };
}

function renderComponente(props: Partial<React.ComponentProps<typeof ConferenciaMateriasPrimasPcp>> = {}) {
  const onConfirmar = props.onConfirmar ?? vi.fn();
  const onEditadoChange = props.onEditadoChange ?? vi.fn();
  render(
    <ConferenciaMateriasPrimasPcp
      itensIniciais={[itemInicial()]}
      catalogo={{ modo: "lista", itens: [MATERIAL_CHAPA, MATERIAL_PARAFUSO] }}
      onConfirmar={onConfirmar}
      onEditadoChange={onEditadoChange}
      {...props}
    />,
  );
  return { onConfirmar, onEditadoChange };
}

describe("ConferenciaMateriasPrimasPcp — inicialização", () => {
  it("1. Inicializa com os itens reais recebidos, sem inventar nenhum campo", () => {
    renderComponente();
    expect(screen.getByText("Chapa de aço")).toBeDefined();
    expect(screen.getByText("SAE 1020 · 10mm")).toBeDefined();
  });

  it("2. Lista vazia: mostra o texto de nenhum material, nunca uma tabela vazia disfarçada", () => {
    renderComponente({ itensIniciais: [] });
    expect(screen.getByText(/Nenhum material em conferência/)).toBeDefined();
  });
});

describe("ConferenciaMateriasPrimasPcp — adicionar/editar/remover em memória", () => {
  it("3. Adicionar material: aparece na tabela com o badge 'Adicionado', e dispara onEditadoChange(true)", () => {
    const { onEditadoChange } = renderComponente();

    fireEvent.click(screen.getByText("Adicionar material"));
    fireEvent.change(screen.getByLabelText("Material do cadastro"), { target: { value: "mp-parafuso" } });
    fireEvent.change(screen.getByLabelText("Quantidade"), { target: { value: "50" } });
    fireEvent.click(screen.getByText("Adicionar", { selector: "button" }));

    expect(screen.getByText("Parafuso M8")).toBeDefined();
    expect(screen.getByText("Adicionado")).toBeDefined();
    expect(onEditadoChange).toHaveBeenCalledWith(true);
  });

  it("4. Editar material: altera a quantidade e marca 'Corrigido'", () => {
    renderComponente();

    fireEvent.click(screen.getByText("Editar"));
    fireEvent.change(screen.getByLabelText("Quantidade"), { target: { value: "25" } });
    fireEvent.click(screen.getByText("Salvar edição"));

    const linha = screen.getByText("Chapa de aço").closest("tr") as HTMLElement;
    expect(within(linha).getByText("25")).toBeDefined();
    expect(within(linha).getByText("Corrigido")).toBeDefined();
  });

  it("5. Remover material: some da tabela e preserva o restante", () => {
    renderComponente({ itensIniciais: [itemInicial(), itemInicial({ materiaPrimaId: "mp-parafuso", descricao: "Parafuso M8", unidade: "un" })] });

    const botoesRemover = screen.getAllByText("Remover");
    fireEvent.click(botoesRemover[0]);

    expect(screen.queryByText("Chapa de aço")).toBeNull();
    expect(screen.getByText("Parafuso M8")).toBeDefined();
  });
});

describe("ConferenciaMateriasPrimasPcp — CI/CE/P e saldo livre", () => {
  it("6. Decisão CE (padrão): CE calculado = necessidade inteira, sem CI", () => {
    renderComponente();
    const linha = screen.getByText("Chapa de aço").closest("tr") as HTMLElement;
    expect(within(linha).getByText("10 kg")).toBeDefined();
  });

  it("7. Decisão P sem preencher CI: o próprio modal bloqueia 'Salvar edição' (checagem ANTES de aceitar, como no protótipo aprovado)", () => {
    renderComponente();

    fireEvent.click(screen.getByText("Editar"));
    fireEvent.click(screen.getByRole("button", { name: "P" }));
    fireEvent.click(screen.getByText("Salvar edição"));

    expect(screen.getByText(/Atendimento parcial exige quantidade CI maior que zero/)).toBeDefined();
    // Modal continua aberto - a edição não foi aceita.
    expect(screen.getByText("Salvar edição")).toBeDefined();
  });

  it("8. CI acima do saldo livre: o próprio modal bloqueia 'Salvar edição' (nunca reduz silenciosamente)", () => {
    renderComponente({ saldoLivrePorMaterial: { "mp-chapa": 3 } });

    fireEvent.click(screen.getByText("Editar"));
    fireEvent.click(screen.getByRole("button", { name: "CI" }));
    fireEvent.click(screen.getByText("Salvar edição"));

    expect(screen.getByText(/ultrapassa o saldo livre/)).toBeDefined();
    expect(screen.getByText("Salvar edição")).toBeDefined();
  });

  it("9. Saldo livre ausente (undefined): não bloqueia por saldo - a validação de saldo é só um preview", () => {
    const onConfirmar = vi.fn();
    renderComponente({ onConfirmar });

    fireEvent.click(screen.getByText("Editar"));
    fireEvent.click(screen.getByRole("button", { name: "CI" }));
    fireEvent.click(screen.getByText("Salvar edição"));

    fireEvent.click(screen.getByText("Confirmar matérias-primas"));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
  });

  it("10. Origem 'cliente': nunca mostra CI/CE, confirmável mesmo sem decisão de abastecimento", () => {
    const onConfirmar = vi.fn();
    renderComponente({ onConfirmar });

    fireEvent.click(screen.getByText("Editar"));
    fireEvent.change(screen.getByLabelText("Origem do fornecimento"), { target: { value: "cliente" } });
    expect(screen.getByText(/Material fornecido pelo cliente/)).toBeDefined();
    fireEvent.click(screen.getByText("Salvar edição"));

    const linha = screen.getByText("Chapa de aço").closest("tr") as HTMLElement;
    expect(within(linha).getByText("—")).toBeDefined();
    expect(within(linha).getByText("Cliente")).toBeDefined();

    fireEvent.click(screen.getByText("Confirmar matérias-primas"));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    const payload = onConfirmar.mock.calls[0][0] as { itens: readonly ItemConferenciaConfirmavel[] };
    expect(payload.itens[0].quantidadeCi).toBe(0);
    expect(payload.itens[0].quantidadeCe).toBe(0);
  });
});

describe("ConferenciaMateriasPrimasPcp — consolidação por material + origem", () => {
  it("11. Adicionar material equivalente com a MESMA observação: consolida direto, soma a quantidade", () => {
    renderComponente({ itensIniciais: [itemInicial({ observacaoTecnica: "Mesma obs" })] });

    fireEvent.click(screen.getByText("Adicionar material"));
    fireEvent.change(screen.getByLabelText("Material do cadastro"), { target: { value: "mp-chapa" } });
    fireEvent.change(screen.getByLabelText("Quantidade"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Observação técnica (opcional)"), { target: { value: "Mesma obs" } });
    fireEvent.click(screen.getByText("Adicionar", { selector: "button" }));

    expect(screen.getByText(/Consolidado com "Chapa de aço"/)).toBeDefined();
    const linha = screen.getByText("Chapa de aço").closest("tr") as HTMLElement;
    expect(within(linha).getByText("15 kg")).toBeDefined();
    expect(within(linha).getByText("Consolidado")).toBeDefined();
  });

  it("12. Observações divergentes: abre a revisão, nunca concatena ou escolhe sozinho", () => {
    renderComponente({ itensIniciais: [itemInicial({ observacaoTecnica: "Observação original" })] });

    fireEvent.click(screen.getByText("Adicionar material"));
    fireEvent.change(screen.getByLabelText("Material do cadastro"), { target: { value: "mp-chapa" } });
    fireEvent.change(screen.getByLabelText("Quantidade"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Observação técnica (opcional)"), { target: { value: "Observação nova" } });
    fireEvent.click(screen.getByText("Adicionar", { selector: "button" }));

    expect(screen.getByText("Revisar observação técnica")).toBeDefined();
    expect(screen.getByText("Observação original")).toBeDefined();
    expect(screen.getByText("Observação nova")).toBeDefined();

    fireEvent.click(screen.getByText("Usar a observação nova"));
    fireEvent.click(screen.getByText("Confirmar consolidação"));

    const linha = screen.getByText("Chapa de aço").closest("tr") as HTMLElement;
    expect(within(linha).getByText("Obs.: Observação nova")).toBeDefined();
  });

  it("13. Cancelar a revisão de observação reabre o modal anterior com os campos intactos", () => {
    renderComponente({ itensIniciais: [itemInicial({ observacaoTecnica: "Observação original" })] });

    fireEvent.click(screen.getByText("Adicionar material"));
    fireEvent.change(screen.getByLabelText("Material do cadastro"), { target: { value: "mp-chapa" } });
    fireEvent.change(screen.getByLabelText("Quantidade"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Observação técnica (opcional)"), { target: { value: "Observação nova" } });
    fireEvent.click(screen.getByText("Adicionar", { selector: "button" }));

    fireEvent.click(screen.getByText("Cancelar"));

    expect(screen.getByText("Adicionar material", { selector: "h3,h2,[class*=title],div" }) ?? screen.getByLabelText("Quantidade")).toBeDefined();
    expect((screen.getByLabelText("Quantidade") as HTMLInputElement).value).toBe("5");
  });
});

describe("ConferenciaMateriasPrimasPcp — confirmação e aviso de saída", () => {
  it("14. Confirmar com dado válido: chama onConfirmar com itens e resumo corretos", () => {
    const onConfirmar = vi.fn();
    renderComponente({ onConfirmar });

    fireEvent.click(screen.getByText("Confirmar matérias-primas"));

    expect(onConfirmar).toHaveBeenCalledTimes(1);
    const payload = onConfirmar.mock.calls[0][0] as {
      itens: readonly ItemConferenciaConfirmavel[];
      resumo: ResumoConferenciaMateriasPrimas;
    };
    expect(payload.itens).toHaveLength(1);
    expect(payload.itens[0]).toMatchObject({ materiaPrimaId: "mp-chapa", quantidadeConfirmada: 10, quantidadeCe: 10, quantidadeCi: 0 });
    expect(payload.resumo.totalMateriais).toBe(1);
  });

  it("15. Texto do botão de confirmação é configurável (ex.: 'Salvar' na OF real)", () => {
    renderComponente({ textoBotaoConfirmar: "Salvar" });
    expect(screen.getByText("Salvar", { selector: "button" })).toBeDefined();
    expect(screen.queryByText("Confirmar matérias-primas", { selector: "button" })).toBeNull();
  });

  it("16. Qualquer alteração dispara onEditadoChange(true) - usado pelo chamador para o próprio aviso de saída", () => {
    const { onEditadoChange } = renderComponente();
    expect(onEditadoChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByText("Remover"));
    expect(onEditadoChange).toHaveBeenCalledWith(true);
  });
});

describe("ConferenciaMateriasPrimasPcp — catálogo por busca sob demanda", () => {
  it("17. catalogo.modo='busca' renderiza o autocomplete real (MateriaPrimaSearchInput), nunca um catálogo pré-carregado", () => {
    renderComponente({ catalogo: { modo: "busca" } });

    fireEvent.click(screen.getByText("Adicionar material"));
    expect(screen.getByRole("combobox", { name: "Buscar matéria-prima" })).toBeDefined();
    expect(screen.queryByLabelText("Material do cadastro")).toBeNull();
  });
});

describe("ConferenciaMateriasPrimasPcp — mostrarTitulo (Etapa 64A)", () => {
  it("18. Por padrão (3 cenários mockados) mostra o título 'Matérias-primas' como <h2>", () => {
    renderComponente();
    expect(screen.getByRole("heading", { name: "Matérias-primas" })).toBeDefined();
  });

  it("19. mostrarTitulo=false esconde só o <h2> - subtítulo e botão 'Adicionar material' continuam aparecendo (usado na OF real, que já tem título próprio)", () => {
    renderComponente({ mostrarTitulo: false });
    expect(screen.queryByRole("heading", { name: "Matérias-primas" })).toBeNull();
    expect(screen.getByText(/Cópia de trabalho desta OF/)).toBeDefined();
    expect(screen.getByText("Adicionar material")).toBeDefined();
  });
});
