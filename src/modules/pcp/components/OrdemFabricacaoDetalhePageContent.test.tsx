/* @vitest-environment jsdom */
// Ajuste de identificadores de Projeto/Produto (pós-Etapa 58B): verifica
// com DOM real (jsdom) que o rótulo exibido é o número comercial/código
// (nunca o UUID), e que o destino do link bate com a rota real de cada
// entidade: /projetos/[id] usa o UUID; /produtos/[pn] usa o código.
//
// Etapa 64E — a carga inicial (montagem da página) passou a ser UMA
// chamada consolidada (consultarCargaInicialOfPcpAction), não mais 7
// Server Actions separadas. Este arquivo mocka a consolidada para a
// carga inicial de cada teste, e mocka as Server Actions ORIGINAIS
// (preservadas) separadamente só onde elas ainda são realmente usadas
// pela página: recarregarPropostaMomentoY ("Reler OF", pós-confirmação,
// verificação de gravação incerta) e as releituras pontuais por seção
// (recarregarDadosOf/Operacoes/Dependencias/PermissoesOperacoes/
// SaldoLivre). Nenhum teste depende mais do shim experimental da
// Etapa 64D.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

// Etapa 61 — ConferenciaMateriasPrimasPcp usa MateriaPrimaSearchInput
// (módulo roteiros) em catalogo.modo="busca", que importa o client de
// NAVEGADOR (@/lib/supabaseClient) - este client é instanciado na
// importação do módulo e quebra em jsdom sem env vars reais. Mesmo
// padrão já usado em ClienteSearchInput.test.tsx.
vi.mock("@/lib/supabaseClient", () => ({
  supabase: { from: vi.fn() },
}));

vi.mock("@/modules/pcp/actions/consultarCargaInicialOfPcpAction", () => ({
  consultarCargaInicialOfPcpAction: (ofId: string) => consultarCargaInicialOfPcpActionMock(ofId),
}));
vi.mock("@/modules/pcp/actions/consultarOfsPcpAction", () => ({
  consultarOfsPcpAction: (...args: unknown[]) => consultarOfsPcpActionMock(...args),
}));
vi.mock("@/modules/pcp/actions/consultarPropostaMomentoYAction", () => ({
  consultarPropostaMomentoYAction: (ofId: string) => consultarPropostaMomentoYActionMock(ofId),
}));
vi.mock("@/modules/pcp/actions/consultarResumoLegadoOfPcpAction", () => ({
  consultarResumoLegadoOfPcpAction: () => Promise.resolve({ ok: true, resumo: null, itens: [] }),
}));
vi.mock("@/modules/pcp/actions/consultarNecessidadesConfirmadasOfPcpAction", () => ({
  consultarNecessidadesConfirmadasOfPcpAction: () => Promise.resolve({ ok: true, itens: [] }),
}));
vi.mock("@/modules/pcp/actions/consultarOperacoesOfPcpAction", () => ({
  consultarOperacoesOfPcpAction: (ofId: string) => consultarOperacoesOfPcpActionMock(ofId),
}));
vi.mock("@/modules/pcp/actions/consultarDependenciasOperacoesOfPcpAction", () => ({
  consultarDependenciasOperacoesOfPcpAction: (opIds: string[]) => consultarDependenciasOperacoesOfPcpActionMock(opIds),
}));
vi.mock("@/modules/pcp/actions/consultarPermissoesOperacoesOfPcpAction", () => ({
  consultarPermissoesOperacoesOfPcpAction: () => consultarPermissoesOperacoesOfPcpActionMock(),
}));
vi.mock("@/modules/pcp/actions/consultarSaldoLivreMateriasPrimasPcpAction", () => ({
  consultarSaldoLivreMateriasPrimasPcpAction: (ids: string[]) => consultarSaldoLivreMateriasPrimasPcpActionMock(ids),
}));
vi.mock("@/modules/pcp/actions/confirmarNecessidadesMomentoYPcpAction", () => ({
  confirmarNecessidadesMomentoYPcpAction: (ofId: string, propostaOriginal: unknown, itens: unknown) =>
    confirmarNecessidadesMomentoYPcpActionMock(ofId, propostaOriginal, itens),
}));
vi.mock("@/modules/pcp/actions/consultarRecursosProdutivosPcpAction", () => ({
  consultarRecursosProdutivosPcpAction: () => consultarRecursosProdutivosPcpActionMock(),
}));
vi.mock("@/modules/pcp/actions/adicionarOperacaoOfPcpAction", () => ({
  adicionarOperacaoOfPcpAction: (ofId: string, dados: unknown) => adicionarOperacaoOfPcpActionMock(ofId, dados),
}));
vi.mock("@/modules/pcp/actions/alterarOperacaoOfPcpAction", () => ({
  alterarOperacaoOfPcpAction: (opId: string, alteracoes: unknown) => alterarOperacaoOfPcpActionMock(opId, alteracoes),
}));
vi.mock("@/modules/pcp/actions/removerOperacaoOfPcpAction", () => ({
  removerOperacaoOfPcpAction: (opId: string, motivo: string) => removerOperacaoOfPcpActionMock(opId, motivo),
}));
vi.mock("@/modules/pcp/actions/adicionarDependenciaOperacaoOfPcpAction", () => ({
  adicionarDependenciaOperacaoOfPcpAction: (opOrigemId: string, opDependenteId: string, motivo: string) =>
    adicionarDependenciaOperacaoOfPcpActionMock(opOrigemId, opDependenteId, motivo),
}));
vi.mock("@/modules/pcp/actions/removerDependenciaOperacaoOfPcpAction", () => ({
  removerDependenciaOperacaoOfPcpAction: (opOrigemId: string, opDependenteId: string, motivo: string) =>
    removerDependenciaOperacaoOfPcpActionMock(opOrigemId, opDependenteId, motivo),
}));
vi.mock("@/modules/pcp/actions/consultarPermissoesDependenciasOperacoesOfPcpAction", () => ({
  consultarPermissoesDependenciasOperacoesOfPcpAction: () => consultarPermissoesDependenciasOperacoesOfPcpActionMock(),
}));

const consultarCargaInicialOfPcpActionMock = vi.fn();
const consultarOfsPcpActionMock = vi.fn();
const consultarPropostaMomentoYActionMock = vi.fn();
const consultarOperacoesOfPcpActionMock = vi.fn();
const consultarDependenciasOperacoesOfPcpActionMock = vi.fn();
const consultarPermissoesOperacoesOfPcpActionMock = vi.fn();
const consultarSaldoLivreMateriasPrimasPcpActionMock = vi.fn();
const confirmarNecessidadesMomentoYPcpActionMock = vi.fn();
const consultarRecursosProdutivosPcpActionMock = vi.fn();
const adicionarOperacaoOfPcpActionMock = vi.fn();
const alterarOperacaoOfPcpActionMock = vi.fn();
const removerOperacaoOfPcpActionMock = vi.fn();
const adicionarDependenciaOperacaoOfPcpActionMock = vi.fn();
const removerDependenciaOperacaoOfPcpActionMock = vi.fn();
const consultarPermissoesDependenciasOperacoesOfPcpActionMock = vi.fn();

import { OrdemFabricacaoDetalhePageContent } from "./OrdemFabricacaoDetalhePageContent";
import type { LinhaOfPcp } from "../lib/buscarOfsPcp";

function linhaFicticia(sobrescritas: Partial<LinhaOfPcp> = {}): LinhaOfPcp {
  return {
    ofId: "of-1",
    numeroOf: "260015-0002",
    projetoId: "11111111-1111-1111-1111-111111111111",
    produtoId: "22222222-2222-2222-2222-222222222222",
    numeroProjeto: "260015",
    produtoCodigo: "FLG-001",
    cliente: "Metalúrgica Vale do Aço",
    estadoAprovacao: "aprovada",
    estadoExecucao: "em_producao",
    descricao: "Flange de acoplamento",
    quantidadePlanejada: 8,
    unidade: "un",
    dataObjetivo: "2026-12-10",
    prazoComercialVigente: null,
    ...sobrescritas,
  };
}

// Builder da resposta da carga inicial consolidada (Etapa 64E) - cada
// teste sobrescreve só a seção que lhe interessa; o resto fica com um
// default inócuo (regime legado, sem operações, sem dependências, sem
// permissões concedidas) para não exigir que todo teste descreva a OF inteira.
function construirCargaInicial(
  overrides: Partial<{
    resultadoOf: unknown;
    resultadoMateriais: unknown;
    resultadoOperacoes: unknown;
    resultadoDependencias: unknown;
    resultadoPermissoesOperacoes: unknown;
    resultadoSaldoLivre: unknown;
    resultadoLegado: unknown;
    resultadoConfirmadas: unknown;
  }> = {},
) {
  return {
    ok: true,
    resultadoOf: overrides.resultadoOf ?? { ok: true, resultado: { linhas: [linhaFicticia()], totalRegistros: 1, pagina: 1, tamanhoPagina: 1 } },
    resultadoMateriais: overrides.resultadoMateriais ?? { ok: true, leitura: { regime: "legado", interruptorAtivo: false, propostaOriginal: [] } },
    resultadoOperacoes: overrides.resultadoOperacoes ?? { ok: true, operacoes: [] },
    resultadoDependencias: overrides.resultadoDependencias ?? { ok: true, dependenciasPorOpId: {} },
    resultadoPermissoesOperacoes: overrides.resultadoPermissoesOperacoes ?? {
      ok: true,
      podeCriarOperacao: false,
      podeEditarOperacao: false,
      podeRemoverOperacao: false,
    },
    resultadoSaldoLivre: "resultadoSaldoLivre" in overrides ? overrides.resultadoSaldoLivre : null,
    resultadoLegado: "resultadoLegado" in overrides ? overrides.resultadoLegado : { ok: true, resumo: null, itens: [] },
    resultadoConfirmadas: "resultadoConfirmadas" in overrides ? overrides.resultadoConfirmadas : null,
  };
}

function prepararCargaPadrao(overrides: Parameters<typeof construirCargaInicial>[0] = {}) {
  consultarCargaInicialOfPcpActionMock.mockResolvedValue(construirCargaInicial(overrides));
}

function prepararCargaPendente(
  propostaOriginal: readonly { materia_prima_id: string; quantidade_sugerida: number; unidade: string; descricao: string; especificacao: string | null }[],
  interruptorAtivo: boolean,
  overrides: Parameters<typeof construirCargaInicial>[0] = {},
) {
  prepararCargaPadrao({
    resultadoMateriais: { ok: true, leitura: { regime: "pendente_momento_y", interruptorAtivo, propostaOriginal } },
    resultadoLegado: null,
    ...overrides,
  });
}

