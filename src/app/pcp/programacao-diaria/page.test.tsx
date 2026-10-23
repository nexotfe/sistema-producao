/* @vitest-environment jsdom */
// Etapa 2L.1/2L.2: verificação estrutural real do DOM renderizado (jsdom)
// - não substitui uma verificação visual em navegador real (que este
// ambiente não tem disponível), mas confirma com dado real de render:
// identificação de empresa/período/versão, ordem das colunas na tela,
// e as classes de impressão (ocultação de colunas técnicas, quebra de
// página entre recursos diferentes) realmente presentes no DOM.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

const consultarProgramacaoVigentePcpActionMock = vi.fn();
vi.mock("@/modules/pcp/actions/consultarProgramacaoVigentePcpAction", () => ({
  consultarProgramacaoVigentePcpAction: () => consultarProgramacaoVigentePcpActionMock(),
}));

import DailySchedulePage from "./page";
import type { ProgramacaoVigentePcp } from "@/modules/pcp/lib/buscarProgramacaoVigentePcp";

function programacaoFicticia(): ProgramacaoVigentePcp {
  return {
    programacaoId: "programacao-1",
    versaoSequencial: 7,
    empresaCapacidadeVersaoOrigem: 1,
    nomeEmpresa: "Indústria Fictícia Teste LTDA",
    janelaInicio: "2026-11-02",
    janelaFim: "2026-11-08",
    criadaEm: "2026-11-01T10:00:00Z",
    criadaPor: "adm-1",
    motivo: null,
    versaoCapacidadeAtual: 1,
    operacoes: [
      {
        opId: "op-10",
        codigoOperacional: "OP10",
        descricaoOperacao: "Torneamento externo",
        ofId: "of-1",
        numeroOf: "260030-0001",
        projetoId: "projeto-1",
        numeroProjeto: "260030",
        nomeProjeto: "Projeto Prioritário",
        prioridadeUsada: 1,
        statusCalculoMotor: "concluida",
        dataInicioPrevista: "2026-11-02",
        dataFimPrevista: "2026-11-02",
        deficitResidualHorasPadrao: 0,
        alocacoes: [
          { data: "2026-11-02", recursoId: "recurso-torno", nomeRecurso: "Torno CNC 01", natureza: "normal", horasMaquina: 3, horasPadrao: 3 },
        ],
      },
      {
        opId: "op-20",
        codigoOperacional: "OP20",
        descricaoOperacao: "Furação",
        ofId: "of-2",
        numeroOf: "260018-0002",
        projetoId: "projeto-2",
        numeroProjeto: "260018",
        nomeProjeto: "Projeto Secundário",
        prioridadeUsada: 2,
        statusCalculoMotor: "concluida",
        dataInicioPrevista: "2026-11-02",
        dataFimPrevista: "2026-11-02",
        deficitResidualHorasPadrao: 0,
        alocacoes: [
          { data: "2026-11-02", recursoId: "recurso-furadeira", nomeRecurso: "Furadeira 02", natureza: "normal", horasMaquina: 1.5, horasPadrao: 1.5 },
        ],
      },
      {
        opId: "op-30",
        codigoOperacional: "OP30",
        descricaoOperacao: "Inspeção final",
        ofId: "of-3",
        numeroOf: "260018-0003",
        projetoId: "projeto-2",
        numeroProjeto: "260018",
        nomeProjeto: "Projeto Secundário",
        prioridadeUsada: 2,
        statusCalculoMotor: "bloqueada_por_deficit",
        dataInicioPrevista: null,
        dataFimPrevista: null,
        deficitResidualHorasPadrao: 1,
        alocacoes: [],
      },
    ],
  };
}