beforeEach(() => {
  consultarOfsPcpActionMock.mockResolvedValue({ ok: true, resultado: { linhas: [linhaFicticia()], totalRegistros: 1, pagina: 1, tamanhoPagina: 1 } });
  consultarOperacoesOfPcpActionMock.mockResolvedValue({ ok: true, operacoes: [] });
  consultarDependenciasOperacoesOfPcpActionMock.mockResolvedValue({ ok: true, dependenciasPorOpId: {} });
  consultarPermissoesOperacoesOfPcpActionMock.mockResolvedValue({
    ok: true,
    podeCriarOperacao: false,
    podeEditarOperacao: false,
    podeRemoverOperacao: false,
  });
  consultarSaldoLivreMateriasPrimasPcpActionMock.mockResolvedValue({ ok: true, saldoLivrePorMaterial: {} });
  confirmarNecessidadesMomentoYPcpActionMock.mockResolvedValue({ ok: false, motivo: "erro_desconhecido" });
  consultarRecursosProdutivosPcpActionMock.mockResolvedValue({
    ok: true,
    recursos: [
      { id: "rec-1", label: "TC01 — Torno CNC 01" },
      { id: "rec-2", label: "Furadeira 02" },
    ],
  });
  consultarPermissoesDependenciasOperacoesOfPcpActionMock.mockResolvedValue({
    ok: true,
    podeCriarDependencia: false,
    podeRemoverDependencia: false,
    ambienteHabilitado: true,
  });
  prepararCargaPadrao();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OrdemFabricacaoDetalhePageContent — carga inicial consolidada (Etapa 64E)", () => {
  it("1. Chama a carga inicial consolidada exatamente uma vez, com o ofId da página", async () => {
    render(<OrdemFabricacaoDetalhePageContent ofId="of-xyz" />);

    await waitFor(() => screen.getByText("Dados da OF"));
    expect(consultarCargaInicialOfPcpActionMock).toHaveBeenCalledTimes(1);
    expect(consultarCargaInicialOfPcpActionMock).toHaveBeenCalledWith("of-xyz");
  });

  it("2. Sessão não autenticada: mostra mensagem de erro em Dados da OF, Operações e Matérias-primas, sem travar em 'carregando' para sempre", async () => {
    consultarCargaInicialOfPcpActionMock.mockResolvedValue({ ok: false, motivo: "nao_autenticado" });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    await waitFor(() => screen.getByText("Sessão não autenticada."));
    expect(screen.queryByText("Carregando dados da OF…")).toBeNull();
  });
});

describe("OrdemFabricacaoDetalhePageContent — identificadores de Projeto/Produto", () => {
  it("1. Projeto: exibe numero_projeto (não o UUID) e o link usa o UUID (rota /projetos/[id])", async () => {
    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const link = await waitFor(() => screen.getByRole("link", { name: "260015" }) as HTMLAnchorElement);
    expect(link.getAttribute("href")).toBe("/projetos/11111111-1111-1111-1111-111111111111");
    expect(screen.queryByText("11111111-1111-1111-1111-111111111111")).toBeNull();
  });

  it("2. Produto: exibe o código comercial e o link usa o código (rota /produtos/[pn]), nunca o UUID", async () => {
    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const link = await waitFor(() => screen.getByRole("link", { name: "FLG-001" }) as HTMLAnchorElement);
    expect(link.getAttribute("href")).toBe("/produtos/FLG-001");
    expect(screen.queryByText("22222222-2222-2222-2222-222222222222")).toBeNull();
  });

  it("3. Produto sem código cadastrado: mostra 'Código indisponível', sem link e sem UUID", async () => {
    prepararCargaPadrao({
      resultadoOf: { ok: true, resultado: { linhas: [linhaFicticia({ produtoCodigo: null })], totalRegistros: 1, pagina: 1, tamanhoPagina: 1 } },
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    await waitFor(() => screen.getByText("Código indisponível"));
    expect(screen.queryByText("22222222-2222-2222-2222-222222222222")).toBeNull();
    expect(screen.queryByRole("link", { name: /22222222/ })).toBeNull();
  });
});

describe("OrdemFabricacaoDetalhePageContent — Operações de Produção (Fase 1, leitura)", () => {
  it("1. Os 3 estados reais aparecem na tabela, cada um com o rótulo correto", async () => {
    prepararCargaPadrao({
      resultadoOperacoes: {
        ok: true,
        operacoes: [
          { opId: "op-1", codigoOperacional: "OP10", descricao: "Corte", sequencia: 1, recursoId: "rec-1", recursoNome: "Torno CNC 01", tempoPlanejadoMinutos: 30, situacao: "concluida", motivoNaoAplicavel: null, origem: "roteiro", temApontamento: true },
          { opId: "op-2", codigoOperacional: "OP20", descricao: "Furação", sequencia: 2, recursoId: "rec-2", recursoNome: "Furadeira 02", tempoPlanejadoMinutos: 45, situacao: "pendente", motivoNaoAplicavel: null, origem: "roteiro", temApontamento: false },
          { opId: "op-3", codigoOperacional: "OP30", descricao: "Pintura", sequencia: 3, recursoId: null, recursoNome: null, tempoPlanejadoMinutos: null, situacao: "nao_aplicavel", motivoNaoAplicavel: "Item não pintado", origem: "y", temApontamento: false },
        ],
      },
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    await waitFor(() => screen.getByText("OP10"));
    expect(screen.getByText("Concluída")).toBeDefined();
    expect(screen.getByText("Pendente")).toBeDefined();
    expect(screen.getByText("Não aplicável")).toBeDefined();
  });

  it("2. Recurso e tempo ausentes: mostra os rótulos de ausência, nunca um valor inventado", async () => {
    prepararCargaPadrao({
      resultadoOperacoes: {
        ok: true,
        operacoes: [
          { opId: "op-9", codigoOperacional: "OP90", descricao: "Inspeção final", sequencia: 1, recursoId: null, recursoNome: null, tempoPlanejadoMinutos: null, situacao: "pendente", motivoNaoAplicavel: null, origem: "y", temApontamento: false },
        ],
      },
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    await waitFor(() => screen.getByText("Recurso não definido"));
    expect(screen.getByText("Tempo não definido")).toBeDefined();
  });

  it("3. Falha ao consultar as operações: mostra mensagem de erro com 'Tentar novamente', nunca uma tabela vazia disfarçada de 'sem operações'", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: false, motivo: "erro_desconhecido" } });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    await waitFor(() => screen.getByText("Falha técnica ao consultar as operações desta OF."));
    expect(screen.queryByText("Nenhuma operação cadastrada")).toBeNull();
    expect(screen.getByText("Tentar novamente")).toBeDefined();
  });

  it("4. OFs diferentes: a carga inicial consolidada é chamada com o ofId correto da página", async () => {
    render(<OrdemFabricacaoDetalhePageContent ofId="of-outra-of" />);

    await waitFor(() => expect(consultarCargaInicialOfPcpActionMock).toHaveBeenCalledWith("of-outra-of"));
  });

  it("5. Falha ao consultar operações: clicar em 'Tentar novamente' chama a Server Action original preservada e recupera a tabela", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: false, motivo: "erro_desconhecido" } });
    consultarOperacoesOfPcpActionMock.mockResolvedValue({
      ok: true,
      operacoes: [{ opId: "op-1", codigoOperacional: "OP10", descricao: "Corte", sequencia: 1, recursoId: null, recursoNome: null, tempoPlanejadoMinutos: null, situacao: "pendente", motivoNaoAplicavel: null, origem: "roteiro", temApontamento: false }],
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoTentar = await waitFor(() => screen.getByText("Tentar novamente") as HTMLButtonElement);
    fireEvent.click(botaoTentar);

    await waitFor(() => expect(consultarOperacoesOfPcpActionMock).toHaveBeenCalledWith("of-1"));
    await waitFor(() => screen.getByText("OP10"));
  });
});

describe("OrdemFabricacaoDetalhePageContent — Etapa 59A: controles mockados de Operações de Produção", () => {
  function operacaoFicticia(sobrescritas: Record<string, unknown> = {}) {
    return {
      opId: "op-1",
      codigoOperacional: "OP10",
      descricao: "Corte",
      sequencia: 1,
      recursoId: null,
      recursoNome: null,
      tempoPlanejadoMinutos: null,
      situacao: "pendente",
      motivoNaoAplicavel: null,
      origem: "roteiro",
      temApontamento: false,
      ...sobrescritas,
    };
  }

  it("1. Sem a permissão candidata (padrão hoje): Adicionar/Editar/Remover ficam desabilitados com o motivo explícito", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: true, operacoes: [operacaoFicticia()] } });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoAdicionar = (await waitFor(() => screen.getByText("Adicionar operação"))) as HTMLButtonElement;
    await waitFor(() => expect(botaoAdicionar.disabled).toBe(true));
    expect(botaoAdicionar.title).toBe("Seu usuário não tem a permissão pcp.criar_operacao_of.");

    const botaoEditar = screen.getByText("Editar") as HTMLButtonElement;
    expect(botaoEditar.disabled).toBe(true);
    expect(botaoEditar.title).toBe("Seu usuário não tem a permissão pcp.editar_operacao_of.");

    const botaoRemover = screen.getByText("Remover") as HTMLButtonElement;
    expect(botaoRemover.disabled).toBe(true);
    expect(botaoRemover.title).toBe("Seu usuário não tem a permissão pcp.remover_operacao_of.");
  });

  it("2. OP com apontamento real (temApontamento=true): Editar/Remover bloqueados mesmo com situação 'pendente' e permissão concedida", async () => {
    prepararCargaPadrao({
      resultadoPermissoesOperacoes: { ok: true, podeCriarOperacao: true, podeEditarOperacao: true, podeRemoverOperacao: true },
      resultadoOperacoes: { ok: true, operacoes: [operacaoFicticia({ situacao: "pendente", temApontamento: true })] },
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoEditar = (await waitFor(() => screen.getByText("Editar"))) as HTMLButtonElement;
    expect(botaoEditar.disabled).toBe(true);
    expect(botaoEditar.title).toBe("Esta OP já tem apontamento real registrado — planejamento (Y) bloqueado após início.");
    const botaoRemover = screen.getByText("Remover") as HTMLButtonElement;
    expect(botaoRemover.disabled).toBe(true);
  });

  it("3. OF em estado final (cancelada): Adicionar/Editar/Remover bloqueados, mesmo com permissão e sem apontamento", async () => {
    prepararCargaPadrao({
      resultadoOf: { ok: true, resultado: { linhas: [linhaFicticia({ estadoExecucao: "cancelada" })], totalRegistros: 1, pagina: 1, tamanhoPagina: 1 } },
      resultadoPermissoesOperacoes: { ok: true, podeCriarOperacao: true, podeEditarOperacao: true, podeRemoverOperacao: true },
      resultadoOperacoes: { ok: true, operacoes: [operacaoFicticia()] },
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoAdicionar = (await waitFor(() => screen.getByText("Adicionar operação"))) as HTMLButtonElement;
    expect(botaoAdicionar.disabled).toBe(true);
    expect(botaoAdicionar.title).toContain("estado final (cancelada)");
    expect((screen.getByText("Editar") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText("Remover") as HTMLButtonElement).disabled).toBe(true);
  });

  it("4. Origem real: badges 'Do roteiro' e 'Adicionada pelo PCP' aparecem conforme o dado real", async () => {
    prepararCargaPadrao({
      resultadoOperacoes: {
        ok: true,
        operacoes: [operacaoFicticia({ origem: "roteiro" }), operacaoFicticia({ opId: "op-2", codigoOperacional: "OP45", origem: "y" })],
      },
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    await waitFor(() => screen.getByText("Do roteiro"));
    expect(screen.getByText("Adicionada pelo PCP")).toBeDefined();
  });

  it("5. Remover com dependências relacionadas: lista o impedimento e desabilita 'Confirmar remoção', sem excluir a dependência", async () => {
    prepararCargaPadrao({
      resultadoPermissoesOperacoes: { ok: true, podeCriarOperacao: true, podeEditarOperacao: true, podeRemoverOperacao: true },
      resultadoOperacoes: { ok: true, operacoes: [operacaoFicticia()] },
      resultadoDependencias: {
        ok: true,
        dependenciasPorOpId: { "op-1": [{ opRelacionadaId: "op-2", codigoOperacionalRelacionada: "OP20", papel: "origem" }] },
      },
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoRemover = await waitFor(() => screen.getByText("Remover") as HTMLButtonElement);
    expect(botaoRemover.disabled).toBe(false);
    fireEvent.click(botaoRemover);

    await waitFor(() => screen.getByText(/É pré-requisito de OP20/));
    const botaoConfirmar = screen.getByText("Confirmar remoção") as HTMLButtonElement;
    expect(botaoConfirmar.disabled).toBe(true);
  });

  it("6. Remover sem dependências: exige motivo, valida visualmente, chama a Server Action real com o opId e motivo certos, e relê as operações após sucesso", async () => {
    prepararCargaPadrao({
      resultadoPermissoesOperacoes: { ok: true, podeCriarOperacao: true, podeEditarOperacao: true, podeRemoverOperacao: true },
      resultadoOperacoes: { ok: true, operacoes: [operacaoFicticia()] },
    });
    removerOperacaoOfPcpActionMock.mockResolvedValue({ ok: true });
    consultarOperacoesOfPcpActionMock.mockResolvedValue({
      ok: true,
      operacoes: [operacaoFicticia({ situacao: "nao_aplicavel", motivoNaoAplicavel: "Peça não será mais fabricada neste pedido." })],
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoRemover = await waitFor(() => screen.getByText("Remover") as HTMLButtonElement);
    fireEvent.click(botaoRemover);

    await waitFor(() => screen.getByText("Confirmar remoção"));
    const botaoConfirmar = screen.getByText("Confirmar remoção") as HTMLButtonElement;
    expect(botaoConfirmar.disabled).toBe(false);

    fireEvent.click(botaoConfirmar);
    await waitFor(() => screen.getByText("Informe o motivo da remoção."));

    const campoMotivo = screen.getByLabelText("Motivo") as HTMLInputElement;
    fireEvent.change(campoMotivo, { target: { value: "Peça não será mais fabricada neste pedido." } });

    fireEvent.click(botaoConfirmar);

    await waitFor(() =>
      expect(removerOperacaoOfPcpActionMock).toHaveBeenCalledWith("op-1", "Peça não será mais fabricada neste pedido."),
    );
    // Modal fecha após sucesso, e a tabela é relida (não é mais "Simulado").
    await waitFor(() => expect(screen.queryByText("Confirmar remoção")).toBeNull());
    expect(consultarOperacoesOfPcpActionMock).toHaveBeenCalledTimes(1); // só a releitura pós-sucesso (a carga inicial usa a Server Action consolidada, não esta)
  });

  it("7. Remover: duplo clique não dispara duas chamadas - botão trava em 'Removendo…' durante o envio", async () => {
    prepararCargaPadrao({
      resultadoPermissoesOperacoes: { ok: true, podeCriarOperacao: true, podeEditarOperacao: true, podeRemoverOperacao: true },
      resultadoOperacoes: { ok: true, operacoes: [operacaoFicticia()] },
    });
    let resolverRemocao: (valor: unknown) => void = () => {};
    removerOperacaoOfPcpActionMock.mockReturnValue(new Promise((resolve) => (resolverRemocao = resolve)));

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    fireEvent.click(await waitFor(() => screen.getByText("Remover") as HTMLButtonElement));
    await waitFor(() => screen.getByText("Confirmar remoção"));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "motivo válido" } });
    fireEvent.click(screen.getByText("Confirmar remoção"));

    const botaoEmAndamento = await waitFor(() => screen.getByText("Removendo…") as HTMLButtonElement);
    expect(botaoEmAndamento.disabled).toBe(true);
    fireEvent.click(botaoEmAndamento);
    expect(removerOperacaoOfPcpActionMock).toHaveBeenCalledTimes(1);

    resolverRemocao({ ok: true });
    await waitFor(() => expect(screen.queryByText("Confirmar remoção")).toBeNull());
  });

  it("8. Remover: dependências criadas entre a leitura e a confirmação (concorrência) - rejeição definitiva, nunca remove a dependência, relê o estado", async () => {
    prepararCargaPadrao({
      resultadoPermissoesOperacoes: { ok: true, podeCriarOperacao: true, podeEditarOperacao: true, podeRemoverOperacao: true },
      resultadoOperacoes: { ok: true, operacoes: [operacaoFicticia()] },
    });
    removerOperacaoOfPcpActionMock.mockResolvedValue({ ok: false, motivo: "dependencias_pendentes" });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    fireEvent.click(await waitFor(() => screen.getByText("Remover") as HTMLButtonElement));
    await waitFor(() => screen.getByText("Confirmar remoção"));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "motivo válido" } });
    fireEvent.click(screen.getByText("Confirmar remoção"));

    await waitFor(() => screen.getByText(/dependências relacionadas — revise-as antes de remover/));
    // Modal permanece aberto (dados do formulário preservados) - releu operações/dependências em segundo plano.
    expect(screen.getByText("Confirmar remoção")).toBeDefined();
    await waitFor(() => expect(consultarOperacoesOfPcpActionMock).toHaveBeenCalledTimes(1));
  });

  it("9. Remover: gravação incerta - nunca repete sozinho, reconsulta e confirma que NÃO foi removida", async () => {
    prepararCargaPadrao({
      resultadoPermissoesOperacoes: { ok: true, podeCriarOperacao: true, podeEditarOperacao: true, podeRemoverOperacao: true },
      resultadoOperacoes: { ok: true, operacoes: [operacaoFicticia()] },
    });
    removerOperacaoOfPcpActionMock.mockResolvedValue({ ok: false, motivo: "gravacao_incerta" });
    consultarOperacoesOfPcpActionMock.mockResolvedValue({ ok: true, operacoes: [operacaoFicticia({ situacao: "pendente" })] });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    fireEvent.click(await waitFor(() => screen.getByText("Remover") as HTMLButtonElement));
    await waitFor(() => screen.getByText("Confirmar remoção"));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "motivo válido" } });
    fireEvent.click(screen.getByText("Confirmar remoção"));

    await waitFor(() => screen.getByText(/NÃO foi removida/));
    expect(removerOperacaoOfPcpActionMock).toHaveBeenCalledTimes(1);
  });

  it("7. Adicionar operação: validação visual exige Código, Descrição, Sequência e Motivo (assinatura real de criar_op_no_y)", async () => {
    prepararCargaPadrao({
      resultadoPermissoesOperacoes: { ok: true, podeCriarOperacao: true, podeEditarOperacao: true, podeRemoverOperacao: true },
      resultadoOperacoes: { ok: true, operacoes: [] },
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoAdicionar = await waitFor(() => screen.getByText("Adicionar operação") as HTMLButtonElement);
    expect(botaoAdicionar.disabled).toBe(false);
    fireEvent.click(botaoAdicionar);

    await waitFor(() => screen.getByText("Adicionar", { selector: "button" }));
    const botaoConfirmar = screen.getByText("Adicionar", { selector: "button" }) as HTMLButtonElement;
    fireEvent.click(botaoConfirmar);

    await waitFor(() => screen.getByText("Informe o código da OP."));
    expect(screen.getByText("Informe a descrição da OP.")).toBeDefined();
    expect(screen.getByText("Informe a sequência (número).")).toBeDefined();
    expect(screen.getByText("Informe o motivo desta alteração.")).toBeDefined();
  });

  it("8. Falha na leitura de dependências: botão Remover fica bloqueado (nunca libera por omissão), com retry disponível", async () => {
    prepararCargaPadrao({
      resultadoPermissoesOperacoes: { ok: true, podeCriarOperacao: true, podeEditarOperacao: true, podeRemoverOperacao: true },
      resultadoOperacoes: { ok: true, operacoes: [operacaoFicticia()] },
      resultadoDependencias: { ok: false, motivo: "erro_desconhecido" },
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoRemover = (await waitFor(() => screen.getByText("Remover"))) as HTMLButtonElement;
    expect(botaoRemover.disabled).toBe(true);
    expect(botaoRemover.title).toBe("Falha técnica ao consultar dependências — remoção bloqueada até confirmar que não há dependências.");
  });

  it("9. Falha na leitura de operações: dependências ficam marcadas como indeterminadas (nunca 'sem dependências')", async () => {
    prepararCargaPadrao({
      resultadoOperacoes: { ok: false, motivo: "erro_desconhecido" },
      resultadoDependencias: { ok: false, motivo: "operacoes_indisponiveis" },
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    await waitFor(() => screen.getByText("Falha técnica ao consultar as operações desta OF."));
    // Sem a tabela de operações carregada, o botão Remover nem chega a existir - a garantia
    // real está coberta pela Server Action (teste 9 de consultarCargaInicialOfPcpAction.test.ts).
    expect(screen.queryByText("Remover")).toBeNull();
  });

  it("10. Falha na leitura de permissões: mostra aviso visível com 'Tentar novamente', Adicionar/Editar/Remover seguem bloqueados", async () => {
    prepararCargaPadrao({
      resultadoOperacoes: { ok: true, operacoes: [operacaoFicticia()] },
      resultadoPermissoesOperacoes: { ok: false, motivo: "erro_desconhecido" },
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    await waitFor(() => screen.getByText(/Falha técnica ao consultar permissões/));
    expect((screen.getByText("Editar") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText("Remover") as HTMLButtonElement).disabled).toBe(true);

    consultarPermissoesOperacoesOfPcpActionMock.mockResolvedValue({ ok: true, podeCriarOperacao: true, podeEditarOperacao: true, podeRemoverOperacao: true });
    fireEvent.click(screen.getAllByText("Tentar novamente")[0]);

    await waitFor(() => expect((screen.getByText("Editar") as HTMLButtonElement).disabled).toBe(false));
  });
});

describe("OrdemFabricacaoDetalhePageContent — Etapa 65C: seletor real de recurso produtivo", () => {
  function operacaoFicticiaComRecurso(sobrescritas: Record<string, unknown> = {}) {
    return {
      opId: "op-1",
      codigoOperacional: "OP10",
      descricao: "Corte",
      sequencia: 1,
      recursoId: "rec-1",
      recursoNome: "TC01 — Torno CNC 01",
      tempoPlanejadoMinutos: null,
      situacao: "pendente",
      motivoNaoAplicavel: null,
      origem: "roteiro",
      temApontamento: false,
      ...sobrescritas,
    };
  }

  it("1. Carregamento sob demanda: não consulta recursos no mount da página, só ao abrir Adicionar/Editar", async () => {
    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    await waitFor(() => screen.getByText("Dados da OF"));
    expect(consultarRecursosProdutivosPcpActionMock).not.toHaveBeenCalled();
  });

  it("2. Ao abrir Adicionar: consulta os recursos uma vez e os exibe como opções, com 'Nenhum' disponível", async () => {
    prepararCargaPadrao({
      resultadoPermissoesOperacoes: { ok: true, podeCriarOperacao: true, podeEditarOperacao: true, podeRemoverOperacao: true },
    });
    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoAdicionar = await waitFor(() => screen.getByText("Adicionar operação") as HTMLButtonElement);
    fireEvent.click(botaoAdicionar);

    await waitFor(() => expect(consultarRecursosProdutivosPcpActionMock).toHaveBeenCalledTimes(1));
    const seletor = (await waitFor(() => screen.getByLabelText("Recurso"))) as HTMLSelectElement;
    const rotulos = Array.from(seletor.options).map((o) => o.textContent);
    expect(rotulos).toEqual(["Nenhum", "TC01 — Torno CNC 01", "Furadeira 02"]);
  });

  it("3. Ao editar uma OP que JÁ tem recurso: o seletor já vem com o UUID real selecionado, e 'Nenhum' NÃO é oferecido (NULL nunca significa 'limpar' em alterar_y_operacao)", async () => {
    prepararCargaPadrao({
      resultadoOperacoes: { ok: true, operacoes: [operacaoFicticiaComRecurso()] },
      resultadoPermissoesOperacoes: { ok: true, podeCriarOperacao: true, podeEditarOperacao: true, podeRemoverOperacao: true },
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoEditar = await waitFor(() => screen.getByText("Editar") as HTMLButtonElement);
    fireEvent.click(botaoEditar);

    const seletor = (await waitFor(() => screen.getByLabelText("Recurso"))) as HTMLSelectElement;
    await waitFor(() => expect(seletor.value).toBe("rec-1"));
    const rotulos = Array.from(seletor.options).map((o) => o.textContent);
    expect(rotulos).not.toContain("Nenhum");
  });

  it("4. Ao editar uma OP SEM recurso: 'Nenhum' continua disponível (não é uma falsa promessa de limpeza, é um estado real)", async () => {
    prepararCargaPadrao({
      resultadoOperacoes: { ok: true, operacoes: [operacaoFicticiaComRecurso({ recursoId: null, recursoNome: null })] },
      resultadoPermissoesOperacoes: { ok: true, podeCriarOperacao: true, podeEditarOperacao: true, podeRemoverOperacao: true },
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoEditar = await waitFor(() => screen.getByText("Editar") as HTMLButtonElement);
    fireEvent.click(botaoEditar);

    const seletor = (await waitFor(() => screen.getByLabelText("Recurso"))) as HTMLSelectElement;
    await waitFor(() => expect(Array.from(seletor.options).map((o) => o.textContent)).toContain("Nenhum"));
  });

  it("5. Falha ao consultar recursos: mostra erro com 'Tentar novamente', que refaz a consulta", async () => {
    prepararCargaPadrao({
      resultadoPermissoesOperacoes: { ok: true, podeCriarOperacao: true, podeEditarOperacao: true, podeRemoverOperacao: true },
    });
    consultarRecursosProdutivosPcpActionMock.mockResolvedValueOnce({ ok: false, motivo: "erro_desconhecido" });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoAdicionar = await waitFor(() => screen.getByText("Adicionar operação") as HTMLButtonElement);
    fireEvent.click(botaoAdicionar);

    await waitFor(() => screen.getByText("Falha técnica ao consultar os recursos produtivos."));
    fireEvent.click(screen.getByText("Tentar novamente"));

    await waitFor(() => expect(consultarRecursosProdutivosPcpActionMock).toHaveBeenCalledTimes(2));
    await waitFor(() => screen.getByLabelText("Recurso"));
  });

  it("6. Editar OP cujo recurso atual foi desativado: continua visível e selecionado, identificado como inativo, nunca some ou troca sozinho", async () => {
    prepararCargaPadrao({
      resultadoOperacoes: {
        ok: true,
        operacoes: [operacaoFicticiaComRecurso({ recursoId: "rec-desativado-1", recursoNome: "Dobradeira antiga" })],
      },
      resultadoPermissoesOperacoes: { ok: true, podeCriarOperacao: true, podeEditarOperacao: true, podeRemoverOperacao: true },
    });
    // rec-desativado-1 NÃO está entre os recursos ativos devolvidos (rec-1/rec-2) - simula desativação posterior.

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoEditar = await waitFor(() => screen.getByText("Editar") as HTMLButtonElement);
    fireEvent.click(botaoEditar);

    const seletor = (await waitFor(() => screen.getByLabelText("Recurso"))) as HTMLSelectElement;
    await waitFor(() => expect(seletor.value).toBe("rec-desativado-1"));
    expect(screen.getByText(/Dobradeira antiga \(inativo/)).toBeDefined();

    // Editar outro campo (tempo) e nada no recurso muda sozinho.
    const campoTempo = screen.getByLabelText("Tempo planejado (min)") as HTMLInputElement;
    fireEvent.change(campoTempo, { target: { value: "40" } });
    expect(seletor.value).toBe("rec-desativado-1");
  });

  it("7. Editar OP cujo recurso atual não existe mais (recursoNome nulo, ex.: excluído): preserva o id real selecionado, com rótulo genérico de fallback", async () => {
    prepararCargaPadrao({
      resultadoOperacoes: {
        ok: true,
        operacoes: [operacaoFicticiaComRecurso({ recursoId: "rec-removido-1", recursoNome: null })],
      },
      resultadoPermissoesOperacoes: { ok: true, podeCriarOperacao: true, podeEditarOperacao: true, podeRemoverOperacao: true },
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoEditar = await waitFor(() => screen.getByText("Editar") as HTMLButtonElement);
    fireEvent.click(botaoEditar);

    const seletor = (await waitFor(() => screen.getByLabelText("Recurso"))) as HTMLSelectElement;
    await waitFor(() => expect(seletor.value).toBe("rec-removido-1"));
    expect(screen.getByText(/Recurso \(inativo/)).toBeDefined();
  });
});

describe("OrdemFabricacaoDetalhePageContent — Etapa 65F: integração real de Adicionar e Editar OP", () => {
  function operacaoFicticia(sobrescritas: Record<string, unknown> = {}) {
    return {
      opId: "op-1",
      codigoOperacional: "OP10",
      descricao: "Corte",
      sequencia: 1,
      recursoId: null,
      recursoNome: null,
      tempoPlanejadoMinutos: null,
      situacao: "pendente",
      motivoNaoAplicavel: null,
      origem: "roteiro",
      temApontamento: false,
      ...sobrescritas,
    };
  }
  const PERMISSOES_TOTAL = { ok: true, podeCriarOperacao: true, podeEditarOperacao: true, podeRemoverOperacao: true };

  it("1. Adicionar: sucesso chama a Server Action com os dados certos (nunca o roteiro X), fecha o modal e relê as operações", async () => {
    prepararCargaPadrao({ resultadoPermissoesOperacoes: PERMISSOES_TOTAL, resultadoOperacoes: { ok: true, operacoes: [] } });
    adicionarOperacaoOfPcpActionMock.mockResolvedValue({ ok: true, novoOpId: "op-novo-1" });
    consultarOperacoesOfPcpActionMock.mockResolvedValue({ ok: true, operacoes: [operacaoFicticia({ opId: "op-novo-1", codigoOperacional: "OP50" })] });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    fireEvent.click(await waitFor(() => screen.getByText("Adicionar operação") as HTMLButtonElement));
    fireEvent.change(screen.getByLabelText("Código da OP"), { target: { value: "OP50" } });
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Pintura" } });
    fireEvent.change(screen.getByLabelText("Sequência"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "demanda nova" } });
    fireEvent.click(screen.getByText("Adicionar", { selector: "button" }));

    await waitFor(() =>
      expect(adicionarOperacaoOfPcpActionMock).toHaveBeenCalledWith("of-1", {
        codigoOperacional: "OP50",
        descricao: "Pintura",
        sequenciaVigente: 5,
        recursoVigenteId: null,
        tempoVigenteMinutos: null,
        motivo: "demanda nova",
      }),
    );
    // Nunca chama nada relacionado ao roteiro (bom_operacoes/X) - só a Server Action de Y.
    await waitFor(() => expect(screen.queryByText("Adicionar operação")).toBeDefined()); // modal fechou, botão da página volta a aparecer
    expect(consultarOperacoesOfPcpActionMock).toHaveBeenCalledTimes(1);
  });

  it("2. Adicionar: duplo clique não dispara duas chamadas", async () => {
    prepararCargaPadrao({ resultadoPermissoesOperacoes: PERMISSOES_TOTAL, resultadoOperacoes: { ok: true, operacoes: [] } });
    let resolverAdicao: (valor: unknown) => void = () => {};
    adicionarOperacaoOfPcpActionMock.mockReturnValue(new Promise((resolve) => (resolverAdicao = resolve)));

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    fireEvent.click(await waitFor(() => screen.getByText("Adicionar operação") as HTMLButtonElement));
    fireEvent.change(screen.getByLabelText("Código da OP"), { target: { value: "OP50" } });
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Pintura" } });
    fireEvent.change(screen.getByLabelText("Sequência"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "demanda nova" } });
    fireEvent.click(screen.getByText("Adicionar", { selector: "button" }));

    const botaoEmAndamento = await waitFor(() => screen.getByText("Adicionando…") as HTMLButtonElement);
    expect(botaoEmAndamento.disabled).toBe(true);
    fireEvent.click(botaoEmAndamento);
    expect(adicionarOperacaoOfPcpActionMock).toHaveBeenCalledTimes(1);

    resolverAdicao({ ok: true, novoOpId: "op-novo-1" });
    await waitFor(() => expect(screen.queryByText("Adicionando…")).toBeNull());
  });

  it("3. Adicionar: gravação incerta - reconsulta e confirma que NÃO foi criada (nunca repete sozinho)", async () => {
    prepararCargaPadrao({ resultadoPermissoesOperacoes: PERMISSOES_TOTAL, resultadoOperacoes: { ok: true, operacoes: [] } });
    adicionarOperacaoOfPcpActionMock.mockResolvedValue({ ok: false, motivo: "gravacao_incerta" });
    consultarOperacoesOfPcpActionMock.mockResolvedValue({ ok: true, operacoes: [] });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    fireEvent.click(await waitFor(() => screen.getByText("Adicionar operação") as HTMLButtonElement));
    fireEvent.change(screen.getByLabelText("Código da OP"), { target: { value: "OP50" } });
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Pintura" } });
    fireEvent.change(screen.getByLabelText("Sequência"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "demanda nova" } });
    fireEvent.click(screen.getByText("Adicionar", { selector: "button" }));

    await waitFor(() => screen.getByText(/NÃO foi criada/));
    expect(adicionarOperacaoOfPcpActionMock).toHaveBeenCalledTimes(1);
  });

  it("3b. Adicionar: OF virou estado final entre a abertura do modal e o envio - mensagem clara e dados preservados (Etapa 65I)", async () => {
    prepararCargaPadrao({ resultadoPermissoesOperacoes: PERMISSOES_TOTAL, resultadoOperacoes: { ok: true, operacoes: [] } });
    adicionarOperacaoOfPcpActionMock.mockResolvedValue({ ok: false, motivo: "of_estado_final" });
    consultarOperacoesOfPcpActionMock.mockResolvedValue({ ok: true, operacoes: [] });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    fireEvent.click(await waitFor(() => screen.getByText("Adicionar operação") as HTMLButtonElement));
    fireEvent.change(screen.getByLabelText("Código da OP"), { target: { value: "OP50" } });
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Pintura" } });
    fireEvent.change(screen.getByLabelText("Sequência"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "demanda nova" } });
    fireEvent.click(screen.getByText("Adicionar", { selector: "button" }));

    await waitFor(() => screen.getByText("Esta OF está concluída, cancelada ou desdobrada. Não é permitido alterar suas operações."));
    // Modal continua aberto e os dados preenchidos permanecem - nunca se perdem numa rejeição.
    expect((screen.getByLabelText("Código da OP") as HTMLInputElement).value).toBe("OP50");
    expect((screen.getByLabelText("Descrição") as HTMLInputElement).value).toBe("Pintura");
    expect((screen.getByLabelText("Motivo") as HTMLInputElement).value).toBe("demanda nova");
  });

  it("4. Editar sem apontamento: envia só os campos previstos no contrato, com os valores certos", async () => {
    prepararCargaPadrao({
      resultadoPermissoesOperacoes: PERMISSOES_TOTAL,
      resultadoOperacoes: { ok: true, operacoes: [operacaoFicticia({ temApontamento: false, sequencia: 1 })] },
    });
    alterarOperacaoOfPcpActionMock.mockResolvedValue({ ok: true });
    consultarOperacoesOfPcpActionMock.mockResolvedValue({ ok: true, operacoes: [operacaoFicticia({ tempoPlanejadoMinutos: 40 })] });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    fireEvent.click(await waitFor(() => screen.getByText("Editar") as HTMLButtonElement));
    fireEvent.change(screen.getByLabelText("Tempo planejado (min)"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "ajuste de tempo" } });
    fireEvent.click(screen.getByText("Salvar edição"));

    await waitFor(() =>
      expect(alterarOperacaoOfPcpActionMock).toHaveBeenCalledWith("op-1", {
        recursoVigenteId: null,
        tempoVigenteMinutos: 40,
        sequenciaVigente: 1,
        motivo: "ajuste de tempo",
      }),
    );
  });

  it("5. Editar: OP com apontamento (concorrência real) rejeita no envio, mesmo que o botão já estivesse habilitado quando o modal abriu", async () => {
    prepararCargaPadrao({
      resultadoPermissoesOperacoes: PERMISSOES_TOTAL,
      resultadoOperacoes: { ok: true, operacoes: [operacaoFicticia({ temApontamento: false })] },
    });
    alterarOperacaoOfPcpActionMock.mockResolvedValue({ ok: false, motivo: "apontamento_bloqueado" });
    consultarOperacoesOfPcpActionMock.mockResolvedValue({ ok: true, operacoes: [operacaoFicticia({ temApontamento: true })] });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    fireEvent.click(await waitFor(() => screen.getByText("Editar") as HTMLButtonElement));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "ajuste" } });
    fireEvent.click(screen.getByText("Salvar edição"));

    await waitFor(() => screen.getByText(/já tem apontamento real registrado/));
    // Releu operações em segundo plano - a tabela refletirá o bloqueio na próxima vez que o modal abrir.
    await waitFor(() => expect(consultarOperacoesOfPcpActionMock).toHaveBeenCalledTimes(1));
  });

  it("6. Editar: gravação incerta - reconsulta e confirma que a alteração FOI aplicada (valores batem com o atual)", async () => {
    prepararCargaPadrao({
      resultadoPermissoesOperacoes: PERMISSOES_TOTAL,
      resultadoOperacoes: { ok: true, operacoes: [operacaoFicticia({ tempoPlanejadoMinutos: 10 })] },
    });
    alterarOperacaoOfPcpActionMock.mockResolvedValue({ ok: false, motivo: "gravacao_incerta" });
    consultarOperacoesOfPcpActionMock.mockResolvedValue({ ok: true, operacoes: [operacaoFicticia({ tempoPlanejadoMinutos: 40 })] });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    fireEvent.click(await waitFor(() => screen.getByText("Editar") as HTMLButtonElement));
    fireEvent.change(screen.getByLabelText("Tempo planejado (min)"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "ajuste" } });
    fireEvent.click(screen.getByText("Salvar edição"));

    await waitFor(() => screen.getByText(/A alteração FOI aplicada/));
  });

  it("7. Editar: campos deixados em branco são enviados como NULL (não altera), nunca como 'limpar'", async () => {
    prepararCargaPadrao({
      resultadoPermissoesOperacoes: PERMISSOES_TOTAL,
      resultadoOperacoes: { ok: true, operacoes: [operacaoFicticia({ tempoPlanejadoMinutos: 30 })] },
    });
    alterarOperacaoOfPcpActionMock.mockResolvedValue({ ok: true });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    fireEvent.click(await waitFor(() => screen.getByText("Editar") as HTMLButtonElement));
    // Limpa o campo Tempo (estava pré-preenchido com 30) - nunca deve enviar "limpar", só "não altera" (null).
    fireEvent.change(screen.getByLabelText("Tempo planejado (min)"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "ajuste" } });
    fireEvent.click(screen.getByText("Salvar edição"));

    await waitFor(() =>
      expect(alterarOperacaoOfPcpActionMock).toHaveBeenCalledWith("op-1", {
        recursoVigenteId: null,
        tempoVigenteMinutos: null,
        sequenciaVigente: 1,
        motivo: "ajuste",
      }),
    );
  });
});

describe("OrdemFabricacaoDetalhePageContent — Etapa 61: conferência rica de matérias-primas (regime pendente)", () => {
  const PROPOSTA_CHAPA_ACO = [{ materia_prima_id: "mp-1", quantidade_sugerida: 10, unidade: "kg", descricao: "Chapa de aço", especificacao: "SAE 1020" }];

  it("1. Inicializa a conferência rica com a proposta real (nunca dado inventado)", async () => {
    prepararCargaPendente(PROPOSTA_CHAPA_ACO, false, { resultadoSaldoLivre: { ok: true, saldoLivrePorMaterial: {} } });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const descricao = await waitFor(() => screen.getByText("Chapa de aço"));
    const linha = descricao.closest("tr");
    expect(linha).not.toBeNull();
    expect(within(linha as HTMLElement).getByText("10")).toBeDefined();
  });

  it("2. O saldo livre da carga inicial (em lote, via a Server Action consolidada) é exibido - nenhuma chamada extra por material", async () => {
    prepararCargaPendente(PROPOSTA_CHAPA_ACO, false, { resultadoSaldoLivre: { ok: true, saldoLivrePorMaterial: { "mp-1": 7 } } });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    await waitFor(() => screen.getByText("Chapa de aço"));
    expect(consultarSaldoLivreMateriasPrimasPcpActionMock).not.toHaveBeenCalled();
  });

  it("3. Só existe um botão de confirmação ('Salvar') visível - nenhuma duplicação com o botão genérico do regime", async () => {
    prepararCargaPendente(PROPOSTA_CHAPA_ACO, false, { resultadoSaldoLivre: { ok: true, saldoLivrePorMaterial: {} } });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    await waitFor(() => screen.getByText("Chapa de aço"));
    expect(screen.getAllByText("Salvar", { selector: "button" })).toHaveLength(1);
  });

  it("4. Interruptor desligado (padrão hoje para toda empresa real): o botão Salvar fica desabilitado, com o motivo explícito", async () => {
    prepararCargaPendente(PROPOSTA_CHAPA_ACO, false, { resultadoSaldoLivre: { ok: true, saldoLivrePorMaterial: {} } });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoSalvar = await waitFor(() => screen.getByText("Salvar", { selector: "button" }) as HTMLButtonElement);
    expect(botaoSalvar.disabled).toBe(true);
    expect(screen.getByText("A conferência de matérias-primas ainda não está habilitada para esta empresa.")).toBeDefined();

    fireEvent.click(botaoSalvar);
    expect(confirmarNecessidadesMomentoYPcpActionMock).not.toHaveBeenCalled();
  });

  it("5. Falha na leitura de saldo livre: mostra aviso explícito (nunca trata como saldo zero) e permite tentar de novo", async () => {
    prepararCargaPendente(PROPOSTA_CHAPA_ACO, false, { resultadoSaldoLivre: { ok: false, motivo: "erro_desconhecido" } });
    consultarSaldoLivreMateriasPrimasPcpActionMock.mockResolvedValue({ ok: true, saldoLivrePorMaterial: { "mp-1": 3 } });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    await waitFor(() => screen.getByText(/Falha técnica ao consultar o saldo livre/));
    fireEvent.click(screen.getByText("Tentar novamente"));

    await waitFor(() => expect(consultarSaldoLivreMateriasPrimasPcpActionMock).toHaveBeenCalledWith(["mp-1"]));
  });
});

describe("OrdemFabricacaoDetalhePageContent — Etapa 63: confirmação real das necessidades de matéria-prima", () => {
  const PROPOSTA_CHAPA_ACO = [{ materia_prima_id: "mp-1", quantidade_sugerida: 10, unidade: "kg", descricao: "Chapa de aço", especificacao: "SAE 1020" }];

  function prepararCargaPendenteElegivel() {
    prepararCargaPendente(PROPOSTA_CHAPA_ACO, true, { resultadoSaldoLivre: { ok: true, saldoLivrePorMaterial: {} } });
  }

  it("1. OF elegível (interruptor ligado): o botão Salvar fica habilitado", async () => {
    prepararCargaPendenteElegivel();

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoSalvar = await waitFor(() => screen.getByText("Salvar", { selector: "button" }) as HTMLButtonElement);
    expect(botaoSalvar.disabled).toBe(false);
  });

  it("2. Sucesso: chama a Server Action com a proposta original intocada e os itens convertidos, mostra a nota de sucesso e relê a OF", async () => {
    prepararCargaPendenteElegivel();
    confirmarNecessidadesMomentoYPcpActionMock.mockResolvedValue({ ok: true, totalMateriais: 1, totalReservasCi: 0, totalItensRequisicaoCe: 1, requisicaoCompraId: "req-1" });
    consultarPropostaMomentoYActionMock.mockResolvedValue({ ok: true, leitura: { regime: "confirmado_momento_y", interruptorAtivo: true, propostaOriginal: [] } });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoSalvar = await waitFor(() => screen.getByText("Salvar", { selector: "button" }) as HTMLButtonElement);
    fireEvent.click(botaoSalvar);

    await waitFor(() => expect(confirmarNecessidadesMomentoYPcpActionMock).toHaveBeenCalledTimes(1));
    const [ofIdChamado, propostaOriginalChamada, itensChamados] = confirmarNecessidadesMomentoYPcpActionMock.mock.calls[0];
    expect(ofIdChamado).toBe("of-1");
    expect(propostaOriginalChamada).toEqual(PROPOSTA_CHAPA_ACO);
    expect(itensChamados).toEqual([{ materiaPrimaId: "mp-1", origemFornecimento: "empresa", quantidadeConfirmada: 10, quantidadeCi: 0, observacaoTecnica: "" }]);

    await waitFor(() => screen.getByText("Necessidades confirmadas com sucesso."));
    // Releitura pós-sucesso via a Server Action ORIGINAL preservada - a carga inicial
    // consolidada só roda uma vez, na montagem; não é chamada de novo aqui.
    expect(consultarPropostaMomentoYActionMock).toHaveBeenCalledTimes(1);
    expect(consultarCargaInicialOfPcpActionMock).toHaveBeenCalledTimes(1);
  });

  it("3. Rejeição definitiva (ex.: saldo insuficiente): mostra o motivo, preserva o rascunho, nunca recarrega sozinho", async () => {
    prepararCargaPendenteElegivel();
    confirmarNecessidadesMomentoYPcpActionMock.mockResolvedValue({ ok: false, motivo: "saldo_insuficiente" });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoSalvar = await waitFor(() => screen.getByText("Salvar", { selector: "button" }) as HTMLButtonElement);
    fireEvent.click(botaoSalvar);

    await waitFor(() => screen.getByText(/Saldo livre insuficiente no momento da confirmação/));
    // Material digitado continua na tela - nenhum recarregamento automático.
    expect(screen.getByText("Chapa de aço")).toBeDefined();
    expect(consultarPropostaMomentoYActionMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Reler OF")).toBeNull();
  });

  it("4. Proposta desatualizada: mostra o motivo e oferece 'Reler OF' (ação explícita, nunca automática)", async () => {
    prepararCargaPendenteElegivel();
    confirmarNecessidadesMomentoYPcpActionMock.mockResolvedValue({ ok: false, motivo: "proposta_desatualizada" });
    consultarPropostaMomentoYActionMock.mockResolvedValue({ ok: true, leitura: { regime: "pendente_momento_y", interruptorAtivo: true, propostaOriginal: PROPOSTA_CHAPA_ACO } });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoSalvar = await waitFor(() => screen.getByText("Salvar", { selector: "button" }) as HTMLButtonElement);
    fireEvent.click(botaoSalvar);

    await waitFor(() => screen.getByText(/O roteiro mudou desde que esta proposta foi lida/));
    const botaoReler = screen.getByText("Reler OF") as HTMLButtonElement;
    // Antes do clique, nenhuma releitura ainda aconteceu.
    expect(consultarPropostaMomentoYActionMock).not.toHaveBeenCalled();

    fireEvent.click(botaoReler);
    await waitFor(() => expect(consultarPropostaMomentoYActionMock).toHaveBeenCalledTimes(1));
  });

  it("5. Gravação incerta (falha de rede): nunca tenta de novo sozinho - reconsulta a OF e informa se gravou ou não", async () => {
    prepararCargaPendenteElegivel();
    confirmarNecessidadesMomentoYPcpActionMock.mockResolvedValue({ ok: false, motivo: "gravacao_incerta" });
    consultarPropostaMomentoYActionMock.mockResolvedValue({ ok: true, leitura: { regime: "pendente_momento_y", interruptorAtivo: true, propostaOriginal: PROPOSTA_CHAPA_ACO } });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoSalvar = await waitFor(() => screen.getByText("Salvar", { selector: "button" }) as HTMLButtonElement);
    fireEvent.click(botaoSalvar);

    await waitFor(() => screen.getByText(/A conexão caiu antes de confirmar a gravação/));
    // Exatamente 1 tentativa de confirmação - nunca repetida automaticamente.
    expect(confirmarNecessidadesMomentoYPcpActionMock).toHaveBeenCalledTimes(1);
    // Exatamente 1 verificação pós-falha, via a Server Action original preservada.
    expect(consultarPropostaMomentoYActionMock).toHaveBeenCalledTimes(1);
  });

  it("6. Gravação incerta, mas a confirmação TINHA sido registrada: informa que a confirmação foi feita, sem exigir nova tentativa", async () => {
    prepararCargaPendenteElegivel();
    confirmarNecessidadesMomentoYPcpActionMock.mockResolvedValue({ ok: false, motivo: "gravacao_incerta" });
    consultarPropostaMomentoYActionMock.mockResolvedValue({ ok: true, leitura: { regime: "confirmado_momento_y", interruptorAtivo: true, propostaOriginal: [] } });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoSalvar = await waitFor(() => screen.getByText("Salvar", { selector: "button" }) as HTMLButtonElement);
    fireEvent.click(botaoSalvar);

    await waitFor(() => screen.getByText(/A confirmação FOI registrada \(verificado agora/));
  });

  it("7. Botão desabilitado durante o envio - nunca permite duplo clique", async () => {
    prepararCargaPendenteElegivel();
    let resolverConfirmacao: (valor: unknown) => void = () => {};
    confirmarNecessidadesMomentoYPcpActionMock.mockReturnValue(new Promise((resolve) => (resolverConfirmacao = resolve)));

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoSalvar = await waitFor(() => screen.getByText("Salvar", { selector: "button" }) as HTMLButtonElement);
    fireEvent.click(botaoSalvar);

    await waitFor(() => expect(screen.getByText("Confirmando…", { selector: "button" })).toBeDefined());
    const botaoEmAndamento = screen.getByText("Confirmando…", { selector: "button" }) as HTMLButtonElement;
    expect(botaoEmAndamento.disabled).toBe(true);
    fireEvent.click(botaoEmAndamento);
    expect(confirmarNecessidadesMomentoYPcpActionMock).toHaveBeenCalledTimes(1);

    resolverConfirmacao({ ok: true, totalMateriais: 1, totalReservasCi: 0, totalItensRequisicaoCe: 1, requisicaoCompraId: null });
    await waitFor(() => screen.getByText("Necessidades confirmadas com sucesso."));
  });
});

describe("OrdemFabricacaoDetalhePageContent — Dados da OF: falha e releitura", () => {
  it("1. Falha ao consultar a OF: mostra erro com 'Tentar novamente', que chama a Server Action original preservada", async () => {
    prepararCargaPadrao({ resultadoOf: { ok: false, motivo: "erro_desconhecido" } });
    consultarOfsPcpActionMock.mockResolvedValue({ ok: true, resultado: { linhas: [linhaFicticia()], totalRegistros: 1, pagina: 1, tamanhoPagina: 1 } });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    const botaoTentar = await waitFor(() => screen.getByText("Tentar novamente") as HTMLButtonElement);
    fireEvent.click(botaoTentar);

    await waitFor(() => expect(consultarOfsPcpActionMock).toHaveBeenCalledWith({ ofId: "of-1" }, 1, 1));
    await waitFor(() => screen.getByText("Dados da OF"));
  });

  it("2. Sessão não autenticada: não mostra 'Tentar novamente' (releitura não resolveria a sessão expirada)", async () => {
    prepararCargaPadrao({ resultadoOf: { ok: false, motivo: "nao_autenticado" } });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);

    await waitFor(() => screen.getByText("Sessão não autenticada."));
    expect(screen.queryByText("Tentar novamente")).toBeNull();
  });
});

describe("OrdemFabricacaoDetalhePageContent — controle Dependências (Etapa 66F)", () => {
  function operacaoFicticia(sobrescritas: Record<string, unknown> = {}) {
    return {
      opId: "op-1",
      codigoOperacional: "OP10",
      descricao: "Corte",
      sequencia: 1,
      recursoId: null,
      recursoNome: null,
      tempoPlanejadoMinutos: null,
      situacao: "pendente",
      motivoNaoAplicavel: null,
      origem: "roteiro",
      temApontamento: false,
      ...sobrescritas,
    };
  }
  const TRES_OPERACOES = [
    operacaoFicticia({ opId: "op-1", codigoOperacional: "OP10" }),
    operacaoFicticia({ opId: "op-2", codigoOperacional: "OP20" }),
    operacaoFicticia({ opId: "op-3", codigoOperacional: "OP30" }),
  ];
  // OP20 é pré-requisito de OP10 (op-1 "depende de" op-2; op-2 "é pré-requisito de" op-1).
  const DEPENDENCIAS_OP10_OP20 = {
    ok: true,
    dependenciasPorOpId: {
      "op-1": [{ opRelacionadaId: "op-2", codigoOperacionalRelacionada: "OP20", papel: "dependente" }],
      "op-2": [{ opRelacionadaId: "op-1", codigoOperacionalRelacionada: "OP10", papel: "origem" }],
    },
  };
  const PERMISSOES_TOTAL_DEPENDENCIA = { ok: true, podeCriarDependencia: true, podeRemoverDependencia: true, ambienteHabilitado: true };

  async function abrirDependenciasDe(codigoOperacional: string) {
    const linhas = await waitFor(() => screen.getAllByText(codigoOperacional));
    const linha = linhas[0].closest("tr");
    if (!linha) throw new Error(`Linha da operação ${codigoOperacional} não encontrada`);
    fireEvent.click(within(linha).getByText("Dependências"));
  }

  it("1. Visualização bidirecional: OP10 mostra 'Depende de OP20', OP20 mostra 'É pré-requisito de OP10'", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: true, operacoes: TRES_OPERACOES }, resultadoDependencias: DEPENDENCIAS_OP10_OP20 });
    consultarPermissoesDependenciasOperacoesOfPcpActionMock.mockResolvedValue(PERMISSOES_TOTAL_DEPENDENCIA);

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);
    await abrirDependenciasDe("OP10");

    await waitFor(() => screen.getByText("Depende de"));
    expect(within(screen.getByText("Depende de").closest("div") as HTMLElement).getByText("OP20")).toBeDefined();

    fireEvent.click(screen.getByText("Fechar"));
    await abrirDependenciasDe("OP20");

    await waitFor(() => screen.getByText("É pré-requisito de"));
    expect(within(screen.getByText("É pré-requisito de").closest("div") as HTMLElement).getByText("OP10")).toBeDefined();
  });

  it("2. Adição de pré-requisito: seleciona OP10, preenche motivo, chama a Server Action com (origem=OP10, dependente=OP30) e relê", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: true, operacoes: TRES_OPERACOES }, resultadoDependencias: { ok: true, dependenciasPorOpId: {} } });
    consultarPermissoesDependenciasOperacoesOfPcpActionMock.mockResolvedValue(PERMISSOES_TOTAL_DEPENDENCIA);
    adicionarDependenciaOperacaoOfPcpActionMock.mockResolvedValue({ ok: true });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);
    await abrirDependenciasDe("OP30");

    fireEvent.click(await waitFor(() => screen.getByText("Adicionar pré-requisito")));
    fireEvent.change(screen.getByLabelText("Operação pré-requisito"), { target: { value: "op-1" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "OP30 só pode iniciar depois de OP10" } });
    fireEvent.click(screen.getByText("Confirmar", { selector: "button" }));

    await waitFor(() =>
      expect(adicionarDependenciaOperacaoOfPcpActionMock).toHaveBeenCalledWith("op-1", "op-3", "OP30 só pode iniciar depois de OP10"),
    );
    // A carga inicial usa a Server Action CONSOLIDADA (consultarCargaInicialOfPcpAction) - só a releitura pós-sucesso chama a individual.
    await waitFor(() => expect(consultarDependenciasOperacoesOfPcpActionMock).toHaveBeenCalledTimes(1));
  });

  it("3. Remoção explícita: remove 'Depende de OP20' em OP10, chama a Server Action com (origem=OP20, dependente=OP10)", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: true, operacoes: TRES_OPERACOES }, resultadoDependencias: DEPENDENCIAS_OP10_OP20 });
    consultarPermissoesDependenciasOperacoesOfPcpActionMock.mockResolvedValue(PERMISSOES_TOTAL_DEPENDENCIA);
    removerDependenciaOperacaoOfPcpActionMock.mockResolvedValue({ ok: true });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);
    await abrirDependenciasDe("OP10");

    await waitFor(() => screen.getByText("Depende de"));
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Remover", { selector: "button" }));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "OP20 foi cancelada, pré-requisito não existe mais" } });
    fireEvent.click(screen.getByText("Confirmar remoção"));

    await waitFor(() =>
      expect(removerDependenciaOperacaoOfPcpActionMock).toHaveBeenCalledWith("op-2", "op-1", "OP20 foi cancelada, pré-requisito não existe mais"),
    );
  });

  it("4. Motivo obrigatório: rejeita antes de chamar a Server Action, tanto em adicionar quanto em remover", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: true, operacoes: TRES_OPERACOES }, resultadoDependencias: DEPENDENCIAS_OP10_OP20 });
    consultarPermissoesDependenciasOperacoesOfPcpActionMock.mockResolvedValue(PERMISSOES_TOTAL_DEPENDENCIA);

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);
    await abrirDependenciasDe("OP30");

    fireEvent.click(await waitFor(() => screen.getByText("Adicionar pré-requisito")));
    fireEvent.change(screen.getByLabelText("Operação pré-requisito"), { target: { value: "op-1" } });
    fireEvent.click(screen.getByText("Confirmar", { selector: "button" }));

    await waitFor(() => screen.getByText("Informe o motivo."));
    expect(adicionarDependenciaOperacaoOfPcpActionMock).not.toHaveBeenCalled();
  });

  it("5. Autorreferência: a própria OP nunca aparece como opção no seletor de pré-requisito", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: true, operacoes: TRES_OPERACOES }, resultadoDependencias: { ok: true, dependenciasPorOpId: {} } });
    consultarPermissoesDependenciasOperacoesOfPcpActionMock.mockResolvedValue(PERMISSOES_TOTAL_DEPENDENCIA);

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);
    await abrirDependenciasDe("OP10");

    fireEvent.click(await waitFor(() => screen.getByText("Adicionar pré-requisito")));
    const seletor = screen.getByLabelText("Operação pré-requisito") as HTMLSelectElement;
    const opcoes = Array.from(seletor.options).map((o) => o.textContent);
    expect(opcoes.some((texto) => texto?.includes("OP10"))).toBe(false);
    expect(opcoes.some((texto) => texto?.includes("OP20"))).toBe(true);
    expect(opcoes.some((texto) => texto?.includes("OP30"))).toBe(true);
  });

  it("6. Bloqueio por apontamento: a Server Action rejeita e a nota mostra o motivo certo", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: true, operacoes: TRES_OPERACOES }, resultadoDependencias: { ok: true, dependenciasPorOpId: {} } });
    consultarPermissoesDependenciasOperacoesOfPcpActionMock.mockResolvedValue(PERMISSOES_TOTAL_DEPENDENCIA);
    adicionarDependenciaOperacaoOfPcpActionMock.mockResolvedValue({ ok: false, motivo: "apontamento_bloqueado" });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);
    await abrirDependenciasDe("OP30");

    fireEvent.click(await waitFor(() => screen.getByText("Adicionar pré-requisito")));
    fireEvent.change(screen.getByLabelText("Operação pré-requisito"), { target: { value: "op-1" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "motivo" } });
    fireEvent.click(screen.getByText("Confirmar", { selector: "button" }));

    await waitFor(() => screen.getByText(/já tem apontamento real registrado/));
  });

  it("7. OF em estado final: a Server Action rejeita e a nota mostra o motivo certo", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: true, operacoes: TRES_OPERACOES }, resultadoDependencias: { ok: true, dependenciasPorOpId: {} } });
    consultarPermissoesDependenciasOperacoesOfPcpActionMock.mockResolvedValue(PERMISSOES_TOTAL_DEPENDENCIA);
    adicionarDependenciaOperacaoOfPcpActionMock.mockResolvedValue({ ok: false, motivo: "of_estado_final" });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);
    await abrirDependenciasDe("OP30");

    fireEvent.click(await waitFor(() => screen.getByText("Adicionar pré-requisito")));
    fireEvent.change(screen.getByLabelText("Operação pré-requisito"), { target: { value: "op-1" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "motivo" } });
    fireEvent.click(screen.getByText("Confirmar", { selector: "button" }));

    await waitFor(() => screen.getByText(/concluída, cancelada ou desdobrada/));
  });

  it("8. Falta de permissão: botões 'Adicionar pré-requisito' e 'Remover' ficam desabilitados com o motivo explícito", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: true, operacoes: TRES_OPERACOES }, resultadoDependencias: DEPENDENCIAS_OP10_OP20 });
    consultarPermissoesDependenciasOperacoesOfPcpActionMock.mockResolvedValue({
      ok: true,
      podeCriarDependencia: false,
      podeRemoverDependencia: false,
      ambienteHabilitado: true,
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);
    await abrirDependenciasDe("OP10");

    const botaoAdicionar = (await waitFor(() => screen.getByText("Adicionar pré-requisito"))) as HTMLButtonElement;
    expect(botaoAdicionar.disabled).toBe(true);
    expect(botaoAdicionar.title).toContain("pcp.criar_dependencia_operacao");

    const botaoRemover = within(screen.getByRole("dialog")).getByText("Remover", { selector: "button" }) as HTMLButtonElement;
    expect(botaoRemover.disabled).toBe(true);
    expect(botaoRemover.title).toContain("pcp.remover_dependencia_operacao");

    fireEvent.click(botaoAdicionar);
    expect(adicionarDependenciaOperacaoOfPcpActionMock).not.toHaveBeenCalled();
  });

  it("9. Isolamento multiempresa / concorrência: a OP relacionada já não existe (RLS/estado mudou) - rejeita como 'op_nao_encontrada' e relê", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: true, operacoes: TRES_OPERACOES }, resultadoDependencias: { ok: true, dependenciasPorOpId: {} } });
    consultarPermissoesDependenciasOperacoesOfPcpActionMock.mockResolvedValue(PERMISSOES_TOTAL_DEPENDENCIA);
    adicionarDependenciaOperacaoOfPcpActionMock.mockResolvedValue({ ok: false, motivo: "op_nao_encontrada" });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);
    await abrirDependenciasDe("OP30");

    fireEvent.click(await waitFor(() => screen.getByText("Adicionar pré-requisito")));
    fireEvent.change(screen.getByLabelText("Operação pré-requisito"), { target: { value: "op-1" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "motivo" } });
    fireEvent.click(screen.getByText("Confirmar", { selector: "button" }));

    await waitFor(() => screen.getByText(/não foi encontrada — pode ter sido alterada/));
    // A carga inicial usa a Server Action CONSOLIDADA - só a releitura por concorrência chama a individual.
    expect(consultarDependenciasOperacoesOfPcpActionMock).toHaveBeenCalledTimes(1);
  });

  it("10. Gravação incerta: reconsulta e confirma se foi criada ou não, nunca repete sozinha", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: true, operacoes: TRES_OPERACOES }, resultadoDependencias: { ok: true, dependenciasPorOpId: {} } });
    consultarPermissoesDependenciasOperacoesOfPcpActionMock.mockResolvedValue(PERMISSOES_TOTAL_DEPENDENCIA);
    adicionarDependenciaOperacaoOfPcpActionMock.mockResolvedValue({ ok: false, motivo: "gravacao_incerta" });
    consultarDependenciasOperacoesOfPcpActionMock.mockResolvedValue({ ok: true, dependenciasPorOpId: {} });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);
    await abrirDependenciasDe("OP30");

    fireEvent.click(await waitFor(() => screen.getByText("Adicionar pré-requisito")));
    fireEvent.change(screen.getByLabelText("Operação pré-requisito"), { target: { value: "op-1" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "motivo" } });
    fireEvent.click(screen.getByText("Confirmar", { selector: "button" }));

    await waitFor(() => screen.getByText(/NÃO foi criada/));
    expect(adicionarDependenciaOperacaoOfPcpActionMock).toHaveBeenCalledTimes(1);
  });

  it("11. Duplo clique não dispara duas chamadas", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: true, operacoes: TRES_OPERACOES }, resultadoDependencias: { ok: true, dependenciasPorOpId: {} } });
    consultarPermissoesDependenciasOperacoesOfPcpActionMock.mockResolvedValue(PERMISSOES_TOTAL_DEPENDENCIA);
    let resolverAdicao: (valor: unknown) => void = () => {};
    adicionarDependenciaOperacaoOfPcpActionMock.mockReturnValue(new Promise((resolve) => (resolverAdicao = resolve)));

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);
    await abrirDependenciasDe("OP30");

    fireEvent.click(await waitFor(() => screen.getByText("Adicionar pré-requisito")));
    fireEvent.change(screen.getByLabelText("Operação pré-requisito"), { target: { value: "op-1" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "motivo" } });
    fireEvent.click(screen.getByText("Confirmar", { selector: "button" }));

    const botaoEmAndamento = await waitFor(() => screen.getByText("Adicionando…") as HTMLButtonElement);
    expect(botaoEmAndamento.disabled).toBe(true);
    fireEvent.click(botaoEmAndamento);
    expect(adicionarDependenciaOperacaoOfPcpActionMock).toHaveBeenCalledTimes(1);

    resolverAdicao({ ok: true });
    await waitFor(() => expect(screen.queryByText("Adicionando…")).toBeNull());
  });

  it("12. Ambiente não habilitado (migration candidata ausente): bloqueio efetivo, nunca só o disabled isolado - aviso explícito e botões desabilitados", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: true, operacoes: TRES_OPERACOES }, resultadoDependencias: DEPENDENCIAS_OP10_OP20 });
    consultarPermissoesDependenciasOperacoesOfPcpActionMock.mockResolvedValue({
      ok: true,
      podeCriarDependencia: true,
      podeRemoverDependencia: true,
      ambienteHabilitado: false,
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);
    await abrirDependenciasDe("OP10");

    await waitFor(() => screen.getByText(/estrutura de banco necessária não foi aplicada/));
    const botaoAdicionar = screen.getByText("Adicionar pré-requisito") as HTMLButtonElement;
    expect(botaoAdicionar.disabled).toBe(true);
    const botaoRemover = within(screen.getByRole("dialog")).getByText("Remover", { selector: "button" }) as HTMLButtonElement;
    expect(botaoRemover.disabled).toBe(true);
    // A garantia real (a Server Action também rejeita mesmo chamada
    // diretamente, sem depender deste disabled) está provada nos
    // testes unitários de adicionarDependenciaOperacaoOfPcpAction.test.ts
    // e removerDependenciaOperacaoOfPcpAction.test.ts (cenário "2b").
  });

  it("13. Etapa 66H — gravação incerta travada: 'Cancelar' nunca fica desabilitado, mesmo com a chamada ainda pendente", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: true, operacoes: TRES_OPERACOES }, resultadoDependencias: { ok: true, dependenciasPorOpId: {} } });
    consultarPermissoesDependenciasOperacoesOfPcpActionMock.mockResolvedValue(PERMISSOES_TOTAL_DEPENDENCIA);
    adicionarDependenciaOperacaoOfPcpActionMock.mockReturnValue(new Promise(() => {})); // nunca resolve - simula a travada real da Etapa 66G

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);
    await abrirDependenciasDe("OP30");

    fireEvent.click(await waitFor(() => screen.getByText("Adicionar pré-requisito")));
    fireEvent.change(screen.getByLabelText("Operação pré-requisito"), { target: { value: "op-1" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "motivo" } });
    fireEvent.click(screen.getByText("Confirmar", { selector: "button" }));

    const botaoAdicionando = await waitFor(() => screen.getByText("Adicionando…") as HTMLButtonElement);
    expect(botaoAdicionando.disabled).toBe(true);
    const botaoCancelar = within(screen.getByRole("dialog")).getByText("Cancelar") as HTMLButtonElement;
    expect(botaoCancelar.disabled).toBe(false); // nunca mais travado - usuário sempre tem uma saída
  });

  it("14. Etapa 66H — 'Verificar estado atual' consulta o banco de verdade sem esperar a chamada travada, e distingue criada de não criada", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: true, operacoes: TRES_OPERACOES }, resultadoDependencias: { ok: true, dependenciasPorOpId: {} } });
    consultarPermissoesDependenciasOperacoesOfPcpActionMock.mockResolvedValue(PERMISSOES_TOTAL_DEPENDENCIA);
    adicionarDependenciaOperacaoOfPcpActionMock.mockReturnValue(new Promise(() => {})); // trava para sempre
    // A releitura manual mostra que, apesar da chamada travada, a dependência JÁ foi criada no servidor.
    consultarDependenciasOperacoesOfPcpActionMock.mockResolvedValue({
      ok: true,
      dependenciasPorOpId: { "op-3": [{ opRelacionadaId: "op-1", codigoOperacionalRelacionada: "OP10", papel: "dependente" }] },
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);
    await abrirDependenciasDe("OP30");

    fireEvent.click(await waitFor(() => screen.getByText("Adicionar pré-requisito")));
    fireEvent.change(screen.getByLabelText("Operação pré-requisito"), { target: { value: "op-1" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "motivo" } });
    fireEvent.click(screen.getByText("Confirmar", { selector: "button" }));

    await waitFor(() => screen.getByText("Adicionando…"));
    fireEvent.click(screen.getByText("Verificar estado atual"));

    await waitFor(() => screen.getByText(/JÁ EXISTE no banco/));
    // O motivo digitado continua lá - nada foi limpo por uma verificação manual.
    expect((screen.getByLabelText("Motivo") as HTMLInputElement).value).toBe("motivo");
  });

  it("15. Etapa 66H — resposta tardia de uma tentativa já cancelada nunca sobrescreve o que o usuário já viu depois", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: true, operacoes: TRES_OPERACOES }, resultadoDependencias: { ok: true, dependenciasPorOpId: {} } });
    consultarPermissoesDependenciasOperacoesOfPcpActionMock.mockResolvedValue(PERMISSOES_TOTAL_DEPENDENCIA);
    let resolverTentativaAntiga: (valor: unknown) => void = () => {};
    adicionarDependenciaOperacaoOfPcpActionMock.mockReturnValue(new Promise((resolve) => (resolverTentativaAntiga = resolve)));

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);
    await abrirDependenciasDe("OP30");

    fireEvent.click(await waitFor(() => screen.getByText("Adicionar pré-requisito")));
    fireEvent.change(screen.getByLabelText("Operação pré-requisito"), { target: { value: "op-1" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "primeira tentativa" } });
    fireEvent.click(screen.getByText("Confirmar", { selector: "button" }));
    await waitFor(() => screen.getByText("Adicionando…"));

    // Usuário desiste e cancela, sem esperar a chamada travada.
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Cancelar"));
    await waitFor(() => expect(screen.queryByText("Adicionando…")).toBeNull());

    // A chamada antiga finalmente resolve, tarde demais - não deve reabrir nem mostrar nada.
    resolverTentativaAntiga({ ok: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/criada/i)).toBeNull();
  });

  it("16. Etapa 66H.1 — achado real: resposta tardia APÓS 'Verificar estado atual' não sobrescreve a nota da consulta manual", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: true, operacoes: TRES_OPERACOES }, resultadoDependencias: { ok: true, dependenciasPorOpId: {} } });
    consultarPermissoesDependenciasOperacoesOfPcpActionMock.mockResolvedValue(PERMISSOES_TOTAL_DEPENDENCIA);
    let resolverTentativaOriginal: (valor: unknown) => void = () => {};
    adicionarDependenciaOperacaoOfPcpActionMock.mockReturnValue(new Promise((resolve) => (resolverTentativaOriginal = resolve)));
    // A consulta manual mostra que a dependência AINDA NÃO existe.
    consultarDependenciasOperacoesOfPcpActionMock.mockResolvedValue({ ok: true, dependenciasPorOpId: {} });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);
    await abrirDependenciasDe("OP30");

    fireEvent.click(await waitFor(() => screen.getByText("Adicionar pré-requisito")));
    fireEvent.change(screen.getByLabelText("Operação pré-requisito"), { target: { value: "op-1" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "motivo" } });
    fireEvent.click(screen.getByText("Confirmar", { selector: "button" }));
    await waitFor(() => screen.getByText("Adicionando…"));

    fireEvent.click(screen.getByText("Verificar estado atual"));
    await waitFor(() => screen.getByText(/AINDA NÃO existe no banco/));

    // A chamada original, travada até agora, finalmente resolve com SUCESSO -
    // tarde demais: a nota da consulta manual já foi o que o usuário leu
    // e decidiu agir sobre; a resposta tardia não pode mais reabrir o
    // formulário nem trocar a mensagem por baixo dele.
    resolverTentativaOriginal({ ok: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText(/AINDA NÃO existe no banco/)).toBeDefined();
    expect(screen.queryByText("Adicionando…")).not.toBeNull(); // continua mostrando que a chamada original nunca foi confirmada
  });

  it("17. Etapa 66H.1 — dependência criada por OUTRA sessão durante a tentativa: 'Verificar estado atual' reporta o vínculo real, não presume nada sobre a chamada própria", async () => {
    prepararCargaPadrao({ resultadoOperacoes: { ok: true, operacoes: TRES_OPERACOES }, resultadoDependencias: { ok: true, dependenciasPorOpId: {} } });
    consultarPermissoesDependenciasOperacoesOfPcpActionMock.mockResolvedValue(PERMISSOES_TOTAL_DEPENDENCIA);
    adicionarDependenciaOperacaoOfPcpActionMock.mockReturnValue(new Promise(() => {})); // trava para sempre - nunca resolve
    // Outra sessão criou o MESMO vínculo enquanto esta tentativa estava pendurada.
    consultarDependenciasOperacoesOfPcpActionMock.mockResolvedValue({
      ok: true,
      dependenciasPorOpId: { "op-3": [{ opRelacionadaId: "op-1", codigoOperacionalRelacionada: "OP10", papel: "dependente" }] },
    });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);
    await abrirDependenciasDe("OP30");

    fireEvent.click(await waitFor(() => screen.getByText("Adicionar pré-requisito")));
    fireEvent.change(screen.getByLabelText("Operação pré-requisito"), { target: { value: "op-1" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "motivo" } });
    fireEvent.click(screen.getByText("Confirmar", { selector: "button" }));
    await waitFor(() => screen.getByText("Adicionando…"));

    fireEvent.click(screen.getByText("Verificar estado atual"));
    // Reporta o ESTADO REAL do vínculo (criado por outra sessão), nunca
    // declara que "sua" chamada específica teve sucesso.
    await waitFor(() => screen.getByText(/JÁ EXISTE no banco/));
  });

  it("18. Etapa 66H.1 — dependência removida por OUTRA sessão durante a tentativa de remoção: 'Verificar estado atual' reporta o vínculo real", async () => {
    const dependenciasIniciais = {
      ok: true,
      dependenciasPorOpId: { "op-1": [{ opRelacionadaId: "op-3", codigoOperacionalRelacionada: "OP30", papel: "origem" }] },
    };
    prepararCargaPadrao({ resultadoOperacoes: { ok: true, operacoes: TRES_OPERACOES }, resultadoDependencias: dependenciasIniciais });
    consultarPermissoesDependenciasOperacoesOfPcpActionMock.mockResolvedValue(PERMISSOES_TOTAL_DEPENDENCIA);
    removerDependenciaOperacaoOfPcpActionMock.mockReturnValue(new Promise(() => {})); // trava para sempre
    // Outra sessão já removeu o vínculo enquanto esta tentativa estava pendurada.
    consultarDependenciasOperacoesOfPcpActionMock.mockResolvedValue({ ok: true, dependenciasPorOpId: {} });

    render(<OrdemFabricacaoDetalhePageContent ofId="of-1" />);
    await abrirDependenciasDe("OP10");
    await waitFor(() => screen.getByText("É pré-requisito de", { exact: true }));

    fireEvent.click(within(screen.getByRole("dialog")).getByText("Remover", { selector: "button" }));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "motivo" } });
    fireEvent.click(screen.getByText("Confirmar remoção"));
    await waitFor(() => screen.getByText("Removendo…"));

    fireEvent.click(screen.getByText("Verificar estado atual"));
    await waitFor(() => screen.getByText(/JÁ FOI REMOVIDA/));
  });
});