// Cenário fictício mais rico (Etapa 2L.3): 3 projetos/prioridades,
// numero_of hierárquico (260025-0001-01, já validado na Fase 2), 3
// recursos (Serra/Torno/Centro), um recurso (Torno) com 15 OPs (mais do
// que caberia numa única página impressa), 1 OP em 2 dias, 1 bloqueada.
function programacaoCenarioRico(): ProgramacaoVigentePcp {
  const opsTorno = Array.from({ length: 15 }, (_, i) => ({
    opId: `op-torno-${i}`,
    codigoOperacional: `OP${(i + 1) * 10}`,
    descricaoOperacao: `Operação de torno ${i + 1}`,
    ofId: "of-torno",
    numeroOf: "260025-0001-01",
    projetoId: "projeto-1",
    numeroProjeto: "260025",
    nomeProjeto: "Projeto Prioritário",
    prioridadeUsada: 1,
    statusCalculoMotor: "concluida" as const,
    dataInicioPrevista: "2026-11-02",
    dataFimPrevista: "2026-11-02",
    deficitResidualHorasPadrao: 0,
    alocacoes: [
      { data: "2026-11-02", recursoId: "recurso-torno", nomeRecurso: "Torno CNC 01", natureza: "normal", horasMaquina: 1, horasPadrao: 1 },
    ],
  }));

  return {
    programacaoId: "programacao-rica",
    versaoSequencial: 12,
    empresaCapacidadeVersaoOrigem: 1,
    nomeEmpresa: "Metalúrgica Fictícia Rica LTDA",
    janelaInicio: "2026-11-02",
    janelaFim: "2026-11-08",
    criadaEm: "2026-11-01T10:00:00Z",
    criadaPor: "adm-1",
    motivo: null,
    versaoCapacidadeAtual: 1,
    operacoes: [
      ...opsTorno,
      {
        opId: "op-serra",
        codigoOperacional: "OP05",
        descricaoOperacao: "Corte na serra",
        ofId: "of-serra",
        numeroOf: "260025-0001-02",
        projetoId: "projeto-1",
        numeroProjeto: "260025",
        nomeProjeto: "Projeto Prioritário",
        prioridadeUsada: 1,
        statusCalculoMotor: "concluida",
        dataInicioPrevista: "2026-11-02",
        dataFimPrevista: "2026-11-03",
        deficitResidualHorasPadrao: 0,
        alocacoes: [
          { data: "2026-11-02", recursoId: "recurso-serra", nomeRecurso: "Serra", natureza: "normal", horasMaquina: 4, horasPadrao: 4 },
          { data: "2026-11-03", recursoId: "recurso-serra", nomeRecurso: "Serra", natureza: "normal", horasMaquina: 2, horasPadrao: 2 },
        ],
      },
      {
        opId: "op-centro",
        codigoOperacional: "OP40",
        descricaoOperacao: "Usinagem de acabamento",
        ofId: "of-centro",
        numeroOf: "260018-0002",
        projetoId: "projeto-2",
        numeroProjeto: "260018",
        nomeProjeto: "Projeto Secundário",
        prioridadeUsada: 2,
        statusCalculoMotor: "concluida",
        dataInicioPrevista: "2026-11-02",
        dataFimPrevista: "2026-11-02",
        deficitResidualHorasPadrao: 0,
        alocacoes: [
          { data: "2026-11-02", recursoId: "recurso-centro", nomeRecurso: "Centro de Usinagem", natureza: "normal", horasMaquina: 2.5, horasPadrao: 2.5 },
        ],
      },
      {
        opId: "op-bloqueada",
        codigoOperacional: "OP99",
        descricaoOperacao: "Inspeção dimensional",
        ofId: "of-centro",
        numeroOf: "260018-0002",
        projetoId: "projeto-3",
        numeroProjeto: "260010",
        nomeProjeto: "Projeto Terciário",
        prioridadeUsada: 3,
        statusCalculoMotor: "bloqueada_por_predecessora",
        dataInicioPrevista: null,
        dataFimPrevista: null,
        deficitResidualHorasPadrao: 2,
        alocacoes: [],
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DailySchedulePage (Etapa 2L.3 - verificação de DOM/CSS, nunca visual)", () => {
  it("título da tela e título de impressão são ambos exatamente 'Programação Diária — PCP' (Etapa 2L.4)", async () => {
    consultarProgramacaoVigentePcpActionMock.mockResolvedValue({ ok: true, programacao: programacaoFicticia() });
    render(<DailySchedulePage />);
    // Tela (print:hidden) e impressão (hidden print:block) mostram o mesmo
    // título, exatamente igual (acentuação consistente) - por isso
    // duplicado por design, nunca um único elemento.
    await waitFor(() => expect(screen.getAllByText("Programação Diária — PCP").length).toBe(2));
  });

  it("cenário rico: 3 projetos/prioridades, numero_of hierárquico, 3 recursos, OP em 2 dias e 1 bloqueada - tudo presente", async () => {
    consultarProgramacaoVigentePcpActionMock.mockResolvedValue({ ok: true, programacao: programacaoCenarioRico() });
    render(<DailySchedulePage />);
    await waitFor(() => expect(screen.getByText("OP150")).toBeTruthy());

    // numero_of hierárquico (Fase 2) exibido sem alteração.
    expect(screen.getAllByText("260025-0001-01").length).toBeGreaterThan(0);
    expect(screen.getAllByText("260025-0001-02").length).toBeGreaterThan(0);
    // OP em 2 dias - a mesma OP (código OP05) aparece em 2 grupos de data.
    expect(screen.getAllByText("OP05").length).toBe(2);
    // Bloqueada preservada, separada, com projeto/OF/prioridade corretos.
    expect(screen.getByText("OP99")).toBeTruthy();
    expect(screen.getByText(/Operações bloqueadas/)).toBeTruthy();
  });

  it("Etapa 2L.4: 'Operações bloqueadas' imprime em fundo branco, texto escuro e selo sem cor de fundo", async () => {
    consultarProgramacaoVigentePcpActionMock.mockResolvedValue({ ok: true, programacao: programacaoCenarioRico() });
    const { container } = render(<DailySchedulePage />);
    await waitFor(() => expect(screen.getByText("OP99")).toBeTruthy());

    const tituloBloco = screen.getByText(/Operações bloqueadas/);
    const blocoBloqueadas = tituloBloco.closest("div");
    expect(blocoBloqueadas).toBeTruthy();
    expect(blocoBloqueadas!.className).toContain("print:bg-white");

    const itemBloqueado = blocoBloqueadas!.querySelector("li");
    expect(itemBloqueado).toBeTruthy();
    expect(itemBloqueado!.className).toContain("print:bg-white");
    expect(itemBloqueado!.className).toContain("print:border-slate-300");

    // Selo de status: sem fundo/ring coloridos na impressão, texto escuro legível.
    const selo = Array.from(itemBloqueado!.querySelectorAll("span")).find((span) =>
      span.textContent?.includes("Bloqueada"),
    );
    expect(selo).toBeTruthy();
    expect(selo!.className).toContain("print:bg-transparent");
    expect(selo!.className).toContain("print:ring-0");
    expect(selo!.className).toContain("print:text-slate-950");
    // Mantém o estilo normal de tela (cor), já que só a impressão deve mudar.
    expect(selo!.className).toMatch(/bg-(rose|amber|blue)-50/);

    // Descrição do bloqueio permanece presente e com cor de impressão legível.
    expect(itemBloqueado!.className || blocoBloqueadas!.textContent).toBeTruthy();
    const descricaoOuCodigo = Array.from(itemBloqueado!.querySelectorAll("span")).find(
      (span) => span.textContent === "OP99",
    );
    expect(descricaoOuCodigo).toBeTruthy();
    expect(descricaoOuCodigo!.className).toContain("print:text-slate-950");
  });

  it("cenário rico: recurso com 15 OPs - nenhuma é omitida (equivalente a mais de 1 página impressa)", async () => {
    consultarProgramacaoVigentePcpActionMock.mockResolvedValue({ ok: true, programacao: programacaoCenarioRico() });
    const { container } = render(<DailySchedulePage />);
    await waitFor(() => expect(screen.getByText("OP150")).toBeTruthy());

    for (let i = 1; i <= 15; i++) {
      expect(screen.getAllByText(`OP${i * 10}`).length).toBeGreaterThanOrEqual(1);
    }
    // Todas as linhas do Torno têm a classe que evita corte de linha na impressão.
    const linhasTorno = Array.from(container.querySelectorAll("tbody tr")).filter((tr) =>
      tr.textContent?.includes("Operação de torno"),
    );
    expect(linhasTorno).toHaveLength(15);
    for (const linha of linhasTorno) {
      expect(linha.className).toContain("print:break-inside-avoid");
    }
  });

  it("cenário rico: quebra de página entre os 3 recursos diferentes (Torno, Serra, Centro)", async () => {
    consultarProgramacaoVigentePcpActionMock.mockResolvedValue({ ok: true, programacao: programacaoCenarioRico() });
    const { container } = render(<DailySchedulePage />);
    await waitFor(() => expect(screen.getByText("OP150")).toBeTruthy());

    const linhasDeGrupo = Array.from(container.querySelectorAll("tbody > tr")).filter((tr) =>
      tr.querySelector("td[colspan]"),
    );
    // Ordenação real (data asc, depois nome do recurso): (02,Centro de
    // Usinagem), (02,Serra), (02,Torno CNC 01), (03,Serra) = 4 grupos,
    // nenhum par consecutivo com o mesmo recurso - as 3 transições quebram
    // página (índice 0 nunca quebra, é sempre o primeiro grupo).
    expect(linhasDeGrupo.length).toBe(4);
    expect(linhasDeGrupo[0].className).not.toContain("print:break-before-page");
    const comQuebra = linhasDeGrupo.filter((tr) => tr.className.includes("print:break-before-page"));
    expect(comQuebra.length).toBe(3);
  });
});

describe("DailySchedulePage (Etapa 2L.1/2L.2)", () => {
  it("exibe nome da empresa, período e versão vigente", async () => {
    consultarProgramacaoVigentePcpActionMock.mockResolvedValue({ ok: true, programacao: programacaoFicticia() });
    render(<DailySchedulePage />);

    // Aparece tanto no bloco de tela quanto no bloco de impressão (2 ocorrências) - intencional.
    await waitFor(() => expect(screen.getAllByText(/Indústria Fictícia Teste LTDA/).length).toBeGreaterThanOrEqual(2));
    expect(screen.getAllByText(/2026-11-02 a\s*2026-11-08/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/vigente nº 7/).length).toBeGreaterThanOrEqual(2);
  });

  it("ordena as colunas da tabela com Prioridade antes de Projeto e de OF", async () => {
    consultarProgramacaoVigentePcpActionMock.mockResolvedValue({ ok: true, programacao: programacaoFicticia() });
    const { container } = render(<DailySchedulePage />);
    await waitFor(() => expect(screen.getByText("OP10")).toBeTruthy());

    const cabecalhos = Array.from(container.querySelectorAll("thead th")).map((th) => th.textContent?.trim());
    const indicePrioridade = cabecalhos.findIndex((c) => c?.includes("Prioridade"));
    const indiceProjeto = cabecalhos.findIndex((c) => c === "Projeto");
    const indiceOf = cabecalhos.findIndex((c) => c === "OF");
    expect(indicePrioridade).toBeGreaterThanOrEqual(0);
    expect(indicePrioridade).toBeLessThan(indiceProjeto);
    expect(indiceProjeto).toBeLessThan(indiceOf);
  });

  it("marca Status do cálculo e Ordem (apresentação) como ocultas na impressão (print:hidden)", async () => {
    consultarProgramacaoVigentePcpActionMock.mockResolvedValue({ ok: true, programacao: programacaoFicticia() });
    const { container } = render(<DailySchedulePage />);
    await waitFor(() => expect(screen.getByText("OP10")).toBeTruthy());

    const cabecalhoStatus = Array.from(container.querySelectorAll("thead th")).find((th) =>
      th.textContent?.includes("Status do cálculo"),
    );
    const cabecalhoOrdem = Array.from(container.querySelectorAll("thead th")).find((th) =>
      th.textContent?.includes("Ordem (apresentação)"),
    );
    expect(cabecalhoStatus?.className).toContain("print:hidden");
    expect(cabecalhoOrdem?.className).toContain("print:hidden");
  });

  it("aplica quebra de página só quando o recurso muda em relação ao grupo anterior", async () => {
    consultarProgramacaoVigentePcpActionMock.mockResolvedValue({ ok: true, programacao: programacaoFicticia() });
    const { container } = render(<DailySchedulePage />);
    await waitFor(() => expect(screen.getByText("OP10")).toBeTruthy());

    const linhasDeGrupo = Array.from(container.querySelectorAll("tbody > tr")).filter((tr) =>
      tr.textContent?.includes("—") && tr.querySelector("td[colspan]"),
    );
    // 2 recursos distintos (Torno CNC 01, Furadeira 02) na mesma data -
    // o primeiro grupo nunca quebra página; o segundo (recurso diferente) quebra.
    expect(linhasDeGrupo.length).toBeGreaterThanOrEqual(2);
    expect(linhasDeGrupo[0].className).not.toContain("print:break-before-page");
    expect(linhasDeGrupo[1].className).toContain("print:break-before-page");
  });

  it("preserva a operação bloqueada numa seção própria, sem horas e sem desaparecer", async () => {
    consultarProgramacaoVigentePcpActionMock.mockResolvedValue({ ok: true, programacao: programacaoFicticia() });
    render(<DailySchedulePage />);
    await waitFor(() => expect(screen.getByText(/Operações bloqueadas/)).toBeTruthy());
    expect(screen.getByText("OP30")).toBeTruthy();
  });
});
